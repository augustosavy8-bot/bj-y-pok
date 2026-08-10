-- ============================================================
-- 0022_slots_freespins_lock_bet.sql — Bloquear la apuesta de los giros gratis
--
-- BUG/exploit: los giros gratis no recordaban la apuesta con la que se crearon;
-- usaban la apuesta que el jugador tuviera puesta al girar. Así se podían
-- comprar giros baratos (apuesta 45) y cobrarlos a apuesta 10.000.
--
-- Fix: slot_free_balance guarda la apuesta BLOQUEADA del lote de giros gratis.
--   - play_spin: en un giro gratis usa esa apuesta (no la del front) para pagar.
--   - al ganar la feature (trigger): bloquea a la apuesta del giro que la disparó.
--   - buy_free_spins: bloquea a la apuesta de compra; no deja comprar a otra
--     apuesta si ya hay giros pendientes.
-- Backfill: los giros ya existentes se fijan a 45 (la apuesta mínima = lo que
-- razonablemente se pagó), neutralizando el exploit en curso.
-- ============================================================

alter table public.slot_free_balance add column if not exists bet int;
update public.slot_free_balance set bet = 45 where bet is null;

-- ── play_spin con apuesta efectiva (bloqueada en giros gratis) ──
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
  v_new_balance bigint;
  v_spin_id uuid;
  v_numlines int; li int; rr int; row_idx int; cell text; anchor text;
  v_count int; v_pay int; v_val int; v_cells jsonb; v_started bool;
  v_xm double precision; v_x3 double precision; v_x2 double precision;
  v_trig text; v_min int; v_grant int; v_trigcount int;
  hm bytea;
  v_bet int; v_locked_bet int; v_free_bet int;
begin
  if v_user is null then raise exception 'no_session' using errcode = 'P0001'; end if;

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

  -- b) ¿giro gratis? Si hay saldo, se usa uno, NO se cobra y se paga a la
  --    apuesta BLOQUEADA del lote (no a la del front).
  select free_spins, bet into v_count, v_locked_bet
    from public.slot_free_balance where user_id = v_user and slot_slug = p_slot;
  if coalesce(v_count, 0) > 0 then
    v_was_free := true;
    v_bet := coalesce(v_locked_bet, p_bet);
    update public.slot_free_balance set free_spins = free_spins - 1
      where user_id = v_user and slot_slug = p_slot;
  else
    v_bet := p_bet;
  end if;

  -- c) commit-reveal de semilla + nonce reproducible
  v_server_seed := encode(gen_random_bytes(32), 'hex');
  v_hash := encode(digest(v_server_seed, 'sha256'), 'hex');
  select count(*) + 1 into v_nonce from public.spins where user_id = v_user and slot_slug = p_slot;

  -- d) grilla
  v_grid := public.slot_build_grid(p_slot, p_client_seed, v_nonce, v_server_seed);

  -- e) evaluar cada payline (usa la apuesta EFECTIVA v_bet)
  v_numlines := jsonb_array_length(v_paylines);
  for li in 0 .. v_numlines - 1 loop
    anchor := null; v_started := true;
    for rr in 0 .. v_reels - 1 loop
      row_idx := (v_paylines -> li ->> rr)::int;
      cell := (v_grid -> rr) ->> row_idx;
      if anchor is null and cell <> v_wild then anchor := cell; end if;
    end loop;
    if anchor is null then anchor := v_topsym; end if;

    v_count := 0;
    for rr in 0 .. v_reels - 1 loop
      row_idx := (v_paylines -> li ->> rr)::int;
      cell := (v_grid -> rr) ->> row_idx;
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
        'line', li, 'symbol', anchor, 'count', v_count, 'pay', v_pay, 'cells', v_cells
      ));
    end if;
  end loop;

  -- f) multiplicador
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

  -- g) giros gratis por trigger: se bloquean a la apuesta EFECTIVA del giro.
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
    insert into public.slot_free_balance (user_id, slot_slug, free_spins, bet)
      values (v_user, p_slot, v_grant, v_bet)
      on conflict (user_id, slot_slug) do update
        set free_spins = public.slot_free_balance.free_spins + excluded.free_spins,
            bet = excluded.bet;
  end if;

  -- h) mover el saldo REAL por el ledger (cobra sólo si NO fue giro gratis).
  if not v_was_free then
    v_new_balance := public.registrar_movimiento_credito(
      v_user, 'slots', -p_bet, null, v_user, 'Apuesta slot ' || p_slot, null);
  end if;
  if v_total > 0 then
    v_new_balance := public.registrar_movimiento_credito(
      v_user, 'slots', v_total, null, v_user, 'Premio slot ' || p_slot, null);
  end if;
  if v_new_balance is null then
    v_new_balance := public.saldo_actual(v_user);
  end if;

  select coalesce(free_spins, 0), bet into v_free_remaining, v_free_bet
    from public.slot_free_balance where user_id = v_user and slot_slug = p_slot;

  insert into public.spins (user_id, slot_slug, bet, was_free, grid, wins, total_win, mult,
                            free_awarded, server_seed, server_seed_hash, client_seed, nonce, new_balance)
  values (v_user, p_slot, v_bet, v_was_free, v_grid, v_wins, v_total, v_mult,
          v_free_awarded, v_server_seed, v_hash, p_client_seed, v_nonce, v_new_balance)
  returning id into v_spin_id;

  return jsonb_build_object(
    'spin_id', v_spin_id,
    'grid', v_grid,
    'wins', v_wins,
    'total_win', v_total,
    'mult', v_mult,
    'was_free', v_was_free,
    'free_awarded', v_free_awarded,
    'free_remaining', coalesce(v_free_remaining, 0),
    'free_bet', coalesce(v_free_bet, v_bet),
    'new_balance', v_new_balance,
    'server_seed_hash', v_hash,
    'nonce', v_nonce
  );
end;
$$;

-- ── buy_free_spins: bloquea la apuesta de compra, no mezcla apuestas ──
create or replace function public.buy_free_spins(
  p_slot text,
  p_bet  int,
  p_qty  int
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user uuid := auth.uid();
  v_bets int[];
  v_price int;
  v_new_balance int;
  v_free int;
  v_existing int;
  v_existing_bet int;
begin
  if v_user is null then raise exception 'no_session' using errcode = 'P0001'; end if;
  if p_qty is null or p_qty < 1 or p_qty > 200 then
    raise exception 'cantidad_invalida' using errcode = 'P0001';
  end if;

  select bet_options into v_bets from public.slots where slug = p_slot and active = true;
  if v_bets is null then raise exception 'slot_no_encontrado' using errcode = 'P0001'; end if;
  if not (p_bet = any (v_bets)) then raise exception 'apuesta_invalida' using errcode = 'P0001'; end if;

  perform pg_advisory_xact_lock(hashtext(v_user::text));

  -- No permitir comprar a una apuesta distinta si ya hay giros pendientes.
  select free_spins, bet into v_existing, v_existing_bet
    from public.slot_free_balance where user_id = v_user and slot_slug = p_slot;
  if coalesce(v_existing, 0) > 0 and v_existing_bet is not null and v_existing_bet <> p_bet then
    raise exception 'giros_gratis_otra_apuesta' using errcode = 'P0001';
  end if;

  v_price := p_qty * p_bet;

  v_new_balance := public.registrar_movimiento_credito(
    v_user, 'slots', -v_price, null, v_user,
    'Compra ' || p_qty || ' giros gratis ' || p_slot, null);

  insert into public.slot_free_balance (user_id, slot_slug, free_spins, bet)
    values (v_user, p_slot, p_qty, p_bet)
    on conflict (user_id, slot_slug) do update
      set free_spins = public.slot_free_balance.free_spins + excluded.free_spins,
          bet = excluded.bet;

  select free_spins into v_free
    from public.slot_free_balance where user_id = v_user and slot_slug = p_slot;

  return jsonb_build_object(
    'ok', true,
    'bought', p_qty,
    'price', v_price,
    'free_remaining', coalesce(v_free, 0),
    'free_bet', p_bet,
    'new_balance', v_new_balance
  );
end;
$$;
