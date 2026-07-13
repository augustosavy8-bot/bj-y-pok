-- ============================================================
-- 0013_creditos_rls.sql — RLS de créditos y retiros
-- ============================================================

alter table public.creditos_movimientos enable row level security;
alter table public.solicitudes_retiro   enable row level security;

-- ------------------------------------------------------------
-- MOVIMIENTOS: cada uno lee los suyos; admin lee todos.
-- Nadie inserta/edita directo: todo pasa por route handlers (service role)
-- vía registrar_movimiento_credito.
-- ------------------------------------------------------------
drop policy if exists creditos_select on public.creditos_movimientos;
create policy creditos_select on public.creditos_movimientos
  for select using (user_id = auth.uid() or public.es_admin());

-- ------------------------------------------------------------
-- SOLICITUDES DE RETIRO: el usuario lee/crea las propias; admin lee/edita todas.
-- ------------------------------------------------------------
drop policy if exists solicitudes_select on public.solicitudes_retiro;
create policy solicitudes_select on public.solicitudes_retiro
  for select using (user_id = auth.uid() or public.es_admin());

drop policy if exists solicitudes_insert on public.solicitudes_retiro;
create policy solicitudes_insert on public.solicitudes_retiro
  for insert with check (user_id = auth.uid() and estado = 'pendiente');

drop policy if exists solicitudes_update on public.solicitudes_retiro;
create policy solicitudes_update on public.solicitudes_retiro
  for update using (public.es_admin()) with check (public.es_admin());

-- Nota: la creación de solicitudes también pasa por un route handler que
-- valida monto <= saldo_actual; la policy de insert es la red de seguridad.
