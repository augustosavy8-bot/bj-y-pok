-- ============================================================
-- 0036_penales.sql — Minijuego "Penales" (escalera doble-o-nada)
--
-- Ladder/coin-flip con tema de penales. El resultado de cada patada lo decide
-- SIEMPRE el servidor (RPC, SECURITY DEFINER), con el mismo commit-reveal
-- provably-fair que los slots (server_seed + hash al jugar, seed revelada en
-- verify). El saldo se mueve por el ledger de créditos existente
-- (registrar_movimiento_credito), igual que slots/crash.
--
-- Reglas:
--   · Se apuesta X. El pozo arranca en X (se debita al iniciar).
--   · Cada patada: 1 sola tirada de RNG decide gol/atajada con prob_gol (0.48
--     → RTP 96% por escalón). La zona elegida por el jugador NO afecta el
--     resultado (es presentación). La zona del arquero es un valor DERIVADO
--     aparte del mismo stream, puramente cosmético.
--   · Gol → el pozo se duplica; el jugador decide Retirar o Patear de nuevo.
--   · Atajada → pierde el pozo, termina la tanda.
--   · Cap: 10 goles (1024x) → cobro automático.
--   · Timeout 10 min sin acción → auto-cobro del pozo si ya hay goles, o
--     REEMBOLSO de la apuesta si todavía no pateó (nunca se confisca).
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- Ledger: permitir los tipos 'penales' (apuesta/cobro) y 'refund_timeout'
-- (reembolso por timeout antes de la primera patada). Idempotente.
-- ------------------------------------------------------------
alter table public.creditos_movimientos drop constraint if exists creditos_movimientos_tipo_check;
alter table public.creditos_movimientos add constraint creditos_movimientos_tipo_check
  check (tipo = any (array[
    'carga','retiro','buy_in_mesa','cash_out_mesa','ajuste',
    'slots','bonus_buy','crash','penales','refund_timeout'
  ]));

-- ------------------------------------------------------------
-- Config del juego, versionada. La tanda snapshotea prob_gol/cap al iniciar
-- para que verify sea independiente de cambios posteriores de config.
-- ------------------------------------------------------------
create table if not exists public.penales_config (
  version       int  primary key,
  prob_gol      double precision not null check (prob_gol > 0 and prob_gol < 1),
  cap_escalera  int  not null check (cap_escalera > 0),
  apuesta_min   int  not null check (apuesta_min > 0),
  apuesta_max   int  not null check (apuesta_max >= apuesta_min),
  timeout_secs  int  not null default 600,
  active        bool not null default true,
  created_at    timestamptz not null default now()
);

-- Config inicial (v1). bet min/max = mismo rango que los slots (45–10000).
insert into public.penales_config (version, prob_gol, cap_escalera, apuesta_min, apuesta_max, timeout_secs, active)
values (1, 0.48, 10, 45, 10000, 600, true)
on conflict (version) do update set
  prob_gol = excluded.prob_gol, cap_escalera = excluded.cap_escalera,
  apuesta_min = excluded.apuesta_min, apuesta_max = excluded.apuesta_max,
  timeout_secs = excluded.timeout_secs, active = excluded.active;

-- ------------------------------------------------------------
-- Tandas. Una sola abierta por usuario (índice parcial único).
-- kicks: [{i, zona_elegida, resultado('gol'|'atajada'), zona_arquero}]
-- ------------------------------------------------------------
create table if not exists public.penales_tandas (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  estado           text not null default 'esperando_patada'
                     check (estado in ('esperando_patada','esperando_decision','cobrada','perdida','reembolsada')),
  bet              int    not null,
  pozo             bigint not null,
  gols             int    not null default 0,
  config_version   int    not null references public.penales_config(version),
  prob_gol         double precision not null,   -- snapshot de config al iniciar
  cap_escalera     int    not null,             -- snapshot de config al iniciar
  server_seed      text   not null,             -- EN CLARO; se revela en verify
  server_seed_hash text   not null,
  client_seed      text   not null,
  nonce            bigint not null,
  kicks            jsonb  not null default '[]'::jsonb,
  cashout_amount   bigint,                       -- lo acreditado al cerrar (cobro/reembolso)
  cashout_tipo     text,                         -- 'penales' | 'refund_timeout' (marca de cierre)
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists penales_tandas_user_idx on public.penales_tandas(user_id, created_at desc);
-- Una sola tanda abierta por usuario (garantía dura, incluso ante requests en paralelo).
create unique index if not exists penales_una_abierta_por_user
  on public.penales_tandas(user_id)
  where estado in ('esperando_patada','esperando_decision');

-- ============================================================
-- RLS: el usuario lee sólo sus tandas y la config es pública. Todo write pasa
-- por las RPC (SECURITY DEFINER).
-- ============================================================
alter table public.penales_config enable row level security;
alter table public.penales_tandas enable row level security;

drop policy if exists penales_config_select_public on public.penales_config;
create policy penales_config_select_public on public.penales_config
  for select to anon, authenticated using (true);

drop policy if exists penales_tandas_select_own on public.penales_tandas;
create policy penales_tandas_select_own on public.penales_tandas
  for select to authenticated using (user_id = auth.uid());

-- ============================================================
-- penales_u32 — RNG determinístico: uint32 (big-endian) de
-- hmac(sha256, key = "{client}:{nonce}:{suffix}", secret = server_seed).
-- MISMO esquema que slot_build_grid → verificable e idéntico en JS/TS.
-- ============================================================
create or replace function public.penales_u32(
  p_client text, p_nonce bigint, p_suffix text, p_server text
) returns bigint
language sql
immutable
set search_path = public, extensions
as $$
  select get_byte(h,0)::bigint*16777216 + get_byte(h,1)::bigint*65536
       + get_byte(h,2)::bigint*256      + get_byte(h,3)::bigint
  from (select hmac(p_client || ':' || p_nonce::text || ':' || p_suffix, p_server, 'sha256') as h) t;
$$;

-- Zona del arquero (0..5) derivada del stream. En atajada se tira a la zona
-- elegida (presentación). En gol elige una zona DISTINTA a la elegida.
create or replace function public.penales_zona_arquero(
  p_gol bool, p_zona_elegida int, p_u32_z bigint
) returns int
language plpgsql
immutable
set search_path = public
as $$
declare
  v_others int[] := array[]::int[];
  z int;
begin
  if not p_gol then
    return p_zona_elegida;               -- atajada: se tira a donde pateó
  end if;
  for z in 0 .. 5 loop
    if z <> p_zona_elegida then v_others := v_others || z; end if;
  end loop;                               -- 5 zonas distintas a la elegida
  return v_others[(p_u32_z % 5) + 1];     -- arrays 1-based en pg
end;
$$;

-- ============================================================
-- _penales_settle_expired — cierra una tanda vencida (>timeout sin acción),
-- sin confiscar. Idempotente: sólo actúa si sigue abierta (la transición de
-- estado + el crédito ocurren en la misma transacción, bajo advisory lock).
--   esperando_decision → cobra el pozo (tipo 'penales')
--   esperando_patada   → reembolsa la apuesta (tipo 'refund_timeout')
-- ============================================================
create or replace function public._penales_settle_expired(p_tanda public.penales_tandas)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if p_tanda.estado = 'esperando_decision' then
    perform public.registrar_movimiento_credito(
      p_tanda.user_id, 'penales', p_tanda.pozo::int, null, p_tanda.user_id,
      'Cobro automático penales (timeout)', null);
    update public.penales_tandas
      set estado = 'cobrada', cashout_amount = pozo, cashout_tipo = 'penales', updated_at = now()
      where id = p_tanda.id;
  elsif p_tanda.estado = 'esperando_patada' then
    perform public.registrar_movimiento_credito(
      p_tanda.user_id, 'refund_timeout', p_tanda.bet, null, p_tanda.user_id,
      'Reembolso penales (timeout sin patear)', null);
    update public.penales_tandas
      set estado = 'reembolsada', cashout_amount = bet, cashout_tipo = 'refund_timeout', updated_at = now()
      where id = p_tanda.id;
  end if;
end;
$$;

-- Cierra la tanda abierta del usuario si venció. Se llama al tope de cada RPC.
create or replace function public._penales_expire_user(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  t public.penales_tandas%rowtype;
  v_timeout int;
begin
  select * into t from public.penales_tandas
    where user_id = p_user and estado in ('esperando_patada','esperando_decision')
    for update;
  if t.id is null then return; end if;
  select timeout_secs into v_timeout from public.penales_config where version = t.config_version;
  if now() >= t.updated_at + (coalesce(v_timeout, 600) || ' seconds')::interval then
    perform public._penales_settle_expired(t);
  end if;
end;
$$;

-- Barre TODAS las tandas vencidas (para un cron opcional; no hace falta para el
-- flujo normal, que las cierra al vuelo en la próxima interacción del usuario).
create or replace function public.penales_sweep_expired()
returns int
language plpgsql
security definer
set search_path = public, extensions
as $$
declare t public.penales_tandas%rowtype; n int := 0;
begin
  for t in
    select pt.* from public.penales_tandas pt
    join public.penales_config c on c.version = pt.config_version
    where pt.estado in ('esperando_patada','esperando_decision')
      and now() >= pt.updated_at + (c.timeout_secs || ' seconds')::interval
    for update skip locked
  loop
    perform public._penales_settle_expired(t);
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- ============================================================
-- penales_start — abre una tanda. Debita la apuesta al ledger.
-- ============================================================
create or replace function public.penales_start(p_bet int, p_client_seed text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user uuid := auth.uid();
  c public.penales_config%rowtype;
  v_seed text; v_hash text; v_nonce bigint;
  v_id uuid; v_bal int;
begin
  if v_user is null then raise exception 'no_session' using errcode = 'P0001'; end if;
  -- Serializa todo lo del usuario en la transacción (re-entrante con el ledger).
  perform pg_advisory_xact_lock(hashtext(v_user::text));
  -- Cierra cualquier tanda vencida antes de abrir una nueva.
  perform public._penales_expire_user(v_user);

  select * into c from public.penales_config where active = true order by version desc limit 1;
  if c.version is null then raise exception 'sin_config' using errcode = 'P0001'; end if;
  if p_bet < c.apuesta_min or p_bet > c.apuesta_max then
    raise exception 'apuesta_invalida' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.penales_tandas
             where user_id = v_user and estado in ('esperando_patada','esperando_decision')) then
    raise exception 'tanda_abierta' using errcode = 'P0001';
  end if;

  -- commit-reveal + nonce reproducible por usuario
  v_seed  := encode(gen_random_bytes(32), 'hex');
  v_hash  := encode(digest(v_seed, 'sha256'), 'hex');
  select count(*) + 1 into v_nonce from public.penales_tandas where user_id = v_user;

  -- debitar la apuesta (falla acá si no hay saldo → no se crea la tanda)
  v_bal := public.registrar_movimiento_credito(
    v_user, 'penales', -p_bet, null, v_user, 'Apuesta penales', null);

  insert into public.penales_tandas (
    user_id, estado, bet, pozo, gols, config_version, prob_gol, cap_escalera,
    server_seed, server_seed_hash, client_seed, nonce)
  values (
    v_user, 'esperando_patada', p_bet, p_bet, 0, c.version, c.prob_gol, c.cap_escalera,
    v_seed, v_hash, p_client_seed, v_nonce)
  returning id into v_id;

  return jsonb_build_object(
    'tanda_id', v_id, 'estado', 'esperando_patada', 'bet', p_bet, 'pozo', p_bet,
    'gols', 0, 'cap_escalera', c.cap_escalera, 'config_version', c.version,
    'server_seed_hash', v_hash, 'nonce', v_nonce, 'new_balance', v_bal);
end;
$$;

-- ============================================================
-- penales_kick — patea a la zona p_zona (0..5). Único punto de entrada:
-- vale desde 'esperando_patada' (primera patada) y desde 'esperando_decision'
-- (patear de nuevo, arriesgando el pozo). El guard de estado + advisory lock
-- impiden dos patadas en vuelo sobre la misma tanda.
-- ============================================================
create or replace function public.penales_kick(p_zona int)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user uuid := auth.uid();
  t public.penales_tandas%rowtype;
  v_i int; v_u_r bigint; v_res double precision; v_gol bool;
  v_u_z bigint; v_zona_arq int; v_bal int := null;
  v_estado text; v_pozo bigint; v_gols int; v_cap_hit bool := false;
begin
  if v_user is null then raise exception 'no_session' using errcode = 'P0001'; end if;
  if p_zona < 0 or p_zona > 5 then raise exception 'zona_invalida' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtext(v_user::text));
  perform public._penales_expire_user(v_user);

  select * into t from public.penales_tandas
    where user_id = v_user and estado in ('esperando_patada','esperando_decision')
    for update;
  if t.id is null then raise exception 'sin_tanda' using errcode = 'P0001'; end if;

  v_i   := jsonb_array_length(t.kicks);           -- índice de la patada (0-based)
  v_u_r := public.penales_u32(t.client_seed, t.nonce, v_i::text || ':r', t.server_seed);
  v_res := v_u_r / 4294967296.0;                  -- 2^32
  v_gol := v_res < t.prob_gol;                    -- 1 sola tirada decide el resultado
  v_u_z := public.penales_u32(t.client_seed, t.nonce, v_i::text || ':z', t.server_seed);
  v_zona_arq := public.penales_zona_arquero(v_gol, p_zona, v_u_z);  -- cosmético

  if v_gol then
    v_pozo := t.pozo * 2;
    v_gols := t.gols + 1;
    v_cap_hit := v_gols >= t.cap_escalera;
    v_estado := case when v_cap_hit then 'cobrada' else 'esperando_decision' end;
  else
    v_pozo := 0;
    v_gols := t.gols;
    v_estado := 'perdida';
  end if;

  -- persistir la patada
  update public.penales_tandas set
    kicks = kicks || jsonb_build_array(jsonb_build_object(
              'i', v_i, 'zona_elegida', p_zona,
              'resultado', case when v_gol then 'gol' else 'atajada' end,
              'zona_arquero', v_zona_arq)),
    pozo = v_pozo, gols = v_gols, estado = v_estado, updated_at = now(),
    cashout_amount = case when v_cap_hit then v_pozo else cashout_amount end,
    cashout_tipo   = case when v_cap_hit then 'penales' else cashout_tipo end
  where id = t.id;

  -- acreditar sólo si tocó el cap (cobro automático)
  if v_cap_hit then
    v_bal := public.registrar_movimiento_credito(
      v_user, 'penales', v_pozo::int, null, v_user, 'Cobro penales (cap 1024x)', null);
  end if;

  return jsonb_build_object(
    'tanda_id', t.id,
    'kick', v_i,
    'zona_elegida', p_zona,
    'resultado', case when v_gol then 'gol' else 'atajada' end,
    'zona_arquero', v_zona_arq,
    'gols', v_gols,
    'pozo', v_pozo,
    'proximo_pozo', v_pozo * 2,
    'estado', v_estado,
    'cap_alcanzado', v_cap_hit,
    'new_balance', v_bal);
end;
$$;

-- ============================================================
-- penales_cashout — retira el pozo. Sólo post-gol (estado esperando_decision).
-- ============================================================
create or replace function public.penales_cashout()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user uuid := auth.uid();
  t public.penales_tandas%rowtype;
  v_bal int;
begin
  if v_user is null then raise exception 'no_session' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtext(v_user::text));
  perform public._penales_expire_user(v_user);

  select * into t from public.penales_tandas
    where user_id = v_user and estado in ('esperando_patada','esperando_decision')
    for update;
  if t.id is null then raise exception 'sin_tanda' using errcode = 'P0001'; end if;
  if t.estado <> 'esperando_decision' then
    raise exception 'nada_para_cobrar' using errcode = 'P0001';  -- todavía no pateó / no hay gol
  end if;

  v_bal := public.registrar_movimiento_credito(
    v_user, 'penales', t.pozo::int, null, v_user, 'Cobro penales', null);
  update public.penales_tandas
    set estado = 'cobrada', cashout_amount = pozo, cashout_tipo = 'penales', updated_at = now()
    where id = t.id;

  return jsonb_build_object(
    'tanda_id', t.id, 'estado', 'cobrada', 'cobrado', t.pozo, 'gols', t.gols, 'new_balance', v_bal);
end;
$$;

-- ============================================================
-- penales_verify — revela la seed y RECOMPUTA toda la tanda: por cada patada el
-- valor RNG, el umbral (prob_gol), el resultado y la zona del arquero. Prueba
-- que no hubo manipulación. Verificable por cualquiera con el tanda_id.
-- ============================================================
create or replace function public.penales_verify(p_tanda_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  t public.penales_tandas%rowtype;
  v_kicks jsonb := '[]'::jsonb;
  v_ok bool := true;
  k jsonb; v_i int; v_zona int; v_u_r bigint; v_res double precision; v_gol bool;
  v_u_z bigint; v_zona_arq int; v_res_txt text; v_match bool;
begin
  select * into t from public.penales_tandas where id = p_tanda_id;
  if t.id is null then raise exception 'tanda_no_encontrada' using errcode = 'P0001'; end if;

  for k in select * from jsonb_array_elements(t.kicks) loop
    v_i    := (k ->> 'i')::int;
    v_zona := (k ->> 'zona_elegida')::int;
    v_u_r  := public.penales_u32(t.client_seed, t.nonce, v_i::text || ':r', t.server_seed);
    v_res  := v_u_r / 4294967296.0;
    v_gol  := v_res < t.prob_gol;
    v_u_z  := public.penales_u32(t.client_seed, t.nonce, v_i::text || ':z', t.server_seed);
    v_zona_arq := public.penales_zona_arquero(v_gol, v_zona, v_u_z);
    v_res_txt := case when v_gol then 'gol' else 'atajada' end;
    v_match := (v_res_txt = (k ->> 'resultado')) and (v_zona_arq = (k ->> 'zona_arquero')::int);
    if not v_match then v_ok := false; end if;

    v_kicks := v_kicks || jsonb_build_array(jsonb_build_object(
      'i', v_i, 'zona_elegida', v_zona,
      'rng_u32', v_u_r, 'rng_valor', round(v_res::numeric, 8), 'umbral', t.prob_gol,
      'resultado_recomputado', v_res_txt, 'resultado_guardado', k ->> 'resultado',
      'zona_arquero_recomputada', v_zona_arq, 'zona_arquero_guardada', (k ->> 'zona_arquero')::int,
      'match', v_match));
  end loop;

  return jsonb_build_object(
    'tanda_id', t.id,
    'estado', t.estado,
    'config_version', t.config_version,
    'prob_gol', t.prob_gol,
    'cap_escalera', t.cap_escalera,
    'bet', t.bet,
    'pozo_final', t.pozo,
    'gols', t.gols,
    'cashout_amount', t.cashout_amount,
    'cashout_tipo', t.cashout_tipo,
    'nonce', t.nonce,
    'client_seed', t.client_seed,
    'server_seed', t.server_seed,                 -- REVELADO
    'server_seed_hash', t.server_seed_hash,
    'hash_ok', encode(digest(t.server_seed, 'sha256'), 'hex') = t.server_seed_hash,
    'patadas', v_kicks,
    'match', v_ok);
end;
$$;

-- ============================================================
-- Grants: las RPC de juego se llaman con sesión (authenticated). Los helpers
-- internos y el sweep no se exponen a los usuarios.
-- ============================================================
revoke execute on function public.penales_u32(text, bigint, text, text)      from public;
revoke execute on function public.penales_zona_arquero(bool, int, bigint)     from public;
revoke execute on function public._penales_settle_expired(public.penales_tandas) from public;
revoke execute on function public._penales_expire_user(uuid)                  from public;
revoke execute on function public.penales_sweep_expired()                     from public;
revoke execute on function public.penales_start(int, text)                    from public;
revoke execute on function public.penales_kick(int)                           from public;
revoke execute on function public.penales_cashout()                           from public;
revoke execute on function public.penales_verify(uuid)                        from public;

grant execute on function public.penales_start(int, text)  to authenticated;
grant execute on function public.penales_kick(int)         to authenticated;
grant execute on function public.penales_cashout()         to authenticated;
grant execute on function public.penales_verify(uuid)      to authenticated;
grant execute on function public.penales_sweep_expired()   to service_role;
