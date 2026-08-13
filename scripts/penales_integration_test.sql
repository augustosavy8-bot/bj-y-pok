-- Integration test for the penales RPCs. Runs entirely inside one DO block and
-- rolls back at the end (raises TEST_OK_ROLLBACK) so it leaves ZERO trace.
-- Impersonates a real auth user via request.jwt.* GUCs so auth.uid() resolves.
--   PASS  → statement fails with 'TEST_OK_ROLLBACK' (expected: all asserts passed).
--   FAIL  → statement fails with 'ASSERT_FAIL: ...'.
do $$
declare
  v_uid  uuid;
  v_b0   int; v_b int;
  r      jsonb; v_tid uuid; v_res text; v_pozo bigint;
  v_attempts int := 0; v_reached_decision bool := false;
  v_err  text;
  v_refund_cnt int; v_pen_cnt int;
begin
  select id into v_uid from auth.users limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role','authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_uid::text, true);
  if auth.uid() is null or auth.uid() <> v_uid then
    raise exception 'ASSERT_FAIL: auth.uid() no resuelve al usuario impersonado';
  end if;

  -- Fondear al usuario de prueba (se revierte con el rollback).
  perform public.registrar_movimiento_credito(v_uid, 'carga', 100000, null, v_uid, 'test topup', null);
  v_b0 := public.saldo_actual(v_uid);

  -- ── T1: start debita la apuesta ──
  r := public.penales_start(1000, 'seed-test-1');
  v_tid := (r->>'tanda_id')::uuid;
  if (r->>'estado') <> 'esperando_patada' then raise exception 'ASSERT_FAIL: estado inicial %', r->>'estado'; end if;
  if (r->>'pozo') <> '1000' then raise exception 'ASSERT_FAIL: pozo inicial %', r->>'pozo'; end if;
  if public.saldo_actual(v_uid) <> v_b0 - 1000 then raise exception 'ASSERT_FAIL: saldo tras start %, esperado %', public.saldo_actual(v_uid), v_b0-1000; end if;

  -- ── T2: no se puede abrir una segunda tanda ──
  begin
    perform public.penales_start(1000, 'x');
    raise exception 'ASSERT_FAIL: se permitio una segunda tanda abierta';
  exception when others then
    get stacked diagnostics v_err = message_text;
    if v_err <> 'tanda_abierta' then raise exception 'ASSERT_FAIL: doble start dio "%" (esperaba tanda_abierta)', v_err; end if;
  end;

  -- ── T3: cashout antes de patear → nada_para_cobrar ──
  begin
    perform public.penales_cashout();
    raise exception 'ASSERT_FAIL: cashout pre-patada no fue rechazado';
  exception when others then
    get stacked diagnostics v_err = message_text;
    if v_err <> 'nada_para_cobrar' then raise exception 'ASSERT_FAIL: cashout pre-patada dio "%"', v_err; end if;
  end;

  -- ── T4: una patada; valida la matemática del ledger para el resultado real ──
  r := public.penales_kick(2);
  v_res := r->>'resultado';
  if v_res = 'gol' then
    if (r->>'pozo') <> '2000' then raise exception 'ASSERT_FAIL: pozo tras gol %', r->>'pozo'; end if;
    if (r->>'estado') <> 'esperando_decision' then raise exception 'ASSERT_FAIL: estado tras gol %', r->>'estado'; end if;
    -- cashout acredita el pozo
    r := public.penales_cashout();
    if (r->>'cobrado') <> '2000' then raise exception 'ASSERT_FAIL: cobrado %', r->>'cobrado'; end if;
    if public.saldo_actual(v_uid) <> v_b0 + 1000 then raise exception 'ASSERT_FAIL: saldo tras cobro %, esperado %', public.saldo_actual(v_uid), v_b0+1000; end if;
  else -- atajada
    if (r->>'pozo') <> '0' then raise exception 'ASSERT_FAIL: pozo tras atajada %', r->>'pozo'; end if;
    if (r->>'estado') <> 'perdida' then raise exception 'ASSERT_FAIL: estado tras atajada %', r->>'estado'; end if;
    if public.saldo_actual(v_uid) <> v_b0 - 1000 then raise exception 'ASSERT_FAIL: saldo tras atajada %, esperado %', public.saldo_actual(v_uid), v_b0-1000; end if;
  end if;

  -- ── T5: doble cashout no puede volver a acreditar ──
  begin
    perform public.penales_cashout();
    raise exception 'ASSERT_FAIL: segundo cashout no fue rechazado';
  exception when others then
    get stacked diagnostics v_err = message_text;
    if v_err <> 'sin_tanda' then raise exception 'ASSERT_FAIL: doble cashout dio "%"', v_err; end if;
  end;

  -- ── T6: verify reproduce la tanda ──
  r := public.penales_verify(v_tid);
  if (r->>'hash_ok') <> 'true' then raise exception 'ASSERT_FAIL: hash_ok false'; end if;
  if (r->>'match')   <> 'true' then raise exception 'ASSERT_FAIL: verify match false: %', r; end if;

  -- ── T7: timeout ANTES de patear → reembolso (tipo refund_timeout), neto 0 ──
  v_b := public.saldo_actual(v_uid);
  r := public.penales_start(500, 'seed-refund');
  v_tid := (r->>'tanda_id')::uuid;
  if public.saldo_actual(v_uid) <> v_b - 500 then raise exception 'ASSERT_FAIL: saldo tras start(500) %', public.saldo_actual(v_uid); end if;
  update public.penales_tandas set updated_at = now() - interval '20 minutes' where id = v_tid;
  perform public._penales_expire_user(v_uid);
  if (select estado from public.penales_tandas where id = v_tid) <> 'reembolsada' then
    raise exception 'ASSERT_FAIL: timeout pre-patada no reembolso (estado %)', (select estado from public.penales_tandas where id=v_tid);
  end if;
  if (select cashout_tipo from public.penales_tandas where id = v_tid) <> 'refund_timeout' then
    raise exception 'ASSERT_FAIL: reembolso no uso tipo refund_timeout';
  end if;
  if public.saldo_actual(v_uid) <> v_b then raise exception 'ASSERT_FAIL: reembolso no dejo neto 0 (%, esperado %)', public.saldo_actual(v_uid), v_b; end if;
  select count(*) into v_refund_cnt from public.creditos_movimientos where user_id=v_uid and tipo='refund_timeout';
  if v_refund_cnt <> 1 then raise exception 'ASSERT_FAIL: cantidad de refund_timeout = % (esperaba 1)', v_refund_cnt; end if;
  -- idempotencia: expirar de nuevo NO vuelve a acreditar
  perform public._penales_expire_user(v_uid);
  select count(*) into v_refund_cnt from public.creditos_movimientos where user_id=v_uid and tipo='refund_timeout';
  if v_refund_cnt <> 1 then raise exception 'ASSERT_FAIL: reembolso NO idempotente (% movimientos)', v_refund_cnt; end if;

  -- ── T8: timeout DESPUES de un gol → auto-cobro (tipo penales) ──
  -- Buscar una tanda que llegue a esperando_decision (48% por patada).
  while not v_reached_decision and v_attempts < 60 loop
    v_attempts := v_attempts + 1;
    r := public.penales_start(500, 'seed-auto-' || v_attempts::text);
    v_tid := (r->>'tanda_id')::uuid;
    r := public.penales_kick(1);
    if (r->>'estado') = 'esperando_decision' then v_reached_decision := true; end if;
  end loop;
  if not v_reached_decision then raise exception 'ASSERT_FAIL: no se alcanzo esperando_decision en % intentos', v_attempts; end if;
  v_pozo := (select pozo from public.penales_tandas where id = v_tid);
  v_b := public.saldo_actual(v_uid);
  update public.penales_tandas set updated_at = now() - interval '20 minutes' where id = v_tid;
  perform public._penales_expire_user(v_uid);
  if (select estado from public.penales_tandas where id = v_tid) <> 'cobrada' then
    raise exception 'ASSERT_FAIL: timeout post-gol no cobro (estado %)', (select estado from public.penales_tandas where id=v_tid);
  end if;
  if (select cashout_tipo from public.penales_tandas where id = v_tid) <> 'penales' then
    raise exception 'ASSERT_FAIL: auto-cobro no uso tipo penales';
  end if;
  if public.saldo_actual(v_uid) <> v_b + v_pozo then
    raise exception 'ASSERT_FAIL: auto-cobro no acredito el pozo (%, esperado %)', public.saldo_actual(v_uid), v_b + v_pozo;
  end if;

  -- Todo OK → deshacer.
  raise exception 'TEST_OK_ROLLBACK';
end $$;
