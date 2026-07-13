-- ============================================================
-- 0006_jugadores_unique_auth.sql
--   Un solo asiento por dispositivo (auth_uid) por mesa.
--   Es el guard definitivo contra inserts duplicados del mismo
--   jugador ante requests simultáneos (doble-click / doble render).
-- ============================================================

-- ⚠️ Si ya tenés filas duplicadas de pruebas anteriores, el índice va a
-- fallar al crearse. Limpiá los duplicados primero (deja el más viejo):
--
--   delete from public.jugadores j
--   using public.jugadores j2
--   where j.mesa_id = j2.mesa_id
--     and j.auth_uid = j2.auth_uid
--     and j.auth_uid is not null
--     and j.created_at > j2.created_at;

create unique index if not exists jugadores_mesa_auth_uidx
  on public.jugadores (mesa_id, auth_uid)
  where auth_uid is not null;
