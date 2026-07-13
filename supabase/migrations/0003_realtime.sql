-- ============================================================
-- 0003_realtime.sql — Habilitar Realtime (postgres_changes)
--
-- Realtime respeta las policies de RLS de SELECT, así que un jugador
-- sólo recibe eventos de las cartas 'hole' que puede leer.
-- ============================================================

-- Asegurar REPLICA IDENTITY FULL para recibir el row completo en updates
alter table public.mesas     replica identity full;
alter table public.jugadores replica identity full;
alter table public.manos     replica identity full;
alter table public.cartas    replica identity full;
alter table public.acciones  replica identity full;

-- Agregar tablas a la publicación de realtime.
-- (En proyectos nuevos de Supabase la publicación 'supabase_realtime' existe.)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.mesas;
    alter publication supabase_realtime add table public.jugadores;
    alter publication supabase_realtime add table public.manos;
    alter publication supabase_realtime add table public.cartas;
    alter publication supabase_realtime add table public.acciones;
  else
    create publication supabase_realtime for table
      public.mesas, public.jugadores, public.manos, public.cartas, public.acciones;
  end if;
exception
  when duplicate_object then null; -- ya estaban agregadas
end $$;
