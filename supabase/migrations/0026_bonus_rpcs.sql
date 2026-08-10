-- ============================================================
-- 0026_bonus_rpcs.sql — play_spin en modo bonus + buy_bonus(tier)  (Parte 3)
--
-- Free spins ahora viven en bonus_sessions (natural o buy). Durante una sesión
-- activa: apuesta bloqueada, sin cobro, pago = round(líneas × scale × total_mult),
-- el total_mult crece con cada giro ganador (cap max) y NO se resetea; el ×2/×3
-- aleatorio queda DESACTIVADO. Retrigger: scatters>=min suma +round(grant/2),
-- cap 30. Al agotar los giros, la sesión pasa a 'completed'. verify_spin sigue
-- funcionando (cada giro de bonus se registra en `spins` con su commit-reveal).
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
  v_reels int; v_rows int; v_paylines jsonb; v_bets int[];
  v_factor jsonb; v_multcfg jsonb; v_freecfg jsonb;
  v_wild text; v_topsym text; v_valmap jsonb;
  v_server_seed text; v_hash text; v_nonce bigint;
  v_grid jsonb; v_wins jsonb := '[]'::jsonb;
  v_base int := 0; v_mult int := 1; v_total int := 0;
  v_free_awarded int := 0; v_free_remaining int := 0; v_was_free bool := false;
  v_new_balance bigint; v_spin_id uuid;
  v_numlines int; li int; rr int; row_idx int; cell text; anchor text;
  v_count int; v_pay int; v_val int; v_cells jsonb;
  v_xm double precision; v_x3 double precision; v_x2 double precision;
  v_trig text; v_min int; v_grant int; v_trigcount int;
  hm bytea;
  v_bet int;
  -- bonus
  v_sess public.bonus_sessions%rowtype; v_in_bonus bool := false;
  v_pm jsonb; v_pm_start numeric; v_pm_inc numeric; v_pm_max numeric;
  v_buyscale numeric; v_natscale numeric; v_tiers jsonb;
  v_scale numeric; v_inc numeric; v_applied_mult numeric := 1; v_new_mult numeric := 1;
  v_pago_base numeric := 0; v_pago_base_int int := 0;
  v_spins_total int; v_bonus_ended bool := false; v_started bool := false;
  v_result jsonb;
begin
  if v_user is null then raise exception 'no_session' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtext(v_user::text));

  select reels, rows, paylines, bet_options, factor, mult_config, freespins
    into v_reels, v_rows, v_paylines, v_bets, v_factor, v_multcfg, v_freecfg
  from public.slots where slug = p_slot and active = true;
  if v_reels is null then raise exception 'slot_no_encontrado' using errcode = 'P0001'; end if;

  select symbol into v_wild from public.slot_symbols where slot_slug = p_slot and is_wild limit 1;
  select symbol into v_topsym from public.slot_symbols where slot_slug = p_slot order by value desc, symbol limit 1;
  select jsonb_object_agg(symbol, value) into v_valmap from public.slot_symbols where slot_slug = p_slot;

  v_trig := v_freecfg ->> 'trigger';
  v_min  := coalesce((v_freecfg ->> 'min')::int, 3);
  v_grant:= coalesce((v_freecfg ->> 'grant')::int, 5);
  v_pm   := coalesce(v_freecfg -> 'persistent_mult', '{"start":1,"increment":1,"max":50}'::jsonb);
  v_pm_start := coalesce((v_pm ->> 'start')::numeric, 1);
  v_pm_inc   := coalesce((v_pm ->> 'increment')::numeric, 1);
  v_pm_max   := coalesce((v_pm ->> 'max')::numeric, 50);
  v_buyscale := coalesce((v_freecfg ->> 'bonus_factor_scale')::numeric, 1);
  v_natscale := coalesce((v_freecfg ->> 'natural_factor_scale')::numeric, 1);
  v_tiers    := v_freecfg -> 'buy_tiers';

  -- ¿sesión de bonus activa?
  select * into v_sess from public.bonus_sessions
    where user_id = v_user and slot_slug = p_slot and status = 'active' for update;
  if found then
    v_in_bonus := true; v_was_free := true; v_bet := v_sess.bet_locked;
  else
    if not (p_bet = any (v_bets)) then raise exception 'apuesta_invalida' using errcode = 'P0001'; end if;
    v_bet := p_bet;
  end if;

  -- commit-reveal + grilla
  v_server_seed := encode(gen_random_bytes(32), 'hex');
  v_hash := encode(digest(v_server_seed, 'sha256'), 'hex');
  select count(*) + 1 into v_nonce from public.spins where user_id = v_user and slot_slug = p_slot;
  v_grid := public.slot_build_grid(p_slot, p_client_seed, v_nonce, v_server_seed);

  -- evaluar líneas (suma base, sin multiplicador)
  v_numlines := jsonb_array_length(v_paylines);
  for li in 0 .. v_numlines - 1 loop
    anchor := null;
    for rr in 0 .. v_reels - 1 loop
      row_idx := (v_paylines -> li ->> rr)::int; cell := (v_grid -> rr) ->> row_idx;
      if anchor is null and cell <> v_wild then anchor := cell; end if;
    end loop;
    if anchor is null then anchor := v_topsym; end if;
    v_count := 0;
    for rr in 0 .. v_reels - 1 loop
      row_idx := (v_paylines -> li ->> rr)::int; cell := (v_grid -> rr) ->> row_idx;
      if cell = v_wild or cell = anchor then v_count := v_count + 1; else exit; end if;
    end loop;
    if v_count >= 3 then
      v_val := (v_valmap ->> anchor)::int;
      v_pay := round( (v_bet::numeric / v_numlines) * v_val * (v_factor ->> v_count::text)::numeric )::int;
      v_base := v_base + v_pay;
      v_cells := '[]'::jsonb;
      for rr in 0 .. v_count - 1 loop
        row_idx := (v_paylines -> li ->> rr)::int;
        v_cells := v_cells || jsonb_build_array(jsonb_build_array(rr, row_idx));
      end loop;
      v_wins := v_wins || jsonb_build_array(jsonb_build_object(
        'line', li, 'symbol', anchor, 'count', v_count, 'pay', v_pay, 'cells', v_cells));
    end if;
  end loop;

  -- contar scatters (para trigger / retrigger)
  v_trigcount := 0;
  for rr in 0 .. v_reels - 1 loop
    for row_idx in 0 .. v_rows - 1 loop
      if ((v_grid -> rr) ->> row_idx) = v_trig then v_trigcount := v_trigcount + 1; end if;
    end loop;
  end loop;

  if v_in_bonus then
    -- ── modo bonus ──
    v_scale := case when v_sess.source = 'buy' then v_buyscale else v_natscale end;
    v_pago_base := v_base * v_scale;
    v_pago_base_int := round(v_pago_base)::int;
    v_applied_mult := v_sess.total_multiplier;
    v_total := round(v_pago_base * v_applied_mult)::int;
    -- crecer el multiplicador si el giro pagó
    if v_pago_base > 0 then
      if v_sess.source = 'buy' and v_tiers is not null and v_sess.tier is not null then
        v_inc := coalesce((v_tiers -> v_sess.tier ->> 'mult_increment')::numeric, v_pm_inc);
      else
        v_inc := v_pm_inc;
      end if;
      v_new_mult := least(v_pm_max, v_sess.total_multiplier + v_inc);
    else
      v_new_mult := v_sess.total_multiplier;
    end if;
    -- retrigger
    v_spins_total := v_sess.spins_total;
    if v_trigcount >= v_min then v_spins_total := least(30, v_spins_total + round(v_grant / 2.0)::int); end if;
    v_bonus_ended := (v_sess.spins_played + 1) >= v_spins_total;
    update public.bonus_sessions set
      spins_played = v_sess.spins_played + 1,
      spins_total = v_spins_total,
      total_multiplier = v_new_mult,
      total_win = total_win + v_total,
      status = case when v_bonus_ended then 'completed' else 'active' end
    where id = v_sess.id;
    v_mult := v_applied_mult::int;
    v_free_remaining := v_spins_total - (v_sess.spins_played + 1);
  else
    -- ── juego base ──
    if v_base > 0 then
      hm := hmac(p_client_seed || ':' || v_nonce::text || ':mult', v_server_seed, 'sha256');
      v_xm := ( get_byte(hm,0)::bigint*16777216 + get_byte(hm,1)::bigint*65536
              + get_byte(hm,2)::bigint*256 + get_byte(hm,3)::bigint ) / 4294967296.0;
      v_x3 := coalesce((v_multcfg ->> 'x3')::double precision, 0.03);
      v_x2 := coalesce((v_multcfg ->> 'x2')::double precision, 0.12);
      if v_xm < v_x3 then v_mult := 3; elsif v_xm < v_x3 + v_x2 then v_mult := 2; else v_mult := 1; end if;
    end if;
    v_total := v_base * v_mult;
    -- trigger natural → crear sesión (source natural)
    if v_trigcount >= v_min then
      insert into public.bonus_sessions (user_id, slot_slug, source, tier, bet_locked, cost, spins_total, total_multiplier, status)
        values (v_user, p_slot, 'natural', null, v_bet, 0, v_grant, v_pm_start, 'active')
        on conflict do nothing;
      if found then v_started := true; v_free_awarded := v_grant; end if;
    end if;
  end if;

  -- ledger
  if not v_was_free then
    v_new_balance := public.registrar_movimiento_credito(v_user, 'slots', -p_bet, null, v_user, 'Apuesta slot ' || p_slot, null);
  end if;
  if v_total > 0 then
    v_new_balance := public.registrar_movimiento_credito(v_user, 'slots', v_total, null, v_user,
      case when v_in_bonus then 'Premio bonus ' else 'Premio slot ' end || p_slot, null);
  end if;
  if v_new_balance is null then v_new_balance := public.saldo_actual(v_user); end if;

  insert into public.spins (user_id, slot_slug, bet, was_free, grid, wins, total_win, mult,
                            free_awarded, server_seed, server_seed_hash, client_seed, nonce, new_balance)
  values (v_user, p_slot, v_bet, v_was_free, v_grid, v_wins, v_total, v_mult,
          v_free_awarded, v_server_seed, v_hash, p_client_seed, v_nonce, v_new_balance)
  returning id into v_spin_id;

  v_result := jsonb_build_object(
    'spin_id', v_spin_id, 'grid', v_grid, 'wins', v_wins,
    'total_win', v_total, 'mult', v_mult, 'was_free', v_was_free,
    'free_awarded', v_free_awarded, 'free_remaining', v_free_remaining,
    'new_balance', v_new_balance, 'server_seed_hash', v_hash, 'nonce', v_nonce,
    'in_bonus', v_in_bonus, 'bet_locked', v_bet
  );

  if v_in_bonus then
    v_result := v_result || jsonb_build_object(
      'bonus_source', v_sess.source, 'bonus_tier', v_sess.tier,
      'pago_base', v_pago_base_int, 'pago_final', v_total,
      'mult_applied', v_applied_mult, 'total_multiplier', v_new_mult,
      'spins_remaining', v_free_remaining, 'bonus_ended', v_bonus_ended);
    if v_bonus_ended then
      v_result := v_result || jsonb_build_object('bonus_summary', jsonb_build_object(
        'total_win', v_sess.total_win + v_total, 'final_mult', v_new_mult,
        'spins', v_sess.spins_played + 1, 'source', v_sess.source, 'tier', v_sess.tier));
    end if;
  elsif v_started then
    v_result := v_result || jsonb_build_object(
      'bonus_started', true, 'bonus_source', 'natural',
      'total_multiplier', v_pm_start, 'spins_remaining', v_grant, 'bet_locked', v_bet);
  end if;

  return v_result;
end;
$$;

-- ── buy_bonus(slot, bet, tier) ──
create or replace function public.buy_bonus(
  p_slot text,
  p_bet  int,
  p_tier text
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user uuid := auth.uid();
  v_bets int[]; v_freecfg jsonb; v_tiers jsonb; v_tier jsonb;
  v_price_x int; v_spins int; v_mult_start numeric;
  v_price int; v_new_balance int;
begin
  if v_user is null then raise exception 'no_session' using errcode = 'P0001'; end if;
  if p_tier not in ('standard','super','max') then raise exception 'tier_invalido' using errcode = 'P0001'; end if;

  select bet_options, freespins into v_bets, v_freecfg from public.slots where slug = p_slot and active = true;
  if v_bets is null then raise exception 'slot_no_encontrado' using errcode = 'P0001'; end if;
  if not (p_bet = any (v_bets)) then raise exception 'apuesta_invalida' using errcode = 'P0001'; end if;

  v_tiers := v_freecfg -> 'buy_tiers';
  v_tier := v_tiers -> p_tier;
  if v_tier is null then raise exception 'tier_no_config' using errcode = 'P0001'; end if;
  v_price_x   := (v_tier ->> 'price_x')::int;
  v_spins     := (v_tier ->> 'spins')::int;
  v_mult_start:= (v_tier ->> 'mult_start')::numeric;

  perform pg_advisory_xact_lock(hashtext(v_user::text));

  if exists (select 1 from public.bonus_sessions where user_id = v_user and slot_slug = p_slot and status = 'active') then
    raise exception 'bonus_ya_activo' using errcode = 'P0001';
  end if;

  v_price := v_price_x * p_bet;
  v_new_balance := public.registrar_movimiento_credito(
    v_user, 'bonus_buy', -v_price, null, v_user, 'Bonus ' || p_tier || ' ' || p_slot, null);

  insert into public.bonus_sessions (user_id, slot_slug, source, tier, bet_locked, cost, spins_total, total_multiplier, status)
    values (v_user, p_slot, 'buy', p_tier, p_bet, v_price, v_spins, v_mult_start, 'active');

  return jsonb_build_object(
    'ok', true, 'tier', p_tier, 'price', v_price, 'spins', v_spins,
    'bet_locked', p_bet, 'total_multiplier', v_mult_start, 'new_balance', v_new_balance);
end;
$$;

revoke execute on function public.buy_bonus(text, int, text) from public;
grant  execute on function public.buy_bonus(text, int, text) to authenticated;
