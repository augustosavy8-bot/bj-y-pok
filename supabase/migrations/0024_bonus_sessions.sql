-- ============================================================
-- 0024_bonus_sessions.sql — Estado de sesión de bonus (Parte 1) + config (Parte 2)
--
-- Total Multiplier persistente en free spins + Bonus Buy por tiers.
-- Adaptaciones al esquema real: perfiles (no profiles); slots se referencia por
-- slug (PK), no por uuid. Los giros gratis existentes (slot_free_balance) se
-- convierten en sesiones naturales para no perderlos.
-- ============================================================

-- ── Parte 1: tabla de sesiones de bonus ──
create table if not exists public.bonus_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.perfiles(id) on delete cascade,
  slot_slug text not null references public.slots(slug) on delete cascade,
  source text not null check (source in ('natural','buy')),
  tier text check (tier in ('standard','super','max')),   -- null si natural
  bet_locked int not null,
  cost int not null default 0,
  spins_total int not null,
  spins_played int not null default 0,
  total_multiplier numeric not null default 1,
  total_win int not null default 0,
  status text not null default 'active' check (status in ('active','completed')),
  created_at timestamptz not null default now()
);
create index if not exists bonus_sessions_user_status_idx on public.bonus_sessions (user_id, status);
-- Máximo UNA sesión activa por (user, slot).
create unique index if not exists bonus_sessions_one_active_idx
  on public.bonus_sessions (user_id, slot_slug) where status = 'active';

alter table public.bonus_sessions enable row level security;
drop policy if exists bonus_sessions_select_own on public.bonus_sessions;
create policy bonus_sessions_select_own on public.bonus_sessions
  for select to authenticated using (user_id = auth.uid());
-- Sin políticas de INSERT/UPDATE: sólo se escribe vía RPC SECURITY DEFINER.

-- ── Parte 2: extender el jsonb `freespins` de cada slot (retrocompatible) ──
-- persistent_mult (natural), bonus_factor_scale (perilla de calibración, se fija
-- en 0025 tras la simulación) y buy_tiers. Se mergea con `||` conservando
-- trigger/min/grant existentes de cada slot.
update public.slots
set freespins = freespins || jsonb_build_object(
  'persistent_mult', jsonb_build_object('start', 1, 'increment', 1, 'max', 50),
  'bonus_factor_scale', 0.62,
  'buy_tiers', jsonb_build_object(
    'standard', jsonb_build_object('price_x', 100, 'spins', 10, 'mult_start', 1, 'mult_increment', 1),
    'super',    jsonb_build_object('price_x', 200, 'spins', 10, 'mult_start', 2, 'mult_increment', 2),
    'max',      jsonb_build_object('price_x', 500, 'spins', 10, 'mult_start', 5, 'mult_increment', 3)
  )
)
where active = true;

-- ── Migrar giros gratis existentes a sesiones naturales (no perder saldo) ──
insert into public.bonus_sessions (user_id, slot_slug, source, tier, bet_locked, cost, spins_total, total_multiplier, status)
select user_id, slot_slug, 'natural', null, coalesce(bet, 45), 0, free_spins, 1, 'active'
from public.slot_free_balance
where free_spins > 0
on conflict do nothing;
update public.slot_free_balance set free_spins = 0 where free_spins > 0;
