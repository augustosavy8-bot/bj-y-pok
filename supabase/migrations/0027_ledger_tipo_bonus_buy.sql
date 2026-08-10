-- ============================================================
-- 0027_ledger_tipo_bonus_buy.sql — Permitir el tipo 'bonus_buy' en el ledger
--
-- buy_bonus registra el débito de la compra con tipo 'bonus_buy'. El CHECK de
-- creditos_movimientos.tipo no lo incluía. Se agrega.
-- ============================================================

alter table public.creditos_movimientos drop constraint if exists creditos_movimientos_tipo_check;
alter table public.creditos_movimientos add constraint creditos_movimientos_tipo_check
  check (tipo = any (array['carga','retiro','buy_in_mesa','cash_out_mesa','ajuste','slots','bonus_buy']));
