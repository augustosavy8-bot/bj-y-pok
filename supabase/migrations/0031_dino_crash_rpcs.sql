-- ============================================================
-- 0031_dino_crash_rpcs.sql — Dino Crash · RPCs (SECURITY DEFINER)
--
-- crash_start   : abre ronda (cobra apuesta, compromete seed, calcula crash OCULTO)
-- crash_cashout : retiro. Decide por el multiplicador que vio el cliente vs crash,
--                 con techo por tiempo del server (anti-cheat) y tope de premio.
-- crash_state   : poll. Si ya pasó el tiempo de crash, marca 'busted' y revela el
--                 crash_point (recién ahí). Si sigue viva, NO revela el crash.
-- crash_verify  : prueba provably-fair de una ronda cerrada (revela server_seed y
--                 recomputa el crash_point).
--
-- Propiedad clave: con crash = rtp/(1-U), cobrar a cualquier multiplicador tiene
-- EV = rtp (95%). El cliente NO puede ver el crash mientras la ronda corre, así
-- que ninguna estrategia supera el 95%.
-- ============================================================

-- Deriva el punto de crash de (server_seed, client_seed, nonce) — verificable.
create or replace function public._crash_point(p_server text, p_client text, p_nonce bigint, p_rtp numeric, p_cap numeric)
returns numeric language plpgsql immutable set search_path=public,extensions as $$
declare v_h text; v_u numeric;
begin
  v_h := encode(hmac(p_client || ':' || p_nonce::text, p_server, 'sha256'), 'hex');
  v_u := (('x' || substr(v_h,1,13))::bit(52)::bigint)::numeric / 4503599627370496.0;  -- U ∈ [0,1)
  return greatest(1, least(p_cap, floor( p_rtp / (1 - v_u) * 100 ) / 100 ));
end; $$;

-- ── crash_start ──
create or replace function public.crash_start(p_bet int, p_client_seed text)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare
  v_user uuid := auth.uid(); v_cfg public.crash_config%rowtype;
  v_nonce bigint; v_seed text; v_hash text; v_crash numeric; v_bal bigint; v_id uuid; v_started timestamptz;
begin
  if v_user is null then raise exception 'no_session' using errcode='P0001'; end if;
  if p_client_seed is null or length(p_client_seed)=0 then raise exception 'client_seed_faltante' using errcode='P0001'; end if;
  perform pg_advisory_xact_lock(hashtext(v_user::text));
  select * into v_cfg from public.crash_config where id=1;
  if p_bet < v_cfg.min_bet or p_bet > v_cfg.max_bet then raise exception 'apuesta_invalida' using errcode='P0001'; end if;
  if exists (select 1 from public.crash_rounds where user_id=v_user and status='active') then
    raise exception 'ronda_activa' using errcode='P0001'; end if;

  select count(*)+1 into v_nonce from public.crash_rounds where user_id=v_user;
  v_seed := encode(gen_random_bytes(32),'hex');
  v_hash := encode(digest(v_seed,'sha256'),'hex');
  v_crash := public._crash_point(v_seed, p_client_seed, v_nonce, v_cfg.house_rtp, v_cfg.cap_mult);

  v_bal := public.registrar_movimiento_credito(v_user,'crash',-p_bet,null,v_user,'Apuesta Dino Crash',null);

  insert into public.crash_rounds(user_id,bet,client_seed,server_seed,server_seed_hash,nonce,crash_point,started_at,status,new_balance)
    values (v_user,p_bet,p_client_seed,v_seed,v_hash,v_nonce,v_crash,now(),'active',v_bal)
    returning id, started_at into v_id, v_started;

  return jsonb_build_object('round_id',v_id,'server_seed_hash',v_hash,'growth',v_cfg.growth,
    'max_win',v_cfg.max_win,'bet',p_bet,'new_balance',v_bal,'started_at',extract(epoch from v_started));
end; $$;

-- ── crash_cashout ──
create or replace function public.crash_cashout(p_round_id uuid, p_mult numeric)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare
  v_user uuid := auth.uid(); v_cfg public.crash_config%rowtype; v_r public.crash_rounds%rowtype;
  v_elapsed numeric; v_now numeric; v_ceiling numeric; v_claim numeric; v_win int; v_bal bigint;
begin
  if v_user is null then raise exception 'no_session' using errcode='P0001'; end if;
  select * into v_cfg from public.crash_config where id=1;
  select * into v_r from public.crash_rounds where id=p_round_id for update;
  if v_r.id is null then raise exception 'ronda_no_encontrada' using errcode='P0001'; end if;
  if v_r.user_id <> v_user then raise exception 'no_autorizado' using errcode='P0001'; end if;
  if v_r.status <> 'active' then
    return jsonb_build_object('result',v_r.status,'crash_point',v_r.crash_point,'mult',v_r.cashout_mult,
      'win',v_r.win,'new_balance',public.saldo_actual(v_user),'already',true);
  end if;

  v_elapsed := extract(epoch from (now() - v_r.started_at));
  v_now := exp(v_cfg.growth * v_elapsed);          -- multiplicador autoritativo del server
  v_ceiling := v_now * 1.03;                        -- gracia de 3% por latencia
  v_claim := least(greatest(coalesce(p_mult,1), 1), v_ceiling);

  if v_claim < v_r.crash_point then
    v_win := least( round(v_r.bet * v_claim)::int, v_cfg.max_win );
    v_bal := public.registrar_movimiento_credito(v_user,'crash',v_win,null,v_user,'Premio Dino Crash',null);
    update public.crash_rounds set status='cashed', cashout_mult=v_claim, win=v_win, settled_at=now(), new_balance=v_bal
      where id=v_r.id;
    return jsonb_build_object('result','cashed','mult',v_claim,'win',v_win,'crash_point',v_r.crash_point,'new_balance',v_bal);
  else
    update public.crash_rounds set status='busted', win=0, settled_at=now() where id=v_r.id;
    return jsonb_build_object('result','busted','crash_point',v_r.crash_point,'win',0,'new_balance',public.saldo_actual(v_user));
  end if;
end; $$;

-- ── crash_state (poll) ──
create or replace function public.crash_state(p_round_id uuid)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare
  v_user uuid := auth.uid(); v_cfg public.crash_config%rowtype; v_r public.crash_rounds%rowtype;
  v_elapsed numeric; v_now numeric;
begin
  if v_user is null then raise exception 'no_session' using errcode='P0001'; end if;
  select * into v_cfg from public.crash_config where id=1;
  select * into v_r from public.crash_rounds where id=p_round_id for update;
  if v_r.id is null then raise exception 'ronda_no_encontrada' using errcode='P0001'; end if;
  if v_r.user_id <> v_user then raise exception 'no_autorizado' using errcode='P0001'; end if;

  if v_r.status <> 'active' then
    return jsonb_build_object('status',v_r.status,'crash_point',v_r.crash_point,'win',v_r.win,'mult',v_r.cashout_mult);
  end if;

  v_elapsed := extract(epoch from (now() - v_r.started_at));
  v_now := exp(v_cfg.growth * v_elapsed);
  if v_now >= v_r.crash_point then
    update public.crash_rounds set status='busted', win=0, settled_at=now() where id=v_r.id;
    return jsonb_build_object('status','busted','crash_point',v_r.crash_point,'win',0);
  end if;
  -- sigue viva: NO se revela el crash_point
  return jsonb_build_object('status','active','mult',round(v_now::numeric,2),'elapsed',round(v_elapsed,3));
end; $$;

-- ── crash_verify (provably fair, sólo rondas cerradas) ──
create or replace function public.crash_verify(p_round_id uuid)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare v_cfg public.crash_config%rowtype; v_r public.crash_rounds%rowtype; v_recomp numeric;
begin
  select * into v_cfg from public.crash_config where id=1;
  select * into v_r from public.crash_rounds where id=p_round_id;
  if v_r.id is null then raise exception 'ronda_no_encontrada' using errcode='P0001'; end if;
  if v_r.status = 'active' then raise exception 'ronda_en_curso' using errcode='P0001'; end if;
  v_recomp := public._crash_point(v_r.server_seed, v_r.client_seed, v_r.nonce, v_cfg.house_rtp, v_cfg.cap_mult);
  return jsonb_build_object(
    'round_id',v_r.id,'nonce',v_r.nonce,'client_seed',v_r.client_seed,
    'server_seed',v_r.server_seed,'server_seed_hash',v_r.server_seed_hash,
    'hash_ok', encode(digest(v_r.server_seed,'sha256'),'hex') = v_r.server_seed_hash,
    'crash_point',v_r.crash_point,'crash_recomputed',v_recomp,'match', v_recomp = v_r.crash_point,
    'status',v_r.status,'cashout_mult',v_r.cashout_mult,'win',v_r.win);
end; $$;

revoke execute on function public.crash_start(int,text)        from public;
revoke execute on function public.crash_cashout(uuid,numeric)   from public;
revoke execute on function public.crash_state(uuid)             from public;
revoke execute on function public.crash_verify(uuid)            from public;
grant  execute on function public.crash_start(int,text)        to authenticated;
grant  execute on function public.crash_cashout(uuid,numeric)   to authenticated;
grant  execute on function public.crash_state(uuid)             to authenticated;
grant  execute on function public.crash_verify(uuid)            to authenticated;
