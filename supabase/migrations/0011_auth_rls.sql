-- ============================================================
-- 0011_auth_rls.sql — RLS de perfiles/invitaciones + lockdown de auth_uid
-- ============================================================

alter table public.perfiles     enable row level security;
alter table public.invitaciones enable row level security;

-- Helper anti-recursión: ¿el usuario actual es admin activo?
create or replace function public.es_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.perfiles
    where id = auth.uid() and rol = 'admin' and activo
  );
$$;

-- ------------------------------------------------------------
-- PERFILES: cada uno su fila; admin ve/edita todas.
-- ------------------------------------------------------------
drop policy if exists perfiles_select on public.perfiles;
create policy perfiles_select on public.perfiles
  for select using (id = auth.uid() or public.es_admin());

drop policy if exists perfiles_update on public.perfiles;
create policy perfiles_update on public.perfiles
  for update using (id = auth.uid() or public.es_admin())
  with check (
    -- Un no-admin no puede auto-promoverse ni cambiar 'activo'/'rol'.
    public.es_admin() or (rol = 'jugador')
  );

-- ------------------------------------------------------------
-- INVITACIONES: sólo admin. El alta/uso real va por route handlers con
-- service role; estas policies cubren cualquier acceso directo del cliente.
-- ------------------------------------------------------------
drop policy if exists invitaciones_all on public.invitaciones;
create policy invitaciones_all on public.invitaciones
  for all using (public.es_admin()) with check (public.es_admin());

-- ------------------------------------------------------------
-- LOCKDOWN: dejar de exponer jugadores.auth_uid al cliente.
--   El cliente sigue leyendo nombre/fichas/estado/etc., pero NO el auth_uid.
--   El service role (servidor) mantiene acceso total.
-- ------------------------------------------------------------
revoke select (auth_uid) on public.jugadores from anon, authenticated;

-- Nota: la policy jugadores_select (using true) sigue permitiendo leer la
-- fila; el privilegio de columna revocado impide seleccionar auth_uid.
