-- ============================================================
-- 0033_dino_crash_compartido_rpcs.sql — RPCs de la ronda compartida
--
-- _crash_open_round : abre una ronda nueva (seed comprometido, crash oculto)
-- _crash_advance    : scheduler perezoso. Avanza la ronda actual según el reloj:
--                     betting → running → crashed → (nueva) betting. Al crashear
--                     liquida como perdidas las apuestas que no se retiraron.
-- crash_tick        : POLL. Devuelve el estado público de la ronda actual (sin
--                     revelar el crash salvo que ya haya crasheado) + mi apuesta.
-- crash_bet         : apostar en la ventana de apuestas de la ronda actual.
-- crash_cashout     : retirar. Si mi apuesta sigue viva y la ronda corre, gano al
--                     multiplicador compartido (con techo por tiempo y tope 200k).
-- crash_verify      : provably fair de una ronda ya crasheada.
--
-- Todos usan un advisory lock global para serializar el avance de la ronda.
-- ============================================================

create or replace function public._crash_open_round(p_nonce bigint, p_start timestamptz)
returns public.crash_rounds language plpgsql security definer set search_path=public,extensions as $$
declare c public.crash_config%rowtype; v_seed text; v_hash text; v_cp numeric; r public.crash_rounds%rowtype;
begin
  select * into c from public.crash_config where id=1;
  v_seed := encode(gen_random_bytes(32),'hex');
  v_hash := encode(digest(v_seed,'sha256'),'hex');
  v_cp := public._crash_point(v_seed, 'nocturna', p_nonce, c.house_rtp, c.cap_mult);
  insert into public.crash_rounds(nonce,server_seed,server_seed_hash,crash_point,phase,betting_ends_at,created_at)
    values (p_nonce, v_seed, v_hash, v_cp, 'betting', p_start + (c.betting_secs || ' seconds')::interval, now())
    returning * into r;
  return r;
end; $$;

create or replace function public._crash_advance()
returns public.crash_rounds language plpgsql security definer set search_path=public,extensions as $$
declare c public.crash_config%rowtype; r public.crash_rounds%rowtype; v_crash_at timestamptz; guard int := 0;
begin
  perform pg_advisory_xact_lock(759123481);   -- serializa el avance global
  select * into c from public.crash_config where id=1;
  select * into r from public.crash_rounds order by nonce desc limit 1;
  if not found then r := public._crash_open_round(1, now()); end if;

  loop
    guard := guard + 1; exit when guard > 6;

    if r.phase = 'betting' and now() >= r.betting_ends_at then
      update public.crash_rounds set phase='running', running_started_at=r.betting_ends_at where id=r.id;
      r.phase := 'running'; r.running_started_at := r.betting_ends_at;
    end if;

    if r.phase = 'running' then
      v_crash_at := r.running_started_at + ((ln(r.crash_point)/c.growth)::double precision) * interval '1 second';
      if now() >= v_crash_at then
        update public.crash_rounds set phase='crashed', crashed_at=v_crash_at where id=r.id;
        update public.crash_bets set status='lost' where round_id=r.id and status='active';
        r.phase := 'crashed'; r.crashed_at := v_crash_at;
      end if;
    end if;

    if r.phase = 'crashed' and now() >= r.crashed_at + (c.crash_hold || ' seconds')::interval then
      r := public._crash_open_round(r.nonce + 1, r.crashed_at + (c.crash_hold || ' seconds')::interval);
      continue;
    end if;

    exit;
  end loop;
  return r;
end; $$;

-- ── crash_tick (poll) ──
create or replace function public.crash_tick()
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare v_user uuid := auth.uid(); c public.crash_config%rowtype; r public.crash_rounds%rowtype;
        b public.crash_bets%rowtype; v_mult numeric := 1; v_mine jsonb := null;
begin
  select * into c from public.crash_config where id=1;
  r := public._crash_advance();
  if r.phase='running' then
    v_mult := round(exp(c.growth * extract(epoch from (now()-r.running_started_at)))::numeric, 2);
  end if;
  if v_user is not null then
    select * into b from public.crash_bets where round_id=r.id and user_id=v_user;
    if found then v_mine := jsonb_build_object('bet',b.bet,'status',b.status,'cashout_mult',b.cashout_mult,'win',b.win); end if;
  end if;
  return jsonb_build_object(
    'round_id',r.id,'nonce',r.nonce,'phase',r.phase,'hash',r.server_seed_hash,
    'server_now',extract(epoch from now()),
    'betting_ends_at',extract(epoch from r.betting_ends_at),
    'running_started_at',extract(epoch from r.running_started_at),
    'crashed_at',extract(epoch from r.crashed_at),
    'mult',v_mult,
    'crash_point', case when r.phase='crashed' then r.crash_point else null end,
    'growth',c.growth,'betting_secs',c.betting_secs,'crash_hold',c.crash_hold,
    'max_win',c.max_win,'min_bet',c.min_bet,'max_bet',c.max_bet,'bet_options',c.bet_options,
    'my_bet',v_mine);
end; $$;

-- ── crash_bet ──
create or replace function public.crash_bet(p_bet int)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare v_user uuid := auth.uid(); c public.crash_config%rowtype; r public.crash_rounds%rowtype; v_bal bigint;
begin
  if v_user is null then raise exception 'no_session' using errcode='P0001'; end if;
  select * into c from public.crash_config where id=1;
  r := public._crash_advance();
  if r.phase <> 'betting' or now() >= r.betting_ends_at then raise exception 'apuestas_cerradas' using errcode='P0001'; end if;
  if p_bet < c.min_bet or p_bet > c.max_bet then raise exception 'apuesta_invalida' using errcode='P0001'; end if;
  if exists (select 1 from public.crash_bets where round_id=r.id and user_id=v_user) then
    raise exception 'ya_apostaste' using errcode='P0001'; end if;

  v_bal := public.registrar_movimiento_credito(v_user,'crash',-p_bet,null,v_user,'Apuesta Dino Crash',null);
  insert into public.crash_bets(round_id,user_id,bet,status) values (r.id,v_user,p_bet,'active');
  return jsonb_build_object('round_id',r.id,'nonce',r.nonce,'bet',p_bet,'new_balance',v_bal,
    'betting_ends_at',extract(epoch from r.betting_ends_at),'server_now',extract(epoch from now()));
end; $$;

-- ── crash_cashout ──
create or replace function public.crash_cashout(p_mult numeric)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare v_user uuid := auth.uid(); c public.crash_config%rowtype; r public.crash_rounds%rowtype;
        b public.crash_bets%rowtype; v_now numeric; v_ceiling numeric; v_claim numeric; v_win int; v_bal bigint;
begin
  if v_user is null then raise exception 'no_session' using errcode='P0001'; end if;
  select * into c from public.crash_config where id=1;
  perform public._crash_advance();   -- liquida perdidas si ya crasheó
  select * into b from public.crash_bets where user_id=v_user and status='active' order by created_at desc limit 1 for update;
  if not found then
    select * into b from public.crash_bets where user_id=v_user order by created_at desc limit 1;
    if b.id is null then raise exception 'sin_apuesta' using errcode='P0001'; end if;
    return jsonb_build_object('result',b.status,'win',b.win,'mult',b.cashout_mult,'new_balance',public.saldo_actual(v_user));
  end if;

  select * into r from public.crash_rounds where id=b.round_id;
  if r.phase = 'betting' then raise exception 'ronda_no_empezo' using errcode='P0001'; end if;
  if r.phase = 'crashed' then
    update public.crash_bets set status='lost' where id=b.id;
    return jsonb_build_object('result','lost','win',0,'new_balance',public.saldo_actual(v_user));
  end if;

  -- corriendo: la apuesta sigue viva ⇒ me retiré a tiempo. Gano al multiplicador
  -- compartido (con techo por tiempo del server por latencia) y tope de premio.
  v_now := exp(c.growth * extract(epoch from (now()-r.running_started_at)));
  v_ceiling := v_now * 1.03;
  v_claim := least(greatest(coalesce(p_mult,1), 1), v_ceiling, v_now);
  v_win := least( round(b.bet * v_claim)::int, c.max_win );
  v_bal := public.registrar_movimiento_credito(v_user,'crash',v_win,null,v_user,'Premio Dino Crash',null);
  update public.crash_bets set status='cashed', cashout_mult=v_claim, win=v_win where id=b.id;
  return jsonb_build_object('result','cashed','mult',round(v_claim,2),'win',v_win,'new_balance',v_bal);
end; $$;

-- ── crash_verify ──
create or replace function public.crash_verify(p_round_id uuid)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare c public.crash_config%rowtype; r public.crash_rounds%rowtype; v_recomp numeric;
begin
  select * into c from public.crash_config where id=1;
  select * into r from public.crash_rounds where id=p_round_id;
  if r.id is null then raise exception 'ronda_no_encontrada' using errcode='P0001'; end if;
  if r.phase <> 'crashed' then raise exception 'ronda_en_curso' using errcode='P0001'; end if;
  v_recomp := public._crash_point(r.server_seed, 'nocturna', r.nonce, c.house_rtp, c.cap_mult);
  return jsonb_build_object('round_id',r.id,'nonce',r.nonce,'server_seed',r.server_seed,
    'server_seed_hash',r.server_seed_hash,
    'hash_ok', encode(digest(r.server_seed,'sha256'),'hex') = r.server_seed_hash,
    'crash_point',r.crash_point,'crash_recomputed',v_recomp,'match', v_recomp = r.crash_point);
end; $$;

revoke execute on function public.crash_tick()            from public;
revoke execute on function public.crash_bet(int)          from public;
revoke execute on function public.crash_cashout(numeric)  from public;
revoke execute on function public.crash_verify(uuid)      from public;
grant  execute on function public.crash_tick()            to authenticated;
grant  execute on function public.crash_bet(int)          to authenticated;
grant  execute on function public.crash_cashout(numeric)  to authenticated;
grant  execute on function public.crash_verify(uuid)      to authenticated;
