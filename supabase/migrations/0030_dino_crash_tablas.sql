-- ============================================================
-- 0030_dino_crash_tablas.sql — Dino Crash (juego crash) · tablas + config + ledger
--
-- Juego "crash" single-player provably-fair. Cada ronda: el jugador apuesta, el
-- server compromete un seed (hash) ANTES de la ronda y calcula el punto de crash
-- OCULTO; el multiplicador sube con el tiempo (m = e^(K·t)); el jugador se retira
-- antes del crash para cobrar apuesta×multiplicador. El punto de crash se revela
-- recién al cerrarse la ronda (verificable). RTP configurable (95%).
-- Seguridad: el punto de crash NUNCA se envía al cliente mientras la ronda está
-- activa; el retiro se valida por tiempo en el server (ver 0031_dino_crash_rpcs).
-- ============================================================

-- Config (fila única id=1). K (growth) DEBE coincidir con el cliente.
create table if not exists public.crash_config (
  id          smallint primary key default 1 check (id = 1),
  growth      numeric  not null default 0.14,        -- K: m = e^(K·t), t en segundos
  house_rtp   numeric  not null default 0.95,        -- RTP: crash = rtp/(1-U)
  cap_mult    numeric  not null default 100000,      -- tope de multiplicador
  max_win     int      not null default 200000,      -- techo de premio por ronda (fichas)
  min_bet     int      not null default 10,
  max_bet     int      not null default 10000,
  bet_options int[]    not null default '{45,100,250,500,1000,2500,5000,10000}',
  updated_at  timestamptz not null default now()
);
insert into public.crash_config (id) values (1) on conflict (id) do nothing;

-- Rondas. crash_point queda oculto hasta que status <> 'active'.
create table if not exists public.crash_rounds (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.perfiles(id) on delete cascade,
  bet              int  not null,
  client_seed      text not null,
  server_seed      text not null,
  server_seed_hash text not null,
  nonce            bigint not null,
  crash_point      numeric not null,
  started_at       timestamptz not null default now(),
  status           text not null default 'active' check (status in ('active','cashed','busted')),
  cashout_mult     numeric,
  win              int not null default 0,
  settled_at       timestamptz,
  new_balance      bigint,
  created_at       timestamptz not null default now()
);

-- A lo sumo UNA ronda activa por usuario (evita dobles apuestas simultáneas).
create unique index if not exists crash_rounds_una_activa
  on public.crash_rounds (user_id) where status = 'active';
create index if not exists crash_rounds_user_created
  on public.crash_rounds (user_id, created_at desc);

alter table public.crash_rounds enable row level security;
drop policy if exists crash_rounds_select_own on public.crash_rounds;
create policy crash_rounds_select_own on public.crash_rounds
  for select using (auth.uid() = user_id);

alter table public.crash_config enable row level security;
drop policy if exists crash_config_read on public.crash_config;
create policy crash_config_read on public.crash_config for select using (true);

-- Ledger: permitir el tipo 'crash' (apuesta/premio de Dino Crash).
alter table public.creditos_movimientos drop constraint if exists creditos_movimientos_tipo_check;
alter table public.creditos_movimientos add constraint creditos_movimientos_tipo_check
  check (tipo = any (array['carga','retiro','buy_in_mesa','cash_out_mesa','ajuste','slots','bonus_buy','crash']));
