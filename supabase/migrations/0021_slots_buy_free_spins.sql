-- ============================================================
-- 0021_slots_buy_free_spins.sql — Comprar giros gratis / bonus buy
--
-- Permite comprar giros gratis con créditos. Server-authoritative y atómico:
-- cobra por el ledger (registrar_movimiento_credito, que rechaza si no alcanza
-- el saldo) y acredita los giros en slot_free_balance, todo en una transacción
-- con el mismo advisory lock por usuario que play_spin.
--
-- PRECIO = cantidad × apuesta. Como un giro gratis rinde en promedio
-- RTP × apuesta (incluyendo retriggers), pagar 1× apuesta por giro deja el
-- MISMO RTP (~95%) que jugar normal: es justo y no es un exploit. El "bonus
-- buy" y los "packs" son sólo cantidades distintas contra este mismo RPC.
-- ============================================================

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
begin
  if v_user is null then raise exception 'no_session' using errcode = 'P0001'; end if;
  if p_qty is null or p_qty < 1 or p_qty > 200 then
    raise exception 'cantidad_invalida' using errcode = 'P0001';
  end if;

  -- Slot activo + apuesta válida (la misma escalera que play_spin).
  select bet_options into v_bets from public.slots where slug = p_slot and active = true;
  if v_bets is null then raise exception 'slot_no_encontrado' using errcode = 'P0001'; end if;
  if not (p_bet = any (v_bets)) then raise exception 'apuesta_invalida' using errcode = 'P0001'; end if;

  -- Serializa con los giros del mismo usuario (misma clave que play_spin).
  perform pg_advisory_xact_lock(hashtext(v_user::text));

  v_price := p_qty * p_bet;

  -- Cobra por el ledger (lanza saldo_insuficiente si no alcanza).
  v_new_balance := public.registrar_movimiento_credito(
    v_user, 'slots', -v_price, null, v_user,
    'Compra ' || p_qty || ' giros gratis ' || p_slot, null);

  -- Acredita los giros gratis.
  insert into public.slot_free_balance (user_id, slot_slug, free_spins)
    values (v_user, p_slot, p_qty)
    on conflict (user_id, slot_slug) do update
      set free_spins = public.slot_free_balance.free_spins + excluded.free_spins;

  select free_spins into v_free
    from public.slot_free_balance where user_id = v_user and slot_slug = p_slot;

  return jsonb_build_object(
    'ok', true,
    'bought', p_qty,
    'price', v_price,
    'free_remaining', coalesce(v_free, 0),
    'new_balance', v_new_balance
  );
end;
$$;

revoke execute on function public.buy_free_spins(text, int, int) from public;
grant  execute on function public.buy_free_spins(text, int, int) to authenticated;
