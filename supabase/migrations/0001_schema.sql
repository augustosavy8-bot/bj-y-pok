-- ============================================================
-- 0001_schema.sql — Esquema base de la webapp de poker
-- ============================================================

-- Extensiones
create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- MESAS
-- ------------------------------------------------------------
create table if not exists public.mesas (
  id               uuid primary key default gen_random_uuid(),
  codigo_sala      text not null unique check (char_length(codigo_sala) = 6),
  estado           text not null default 'esperando'
                     check (estado in ('esperando','jugando','terminada')),
  ciega_chica      integer not null default 10 check (ciega_chica > 0),
  ciega_grande     integer not null default 20 check (ciega_grande > 0),
  fichas_iniciales integer not null default 1000 check (fichas_iniciales > 0),
  dealer_position  integer not null default 0,
  created_at       timestamptz not null default now()
);

-- ------------------------------------------------------------
-- JUGADORES
-- ------------------------------------------------------------
create table if not exists public.jugadores (
  id                   uuid primary key default gen_random_uuid(),
  mesa_id              uuid not null references public.mesas(id) on delete cascade,
  auth_uid             uuid,                        -- uid de auth anónima (identidad para RLS)
  nombre               text not null,
  fichas               integer not null default 0,
  posicion             integer not null,            -- orden en la mesa (0..n)
  estado               text not null default 'activo'
                          check (estado in ('activo','fold','all_in','eliminado')),
  es_crupier           boolean not null default false,
  -- Estado de apuesta (scope: mano/ronda) --------------------
  apuesta_ronda        integer not null default 0,  -- comprometido en la ronda de apuestas actual
  total_apostado_mano  integer not null default 0,  -- comprometido en toda la mano (para side pots)
  ha_actuado           boolean not null default false, -- ya actuó en la ronda actual
  created_at           timestamptz not null default now(),
  unique (mesa_id, posicion)
);

create index if not exists jugadores_mesa_idx on public.jugadores(mesa_id);
create index if not exists jugadores_auth_idx on public.jugadores(auth_uid);

-- ------------------------------------------------------------
-- MANOS
-- ------------------------------------------------------------
create table if not exists public.manos (
  id                uuid primary key default gen_random_uuid(),
  mesa_id           uuid not null references public.mesas(id) on delete cascade,
  numero_mano       integer not null,
  fase              text not null default 'pre_reparto'
                       check (fase in ('pre_reparto','preflop','flop','turn','river','showdown','terminada')),
  pozo              integer not null default 0,
  apuesta_actual    integer not null default 0,   -- apuesta más alta de la ronda actual
  ultima_subida     integer not null default 0,   -- tamaño de la última subida (para min-raise)
  turno_jugador_id  uuid references public.jugadores(id) on delete set null,
  ultimo_agresor_id uuid references public.jugadores(id) on delete set null,
  ganador_id        uuid references public.jugadores(id) on delete set null,
  resultado         jsonb,                          -- detalle de reparto/side pots en showdown
  created_at        timestamptz not null default now(),
  unique (mesa_id, numero_mano)
);

create index if not exists manos_mesa_idx on public.manos(mesa_id);

-- ------------------------------------------------------------
-- CARTAS
-- ------------------------------------------------------------
create table if not exists public.cartas (
  id             uuid primary key default gen_random_uuid(),
  mano_id        uuid not null references public.manos(id) on delete cascade,
  valor          text not null check (valor in ('2','3','4','5','6','7','8','9','10','J','Q','K','A')),
  palo           text not null check (palo in ('corazones','diamantes','treboles','picas')),
  tipo           text not null check (tipo in ('hole','comunitaria')),
  jugador_id     uuid references public.jugadores(id) on delete cascade, -- null si comunitaria
  orden_escaneo  integer not null,
  created_at     timestamptz not null default now(),
  unique (mano_id, valor, palo)  -- no se puede repetir la misma carta en una mano
);

create index if not exists cartas_mano_idx on public.cartas(mano_id);
create index if not exists cartas_jugador_idx on public.cartas(jugador_id);

-- ------------------------------------------------------------
-- ACCIONES
-- ------------------------------------------------------------
create table if not exists public.acciones (
  id          uuid primary key default gen_random_uuid(),
  mano_id     uuid not null references public.manos(id) on delete cascade,
  jugador_id  uuid not null references public.jugadores(id) on delete cascade,
  tipo        text not null check (tipo in ('fold','check','call','raise','all_in','blind')),
  monto       integer not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists acciones_mano_idx on public.acciones(mano_id);

-- ------------------------------------------------------------
-- Helper: siguiente número de mano para una mesa
-- ------------------------------------------------------------
create or replace function public.siguiente_numero_mano(p_mesa_id uuid)
returns integer
language sql
as $$
  select coalesce(max(numero_mano), 0) + 1 from public.manos where mesa_id = p_mesa_id;
$$;
