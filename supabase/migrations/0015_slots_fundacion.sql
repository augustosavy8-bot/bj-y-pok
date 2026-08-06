-- ============================================================
-- 0015_slots_fundacion.sql — Fundación reutilizable de SLOTS (multi-slot)
--
-- El resultado del giro lo decide SIEMPRE el servidor (RPC play_spin en
-- Postgres, SECURITY DEFINER). El cliente sólo anima los rodillos hasta la
-- grilla devuelta. Provably-fair con commit-reveal de semilla:
--   - server_seed_hash se muestra al jugar (compromiso).
--   - server_seed se revela en /verify (revelación) para recomputar la grilla.
--
-- SALDO: NO hay tabla `wallets`. El saldo es el ledger de créditos existente
-- (creditos_movimientos). play_spin mueve el saldo real vía
-- registrar_movimiento_credito (tipo 'slots'), el MISMO saldo de póker/BJ.
--
-- Cada slot nuevo = 1 fila en `slots` + N filas en `slot_symbols` + un tema en
-- el front. Los pesos/valores de slot_symbols SON el RTP (tunéable sin código).
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- Permitir el tipo de movimiento 'slots' en el ledger de créditos.
-- (Normaliza el CHECK sea cual sea su estado actual; idempotente.)
-- ------------------------------------------------------------
alter table public.creditos_movimientos
  drop constraint if exists creditos_movimientos_tipo_check;
alter table public.creditos_movimientos
  add constraint creditos_movimientos_tipo_check
  check (tipo in ('carga','retiro','buy_in_mesa','cash_out_mesa','ajuste','slots'));

-- ------------------------------------------------------------
-- Config del slot (agnóstico al tema)
-- ------------------------------------------------------------
create table if not exists public.slots (
  slug         text primary key,
  name         text not null,
  tagline      text,
  reels        int  not null default 5,
  rows         int  not null default 3,
  paylines     jsonb not null,          -- array de líneas; cada línea = array de índices de fila, largo = reels
  bet_options  int[] not null,          -- {45,90,180,450}
  factor       jsonb not null,          -- {"3":1,"4":2,"5":6}
  mult_config  jsonb not null,          -- {"x3":0.03,"x2":0.12}
  freespins    jsonb not null,          -- {"trigger":"wild","min":3,"grant":3}
  active       bool not null default true,
  created_at   timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Símbolos + paytable de cada slot. weight/value definen el RTP.
-- ------------------------------------------------------------
create table if not exists public.slot_symbols (
  slot_slug text not null references public.slots(slug) on delete cascade,
  symbol    text not null,
  value     int  not null,
  weight    int  not null check (weight > 0),
  is_wild   bool not null default false,
  sort      int,
  primary key (slot_slug, symbol)
);

-- ------------------------------------------------------------
-- Giros gratis adeudados por (usuario, slot).
-- ------------------------------------------------------------
create table if not exists public.slot_free_balance (
  user_id    uuid not null references auth.users(id) on delete cascade,
  slot_slug  text not null references public.slots(slug) on delete cascade,
  free_spins int  not null default 0 check (free_spins >= 0),
  primary key (user_id, slot_slug)
);

-- ------------------------------------------------------------
-- Ledger completo de giros (para replay/verificación provably-fair).
-- server_seed se guarda EN CLARO; se revela recién en /verify.
-- ------------------------------------------------------------
create table if not exists public.spins (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  slot_slug        text not null references public.slots(slug),
  bet              int  not null,
  was_free         bool not null default false,
  grid             jsonb not null,
  wins             jsonb not null,
  total_win        int  not null default 0,
  mult             int  not null default 1,
  free_awarded     int  not null default 0,
  server_seed      text not null,
  server_seed_hash text not null,
  client_seed      text not null,
  nonce            bigint not null,
  new_balance      bigint not null,
  created_at       timestamptz not null default now()
);
create index if not exists spins_user_slot_idx on public.spins(user_id, slot_slug, created_at desc);

-- ============================================================
-- RLS
-- ============================================================
alter table public.slots             enable row level security;
alter table public.slot_symbols      enable row level security;
alter table public.slot_free_balance enable row level security;
alter table public.spins             enable row level security;

-- slots / slot_symbols: SELECT público (para leer config y paytable). Sin write público.
drop policy if exists slots_select_public on public.slots;
create policy slots_select_public on public.slots
  for select to anon, authenticated using (true);

drop policy if exists slot_symbols_select_public on public.slot_symbols;
create policy slot_symbols_select_public on public.slot_symbols
  for select to anon, authenticated using (true);

-- slot_free_balance / spins: el usuario SELECCIONA sólo sus propias filas.
-- No hay policies de write: TODO cambio pasa por play_spin (SECURITY DEFINER).
drop policy if exists slot_free_balance_select_own on public.slot_free_balance;
create policy slot_free_balance_select_own on public.slot_free_balance
  for select to authenticated using (user_id = auth.uid());

drop policy if exists spins_select_own on public.spins;
create policy spins_select_own on public.spins
  for select to authenticated using (user_id = auth.uid());

-- ============================================================
-- SEED — slot #1 'el-salon' (RTP ≈ 65.6% / casa ≈ 34%)
-- ============================================================
insert into public.slots (slug, name, tagline, reels, rows, paylines, bet_options, factor, mult_config, freespins, active)
values (
  'el-salon', 'El Salón', '5 rodillos · 9 líneas', 5, 3,
  '[[1,1,1,1,1],[0,0,0,0,0],[2,2,2,2,2],[0,1,2,1,0],[2,1,0,1,2],[0,0,1,2,2],[2,2,1,0,0],[1,0,1,2,1],[1,2,1,0,1]]'::jsonb,
  '{45,90,180,450}',
  '{"3":1,"4":2,"5":6}'::jsonb,
  '{"x3":0.03,"x2":0.12}'::jsonb,
  '{"trigger":"wild","min":3,"grant":3}'::jsonb,
  true
)
on conflict (slug) do update set
  name = excluded.name, tagline = excluded.tagline, reels = excluded.reels, rows = excluded.rows,
  paylines = excluded.paylines, bet_options = excluded.bet_options, factor = excluded.factor,
  mult_config = excluded.mult_config, freespins = excluded.freespins, active = excluded.active;

insert into public.slot_symbols (slot_slug, symbol, value, weight, is_wild, sort) values
  ('el-salon', 'club',  3,  6, false, 1),
  ('el-salon', 'diam',  4,  5, false, 2),
  ('el-salon', 'heart', 6,  4, false, 3),
  ('el-salon', 'spade', 8,  3, false, 4),
  ('el-salon', 'moon',  13, 2, false, 5),
  ('el-salon', 'seven', 18, 1, false, 6),
  ('el-salon', 'wild',  18, 1, true,  7)
on conflict (slot_slug, symbol) do update set
  value = excluded.value, weight = excluded.weight, is_wild = excluded.is_wild, sort = excluded.sort;

-- ============================================================
-- slot_build_grid — RNG determinístico y reproducible por celda.
-- Devuelve la grilla como jsonb: grid[reel][row] (array de columnas).
-- Es la ÚNICA fuente de la grilla: la usan play_spin (al jugar) y
-- verify_spin (al recomputar), así la verificación es exacta.
-- ============================================================
create or replace function public.slot_build_grid(
  p_slot        text,
  p_client_seed text,
  p_nonce       bigint,
  p_server_seed text
) returns jsonb
language plpgsql
stable
set search_path = public, extensions
as $$
declare
  v_reels int; v_rows int;
  v_syms  text[]; v_wts int[]; v_total bigint;
  v_grid  jsonb := '[]'::jsonb;
  v_col   jsonb;
  r int; c int; k int;
  h bytea; u bigint; tgt bigint; acc bigint; i int; pick text;
begin
  select reels, rows into v_reels, v_rows from public.slots where slug = p_slot;
  if v_reels is null then raise exception 'slot_no_encontrado' using errcode = 'P0001'; end if;

  -- Símbolos en orden estable (sort, symbol). El orden importa: fija el mapeo
  -- peso→símbolo, y por eso el resultado es reproducible.
  select array_agg(symbol order by coalesce(sort, 0), symbol),
         array_agg(weight order by coalesce(sort, 0), symbol),
         sum(weight)
    into v_syms, v_wts, v_total
  from public.slot_symbols where slot_slug = p_slot;

  for r in 0 .. v_reels - 1 loop
    v_col := '[]'::jsonb;
    for c in 0 .. v_rows - 1 loop
      k := r * v_rows + c;
      h := hmac(p_client_seed || ':' || p_nonce::text || ':' || k::text, p_server_seed, 'sha256');
      -- primeros 4 bytes como uint32 (big-endian)
      u := get_byte(h, 0)::bigint * 16777216
         + get_byte(h, 1)::bigint * 65536
         + get_byte(h, 2)::bigint * 256
         + get_byte(h, 3)::bigint;
      -- elegir símbolo por peso contra el acumulado
      tgt := u % v_total;
      acc := 0;
      pick := v_syms[array_length(v_syms, 1)]; -- fallback defensivo
      for i in 1 .. array_length(v_syms, 1) loop
        acc := acc + v_wts[i];
        if tgt < acc then pick := v_syms[i]; exit; end if;
      end loop;
      v_col := v_col || to_jsonb(pick);
    end loop;
    v_grid := v_grid || jsonb_build_array(v_col);
  end loop;

  return v_grid;
end;
$$;

-- ============================================================
-- play_spin — FUENTE DE VERDAD. Un giro completo en una transacción.
--   auth.uid() identifica al usuario (llamar con el cliente SSR del usuario).
-- ============================================================
create or replace function public.play_spin(
  p_slot        text,
  p_bet         int,
  p_client_seed text
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user uuid := auth.uid();
  -- config del slot
  v_reels int; v_rows int; v_paylines jsonb; v_bets int[];
  v_factor jsonb; v_multcfg jsonb; v_freecfg jsonb;
  v_wild text; v_topsym text; v_valmap jsonb;
  -- provably-fair
  v_server_seed text; v_hash text; v_nonce bigint;
  -- resultado
  v_grid jsonb; v_wins jsonb := '[]'::jsonb;
  v_base int := 0; v_mult int := 1; v_total int := 0;
  v_free_awarded int := 0; v_free_remaining int := 0; v_was_free bool := false;
  v_new_balance bigint;
  v_spin_id uuid;
  -- evaluación
  v_numlines int; li int; rr int; row_idx int; cell text; anchor text;
  v_count int; v_pay int; v_val int; v_cells jsonb; v_started bool;
  v_xm double precision; v_x3 double precision; v_x2 double precision;
  v_trig text; v_min int; v_grant int; v_trigcount int;
  hm bytea;
begin
  if v_user is null then raise exception 'no_session' using errcode = 'P0001'; end if;

  -- Serializa TODOS los giros del mismo usuario durante la transacción (misma
  -- clave que registrar_movimiento_credito, re-entrante): evita carreras en el
  -- saldo de giros gratis y nonces duplicados ante doble clic / requests en paralelo.
  perform pg_advisory_xact_lock(hashtext(v_user::text));

  -- a) config + validaciones
  select reels, rows, paylines, bet_options, factor, mult_config, freespins
    into v_reels, v_rows, v_paylines, v_bets, v_factor, v_multcfg, v_freecfg
  from public.slots where slug = p_slot and active = true;
  if v_reels is null then raise exception 'slot_no_encontrado' using errcode = 'P0001'; end if;
  if not (p_bet = any (v_bets)) then raise exception 'apuesta_invalida' using errcode = 'P0001'; end if;

  select symbol into v_wild from public.slot_symbols where slot_slug = p_slot and is_wild limit 1;
  select symbol into v_topsym from public.slot_symbols where slot_slug = p_slot order by value desc, symbol limit 1;
  select jsonb_object_agg(symbol, value) into v_valmap from public.slot_symbols where slot_slug = p_slot;

  -- b) ¿giro gratis? Si hay saldo de free spins, se usa uno y NO se cobra.
  select free_spins into v_count from public.slot_free_balance where user_id = v_user and slot_slug = p_slot;
  if coalesce(v_count, 0) > 0 then
    v_was_free := true;
    update public.slot_free_balance set free_spins = free_spins - 1
      where user_id = v_user and slot_slug = p_slot;
  end if;

  -- c) commit-reveal de semilla + nonce reproducible
  v_server_seed := encode(gen_random_bytes(32), 'hex');
  v_hash := encode(digest(v_server_seed, 'sha256'), 'hex');
  select count(*) + 1 into v_nonce from public.spins where user_id = v_user and slot_slug = p_slot;

  -- d) grilla (RNG determinístico por celda)
  v_grid := public.slot_build_grid(p_slot, p_client_seed, v_nonce, v_server_seed);

  -- e) evaluar cada payline: iguales consecutivos desde el rodillo 0, con wild
  --    sustituyendo a cualquiera. count>=3 paga.
  v_numlines := jsonb_array_length(v_paylines);
  for li in 0 .. v_numlines - 1 loop
    -- ancla: primer no-wild de la línea; si son todos wild, el de mayor value
    anchor := null; v_started := true;
    for rr in 0 .. v_reels - 1 loop
      row_idx := (v_paylines -> li ->> rr)::int;
      cell := (v_grid -> rr) ->> row_idx;
      if anchor is null and cell <> v_wild then anchor := cell; end if;
    end loop;
    if anchor is null then anchor := v_topsym; end if; -- línea toda wild

    -- contar consecutivos desde el rodillo 0 (wild o == ancla)
    v_count := 0;
    for rr in 0 .. v_reels - 1 loop
      row_idx := (v_paylines -> li ->> rr)::int;
      cell := (v_grid -> rr) ->> row_idx;
      if cell = v_wild or cell = anchor then v_count := v_count + 1; else exit; end if;
    end loop;

    if v_count >= 3 then
      v_val := (v_valmap ->> anchor)::int;
      v_pay := round( (p_bet::numeric / v_numlines) * v_val * (v_factor ->> v_count::text)::numeric )::int;
      v_base := v_base + v_pay;
      -- celdas ganadoras (para iluminar en el front)
      v_cells := '[]'::jsonb;
      for rr in 0 .. v_count - 1 loop
        row_idx := (v_paylines -> li ->> rr)::int;
        v_cells := v_cells || jsonb_build_array(jsonb_build_array(rr, row_idx));
      end loop;
      v_wins := v_wins || jsonb_build_array(jsonb_build_object(
        'line', li, 'symbol', anchor, 'count', v_count, 'pay', v_pay, 'cells', v_cells
      ));
    end if;
  end loop;

  -- f) multiplicador (sólo si hubo premio base)
  if v_base > 0 then
    hm := hmac(p_client_seed || ':' || v_nonce::text || ':mult', v_server_seed, 'sha256');
    v_xm := ( get_byte(hm,0)::bigint*16777216 + get_byte(hm,1)::bigint*65536
            + get_byte(hm,2)::bigint*256 + get_byte(hm,3)::bigint ) / 4294967296.0;
    v_x3 := (v_multcfg ->> 'x3')::double precision;
    v_x2 := (v_multcfg ->> 'x2')::double precision;
    if v_xm < v_x3 then v_mult := 3;
    elsif v_xm < v_x3 + v_x2 then v_mult := 2;
    else v_mult := 1;
    end if;
  end if;
  v_total := v_base * v_mult;

  -- g) giros gratis: contar el símbolo trigger en TODA la grilla
  v_trig  := v_freecfg ->> 'trigger';
  v_min   := (v_freecfg ->> 'min')::int;
  v_grant := (v_freecfg ->> 'grant')::int;
  v_trigcount := 0;
  for rr in 0 .. v_reels - 1 loop
    for row_idx in 0 .. v_rows - 1 loop
      if ((v_grid -> rr) ->> row_idx) = v_trig then v_trigcount := v_trigcount + 1; end if;
    end loop;
  end loop;
  if v_trigcount >= v_min then
    v_free_awarded := v_grant;
    insert into public.slot_free_balance (user_id, slot_slug, free_spins)
      values (v_user, p_slot, v_grant)
      on conflict (user_id, slot_slug) do update
        set free_spins = public.slot_free_balance.free_spins + excluded.free_spins;
  end if;

  -- h) mover el saldo REAL por el ledger de créditos (tipo 'slots').
  --    registrar_movimiento_credito toma su propio advisory lock (re-entrante).
  if not v_was_free then
    v_new_balance := public.registrar_movimiento_credito(
      v_user, 'slots', -p_bet, null, v_user, 'Apuesta slot ' || p_slot, null);
  end if;
  if v_total > 0 then
    v_new_balance := public.registrar_movimiento_credito(
      v_user, 'slots', v_total, null, v_user, 'Premio slot ' || p_slot, null);
  end if;
  if v_new_balance is null then
    v_new_balance := public.saldo_actual(v_user); -- giro gratis sin premio
  end if;

  select coalesce(free_spins, 0) into v_free_remaining
    from public.slot_free_balance where user_id = v_user and slot_slug = p_slot;

  -- insertar el ledger del giro (server_seed EN CLARO; se revela en /verify)
  insert into public.spins (user_id, slot_slug, bet, was_free, grid, wins, total_win, mult,
                            free_awarded, server_seed, server_seed_hash, client_seed, nonce, new_balance)
  values (v_user, p_slot, p_bet, v_was_free, v_grid, v_wins, v_total, v_mult,
          v_free_awarded, v_server_seed, v_hash, p_client_seed, v_nonce, v_new_balance)
  returning id into v_spin_id;

  -- i) devolver SIN server_seed en claro (sólo el hash; se revela en /verify)
  return jsonb_build_object(
    'spin_id', v_spin_id,
    'grid', v_grid,
    'wins', v_wins,
    'total_win', v_total,
    'mult', v_mult,
    'was_free', v_was_free,
    'free_awarded', v_free_awarded,
    'free_remaining', coalesce(v_free_remaining, 0),
    'new_balance', v_new_balance,
    'server_seed_hash', v_hash,
    'nonce', v_nonce
  );
end;
$$;

-- ============================================================
-- verify_spin — revela el server_seed y recomputa la grilla para probar que
-- no fue manipulada. Verificable por cualquiera con el spin_id.
-- ============================================================
create or replace function public.verify_spin(p_spin_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v spins%rowtype;
  v_recomputed jsonb;
begin
  select * into v from public.spins where id = p_spin_id;
  if v.id is null then raise exception 'spin_no_encontrado' using errcode = 'P0001'; end if;

  v_recomputed := public.slot_build_grid(v.slot_slug, v.client_seed, v.nonce, v.server_seed);

  return jsonb_build_object(
    'spin_id', v.id,
    'slot', v.slot_slug,
    'nonce', v.nonce,
    'client_seed', v.client_seed,
    'server_seed', v.server_seed,                 -- REVELADO
    'server_seed_hash', v.server_seed_hash,
    'hash_ok', encode(digest(v.server_seed, 'sha256'), 'hex') = v.server_seed_hash,
    'grid', v.grid,
    'grid_recomputed', v_recomputed,
    'match', v_recomputed = v.grid
  );
end;
$$;

-- ============================================================
-- Grants: los RPC se llaman SIEMPRE con sesión (authenticated). Se revoca el
-- grant PUBLIC por defecto (que incluye anon) y se otorga sólo a authenticated.
-- ============================================================
revoke execute on function public.play_spin(text, int, text)               from public;
revoke execute on function public.verify_spin(uuid)                         from public;
revoke execute on function public.slot_build_grid(text, text, bigint, text) from public;
grant  execute on function public.play_spin(text, int, text)               to authenticated;
grant  execute on function public.verify_spin(uuid)                         to authenticated;
grant  execute on function public.slot_build_grid(text, text, bigint, text) to authenticated;
