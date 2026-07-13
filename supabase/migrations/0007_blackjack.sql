-- ============================================================
-- 0007_blackjack.sql — Blackjack (tablas paralelas, no toca poker)
--
-- Fundación reutilizada del proyecto existente:
--   * "sesión / sala"  = public.mesas   (se agrega mesas.tipo_juego)
--   * "usuario"        = public.jugadores (identidad por auth_uid, por mesa)
--   * fichas           = jugadores.fichas
-- La estación de escaneo (/api/leer-carta) es la misma para ambos juegos.
-- ============================================================

-- ------------------------------------------------------------
-- Tipo de juego en la mesa. Todo lo existente = 'poker_holdem'.
-- ------------------------------------------------------------
alter table public.mesas
  add column if not exists tipo_juego text not null default 'poker_holdem'
    check (tipo_juego in ('poker_holdem', 'blackjack'));

-- Fichas con las que entró cada jugador (base para la liquidación).
-- Se setea al unirse y se suma en cada recompra.
alter table public.jugadores
  add column if not exists total_comprado integer not null default 0;

-- ------------------------------------------------------------
-- Configuración de una sesión de blackjack (1 por mesa).
-- ------------------------------------------------------------
create table if not exists public.bj_configuracion_sesion (
  id                          uuid primary key default gen_random_uuid(),
  mesa_id                     uuid not null unique references public.mesas(id) on delete cascade,
  cantidad_mazos              integer not null default 6  check (cantidad_mazos between 1 and 8),
  barajar_cada_manos          integer not null default 20 check (barajar_cada_manos > 0),
  soft_17_regla               text not null default 'dealer_para' check (soft_17_regla in ('dealer_para','dealer_pide')),
  blackjack_pago              text not null default '3_a_2'      check (blackjack_pago in ('3_a_2','6_a_5')),
  permite_double_after_split  boolean not null default true,
  permite_surrender           boolean not null default true,
  permite_insurance           boolean not null default true,
  rotacion_banca              text not null default 'cada_5' check (rotacion_banca in ('por_mano','cada_5','cada_10','hasta_fundirse')),
  max_split_hands             integer not null default 4  check (max_split_hands between 1 and 4),
  apuesta_min                 integer not null default 10,
  apuesta_max                 integer not null default 500,
  segundos_por_turno          integer not null default 30,
  -- orden de rotación de la banca: array de jugador_id
  orden_banca                 jsonb not null default '[]'::jsonb,
  created_at                  timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Estado del shoe (mazo físico) — contador de cartas desde el barajado.
-- ------------------------------------------------------------
create table if not exists public.bj_shoe (
  mesa_id            uuid primary key references public.mesas(id) on delete cascade,
  cantidad_mazos     integer not null default 6,
  cartas_repartidas  integer not null default 0,
  manos_desde_barajado integer not null default 0,
  ultimo_barajado_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Rondas de blackjack.
-- ------------------------------------------------------------
create table if not exists public.bj_rondas (
  id                uuid primary key default gen_random_uuid(),
  mesa_id           uuid not null references public.mesas(id) on delete cascade,
  numero_ronda      integer not null,
  banca_jugador_id  uuid references public.jugadores(id) on delete set null,
  estado            text not null default 'apuestas'
                      check (estado in ('apuestas','reparto_inicial','turnos_jugadores','turno_dealer','pagos','terminada')),
  turno_mano_id     uuid,                 -- bj_manos_jugador que está actuando
  turno_expira_at   timestamptz,          -- para auto-stand por timeout
  hole_revelada     boolean not null default false,
  fase_seguro       boolean not null default false, -- true mientras se ofrece seguro
  created_at        timestamptz not null default now(),
  unique (mesa_id, numero_ronda)
);

create index if not exists bj_rondas_mesa_idx on public.bj_rondas(mesa_id);

-- ------------------------------------------------------------
-- Manos de jugador (un jugador puede tener varias por split).
-- ------------------------------------------------------------
create table if not exists public.bj_manos_jugador (
  id             uuid primary key default gen_random_uuid(),
  ronda_id       uuid not null references public.bj_rondas(id) on delete cascade,
  jugador_id     uuid not null references public.jugadores(id) on delete cascade,
  orden_asiento  integer not null,
  apuesta_fichas integer not null default 0,
  seguro_fichas  integer,
  doblada        boolean not null default false,
  estado_mano    text not null default 'apostando'
                   check (estado_mano in ('apostando','jugando','plantado','pasado','blackjack','rendido')),
  es_split_de    uuid references public.bj_manos_jugador(id) on delete set null,
  orden_mano     integer not null default 0, -- para ordenar splits de un mismo asiento
  created_at     timestamptz not null default now()
);

create index if not exists bj_manos_ronda_idx on public.bj_manos_jugador(ronda_id);
create index if not exists bj_manos_jugador_idx on public.bj_manos_jugador(jugador_id);

-- ------------------------------------------------------------
-- Cartas asignadas en la ronda (jugadores y dealer).
-- ------------------------------------------------------------
create table if not exists public.bj_cartas_asignadas (
  id               uuid primary key default gen_random_uuid(),
  ronda_id         uuid not null references public.bj_rondas(id) on delete cascade,
  mano_jugador_id  uuid references public.bj_manos_jugador(id) on delete cascade, -- null si es del dealer
  es_carta_dealer  boolean not null default false,
  es_hole_card     boolean not null default false, -- 2da del dealer (arranca oculta)
  revelada         boolean not null default true,  -- la hole card arranca en false
  valor            text not null check (valor in ('2','3','4','5','6','7','8','9','10','J','Q','K','A')),
  palo             text not null check (palo in ('corazones','diamantes','treboles','picas')),
  orden_recibida   integer not null,
  created_at       timestamptz not null default now()
);

create index if not exists bj_cartas_ronda_idx on public.bj_cartas_asignadas(ronda_id);
create index if not exists bj_cartas_mano_idx on public.bj_cartas_asignadas(mano_jugador_id);

-- ------------------------------------------------------------
-- Resultados por mano de jugador.
-- ------------------------------------------------------------
create table if not exists public.bj_resultados (
  id                        uuid primary key default gen_random_uuid(),
  mano_jugador_id           uuid not null references public.bj_manos_jugador(id) on delete cascade,
  resultado                 text not null check (resultado in ('gana','pierde','empate','blackjack','rendido')),
  fichas_ganadas_o_perdidas integer not null, -- signed (incluye seguro)
  valor_final_mano          integer not null,
  created_at                timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Balance de la banca por ronda.
-- ------------------------------------------------------------
create table if not exists public.bj_banca_balance (
  id                uuid primary key default gen_random_uuid(),
  ronda_id          uuid not null references public.bj_rondas(id) on delete cascade,
  banca_jugador_id  uuid references public.jugadores(id) on delete set null,
  fichas_al_inicio  integer not null,
  fichas_al_final   integer not null,
  delta             integer not null,
  created_at        timestamptz not null default now()
);

-- Recompras (buy-ins) — ledger mínimo, sirve para banca y jugadores.
create table if not exists public.bj_recompras (
  id           uuid primary key default gen_random_uuid(),
  mesa_id      uuid not null references public.mesas(id) on delete cascade,
  jugador_id   uuid not null references public.jugadores(id) on delete cascade,
  monto        integer not null check (monto > 0),
  created_at   timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Helper: siguiente número de ronda de blackjack.
-- ------------------------------------------------------------
create or replace function public.bj_siguiente_numero_ronda(p_mesa_id uuid)
returns integer
language sql
as $$
  select coalesce(max(numero_ronda), 0) + 1 from public.bj_rondas where mesa_id = p_mesa_id;
$$;
