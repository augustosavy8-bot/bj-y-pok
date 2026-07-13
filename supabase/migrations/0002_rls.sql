-- ============================================================
-- 0002_rls.sql — Row Level Security
--
-- Identidad: cada dispositivo (jugador o crupier) usa auth anónima
-- de Supabase (auth.signInAnonymously). Al unirse, el jugador guarda
-- su auth.uid() en jugadores.auth_uid. Las policies usan esa relación.
-- ============================================================

alter table public.mesas     enable row level security;
alter table public.jugadores enable row level security;
alter table public.manos     enable row level security;
alter table public.cartas    enable row level security;
alter table public.acciones  enable row level security;

-- ------------------------------------------------------------
-- Helpers
-- ------------------------------------------------------------

-- ¿El usuario actual es el crupier de la mesa dada?
create or replace function public.es_crupier_de(p_mesa_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.jugadores j
    where j.mesa_id = p_mesa_id
      and j.auth_uid = auth.uid()
      and j.es_crupier = true
  );
$$;

-- mesa_id a la que pertenece una mano
create or replace function public.mesa_de_mano(p_mano_id uuid)
returns uuid
language sql
security definer
set search_path = public
as $$
  select mesa_id from public.manos where id = p_mano_id;
$$;

-- ------------------------------------------------------------
-- MESAS — lectura pública (para poder entrar con el código).
-- Escritura sólo vía service role (route handlers del servidor).
-- ------------------------------------------------------------
drop policy if exists mesas_select on public.mesas;
create policy mesas_select on public.mesas
  for select using (true);

-- ------------------------------------------------------------
-- JUGADORES — todos los de la mesa son visibles (nombre, fichas,
-- estado, posición son información pública en la mesa).
-- ------------------------------------------------------------
drop policy if exists jugadores_select on public.jugadores;
create policy jugadores_select on public.jugadores
  for select using (true);

-- El jugador puede fijar su propio auth_uid al reclamar su asiento
-- (sólo si aún no tiene dueño). El resto de escrituras van por service role.
drop policy if exists jugadores_claim on public.jugadores;
create policy jugadores_claim on public.jugadores
  for update using (auth_uid is null or auth_uid = auth.uid())
  with check (auth_uid = auth.uid());

-- ------------------------------------------------------------
-- MANOS — lectura pública dentro de la mesa.
-- ------------------------------------------------------------
drop policy if exists manos_select on public.manos;
create policy manos_select on public.manos
  for select using (true);

-- ------------------------------------------------------------
-- ACCIONES — historial público de apuestas.
-- ------------------------------------------------------------
drop policy if exists acciones_select on public.acciones;
create policy acciones_select on public.acciones
  for select using (true);

-- ------------------------------------------------------------
-- CARTAS — la parte sensible.
--   * Comunitarias: visibles para todos.
--   * Hole: sólo el dueño (jugador_id ↔ auth.uid()) o el crupier.
-- ------------------------------------------------------------
drop policy if exists cartas_select on public.cartas;
create policy cartas_select on public.cartas
  for select using (
    tipo = 'comunitaria'
    or exists (
      select 1 from public.jugadores j
      where j.id = cartas.jugador_id
        and j.auth_uid = auth.uid()
    )
    or public.es_crupier_de(public.mesa_de_mano(cartas.mano_id))
  );

-- Nota: todas las inserciones/updates de cartas, manos, acciones y
-- fichas de jugadores se hacen desde el servidor con la SERVICE_ROLE_KEY,
-- que bypassea RLS. Por eso no definimos policies de INSERT/UPDATE aquí.
