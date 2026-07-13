-- ============================================================
-- 0010_auth_perfiles.sql — Autenticación real (email/password)
--   Capa de identidad: perfiles (1:1 con auth.users) + invitaciones.
--   No toca las reglas de juego; solo agrega identidad debajo.
-- ============================================================

-- ------------------------------------------------------------
-- PERFILES (1:1 con auth.users)
-- ------------------------------------------------------------
create table if not exists public.perfiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text not null,
  nombre       text not null,
  rol          text not null default 'jugador' check (rol in ('admin','jugador')),
  activo       boolean not null default true,
  invitado_por uuid references public.perfiles(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists perfiles_rol_idx on public.perfiles(rol);

-- Trigger: al crearse un auth.user, crear su perfil (rol 'jugador' por
-- defecto). El nombre sale de user_metadata.nombre si vino.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.perfiles (id, email, nombre, rol)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'nombre', new.email, 'Usuario'),
    coalesce(new.raw_user_meta_data->>'rol', 'jugador')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
-- INVITACIONES
-- ------------------------------------------------------------
create table if not exists public.invitaciones (
  id         uuid primary key default gen_random_uuid(),
  token      uuid not null unique default gen_random_uuid(),
  email      text,                                  -- opcional: atar a un email
  creada_por uuid not null references public.perfiles(id) on delete cascade,
  estado     text not null default 'pendiente'
               check (estado in ('pendiente','usada','expirada','revocada')),
  expires_at timestamptz not null default (now() + interval '7 days'),
  usada_por  uuid references public.perfiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists invitaciones_estado_idx on public.invitaciones(estado);
create index if not exists invitaciones_token_idx on public.invitaciones(token);

-- ------------------------------------------------------------
-- Modo práctica en la mesa: permite asientos de prueba (sin usuario).
-- Las mesas con crédito real (es_practica = false) exigen usuario logueado
-- en todos los asientos.
-- ------------------------------------------------------------
alter table public.mesas
  add column if not exists es_practica boolean not null default false;
