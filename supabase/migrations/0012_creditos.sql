-- ============================================================
-- 0012_creditos.sql — Sistema de créditos administrado por el admin
--
-- Fuente de verdad del saldo: SUM(monto) de creditos_movimientos.
-- No se cachea en perfiles (evita deriva). Cada fila guarda además un
-- snapshot saldo_resultante para auditoría / lectura O(1) del último saldo.
-- ============================================================

-- ------------------------------------------------------------
-- Solicitudes de retiro (se referencian desde los movimientos)
-- ------------------------------------------------------------
create table if not exists public.solicitudes_retiro (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.perfiles(id) on delete cascade,
  monto_solicitado integer not null check (monto_solicitado > 0),
  estado           text not null default 'pendiente'
                     check (estado in ('pendiente','aprobada','rechazada','pagada')),
  resuelta_por     uuid references public.perfiles(id) on delete set null,
  resuelta_at      timestamptz,
  notas_admin      text,
  created_at       timestamptz not null default now()
);
create index if not exists solicitudes_estado_idx on public.solicitudes_retiro(estado);
create index if not exists solicitudes_user_idx on public.solicitudes_retiro(user_id);

-- ------------------------------------------------------------
-- Movimientos de créditos
-- ------------------------------------------------------------
create table if not exists public.creditos_movimientos (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references public.perfiles(id) on delete cascade,
  tipo                 text not null check (tipo in
                         ('carga','retiro','buy_in_mesa','cash_out_mesa','ajuste')),
  monto                integer not null,          -- signo según el tipo
  saldo_resultante     integer not null,          -- snapshot post-movimiento
  mesa_id              uuid references public.mesas(id) on delete set null,
  solicitud_retiro_id  uuid references public.solicitudes_retiro(id) on delete set null,
  realizado_por        uuid references public.perfiles(id) on delete set null,
  notas                text,
  created_at           timestamptz not null default now()
);
create index if not exists creditos_user_idx
  on public.creditos_movimientos(user_id, created_at desc);

-- ------------------------------------------------------------
-- saldo_actual(user): suma de movimientos. NO security definer:
-- respeta RLS, así el usuario solo suma sus filas y el admin las de todos.
-- El servidor (service role) bypassea RLS igual.
-- ------------------------------------------------------------
create or replace function public.saldo_actual(p_user uuid)
returns integer
language sql
stable
set search_path = public
as $$
  select coalesce(sum(monto), 0)::int
  from public.creditos_movimientos
  where user_id = p_user;
$$;

-- ------------------------------------------------------------
-- registrar_movimiento_credito: inserta un movimiento de forma ATÓMICA con
-- candado por usuario (advisory lock) para evitar carreras en saldo_resultante.
-- Rechaza si un débito dejaría el saldo negativo. Devuelve el nuevo saldo.
-- SECURITY DEFINER: solo se invoca desde el servidor (service role).
-- ------------------------------------------------------------
create or replace function public.registrar_movimiento_credito(
  p_user          uuid,
  p_tipo          text,
  p_monto         integer,
  p_mesa_id       uuid default null,
  p_realizado_por uuid default null,
  p_notas         text default null,
  p_solicitud     uuid default null
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_saldo integer;
  v_nuevo integer;
begin
  -- Serializa los movimientos del mismo usuario mientras dure la transacción.
  perform pg_advisory_xact_lock(hashtext(p_user::text));

  select coalesce(sum(monto), 0) into v_saldo
  from public.creditos_movimientos where user_id = p_user;

  v_nuevo := v_saldo + p_monto;

  if p_monto < 0 and v_nuevo < 0 then
    raise exception 'saldo_insuficiente' using errcode = 'P0001';
  end if;

  insert into public.creditos_movimientos
    (user_id, tipo, monto, saldo_resultante, mesa_id, realizado_por, notas, solicitud_retiro_id)
  values
    (p_user, p_tipo, p_monto, v_nuevo, p_mesa_id, p_realizado_por, p_notas, p_solicitud);

  return v_nuevo;
end;
$$;

-- ------------------------------------------------------------
-- Buy-in mínimo de la mesa (aplica a poker y blackjack).
-- 0 = mesa de práctica / sin crédito.
-- ------------------------------------------------------------
alter table public.mesas
  add column if not exists creditos_minimos integer not null default 0;
