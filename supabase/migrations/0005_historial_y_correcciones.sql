-- ============================================================
-- 0005_historial_y_correcciones.sql
--   * Columna `fase` en acciones (para ubicar cada acción en su calle
--     y dibujar los separadores del historial).
--   * Tabla de auditoría de correcciones de cartas.
-- ============================================================

-- ------------------------------------------------------------
-- acciones.fase — en qué calle ocurrió la acción.
-- ------------------------------------------------------------
alter table public.acciones
  add column if not exists fase text
    check (fase in ('preflop','flop','turn','river'));

-- ------------------------------------------------------------
-- correcciones_cartas — log de auditoría (debug / disputas).
-- ------------------------------------------------------------
create table if not exists public.correcciones_cartas (
  id                    uuid primary key default gen_random_uuid(),
  carta_id              uuid not null references public.cartas(id) on delete cascade,
  valor_anterior        text not null,
  palo_anterior         text not null,
  valor_nuevo           text not null,
  palo_nuevo            text not null,
  corregida_por_auth_uid uuid,
  created_at            timestamptz not null default now()
);

create index if not exists correcciones_carta_idx
  on public.correcciones_cartas(carta_id);

-- RLS: sólo el servidor (service role) escribe/lee esta tabla.
alter table public.correcciones_cartas enable row level security;
-- (Sin policies: nadie con anon key accede; el service role bypassea RLS.)
