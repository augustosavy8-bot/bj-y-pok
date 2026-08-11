-- ============================================================
-- 0032_dino_crash_compartido.sql — Dino Crash pasa a RONDA COMPARTIDA
--
-- Antes: una ronda por jugador (crash_start/crash_state). Ahora: UNA ronda
-- global que ven todos (como Aviator/Mystake). La ronda avanza sola en base a
-- timestamps (scheduler perezoso: la adelanta quien consulte). Los jugadores
-- apuestan en la ventana de apuestas y se retiran contra la MISMA ronda.
--
-- Este archivo: dropea el modelo viejo y crea el nuevo (config + rondas globales
-- + apuestas por jugador). Los RPCs van en 0033.
-- ============================================================

-- Sacar RPCs y tabla del modelo por-jugador.
drop function if exists public.crash_start(int, text);
drop function if exists public.crash_cashout(uuid, numeric);
drop function if exists public.crash_state(uuid);
drop function if exists public.crash_verify(uuid);
drop table if exists public.crash_rounds cascade;

-- Config: agrego ventana de apuestas y tiempo de "hold" del crash.
alter table public.crash_config add column if not exists betting_secs int     not null default 5;
alter table public.crash_config add column if not exists crash_hold   numeric not null default 3.0;

-- Rondas GLOBALES. crash_point queda oculto: NO hay policy de select (sólo se
-- accede vía los RPC SECURITY DEFINER, que lo revelan recién al crashear).
create table public.crash_rounds (
  id                uuid primary key default gen_random_uuid(),
  nonce             bigint not null unique,
  server_seed       text not null,
  server_seed_hash  text not null,
  crash_point       numeric not null,
  phase             text not null default 'betting' check (phase in ('betting','running','crashed')),
  betting_ends_at   timestamptz not null,
  running_started_at timestamptz,
  crashed_at        timestamptz,
  created_at        timestamptz not null default now()
);
create index crash_rounds_nonce_desc on public.crash_rounds (nonce desc);
alter table public.crash_rounds enable row level security;  -- sin policy: deny all (sólo RPC)

-- Apuestas por jugador sobre una ronda. Una por (ronda, usuario).
create table public.crash_bets (
  id            uuid primary key default gen_random_uuid(),
  round_id      uuid not null references public.crash_rounds(id) on delete cascade,
  user_id       uuid not null references public.perfiles(id) on delete cascade,
  bet           int  not null,
  status        text not null default 'active' check (status in ('active','cashed','lost')),
  cashout_mult  numeric,
  win           int  not null default 0,
  created_at    timestamptz not null default now(),
  unique (round_id, user_id)
);
create index crash_bets_user on public.crash_bets (user_id, created_at desc);
alter table public.crash_bets enable row level security;
drop policy if exists crash_bets_select_own on public.crash_bets;
create policy crash_bets_select_own on public.crash_bets for select using (auth.uid() = user_id);
