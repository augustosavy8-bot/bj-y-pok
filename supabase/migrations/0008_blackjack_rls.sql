-- ============================================================
-- 0008_blackjack_rls.sql — RLS de las tablas de blackjack
--
-- En blackjack todas las cartas son abiertas EXCEPTO la hole card del
-- dealer (2da carta de la banca), que arranca oculta hasta 'turno_dealer'.
-- ============================================================

alter table public.bj_configuracion_sesion enable row level security;
alter table public.bj_shoe                 enable row level security;
alter table public.bj_rondas               enable row level security;
alter table public.bj_manos_jugador        enable row level security;
alter table public.bj_cartas_asignadas     enable row level security;
alter table public.bj_resultados           enable row level security;
alter table public.bj_banca_balance        enable row level security;
alter table public.bj_recompras            enable row level security;

-- Helpers --------------------------------------------------------------
create or replace function public.bj_mesa_de_ronda(p_ronda_id uuid)
returns uuid language sql security definer set search_path = public as $$
  select mesa_id from public.bj_rondas where id = p_ronda_id;
$$;

-- ¿El usuario actual es la banca de esta ronda?
create or replace function public.bj_es_banca_de(p_ronda_id uuid)
returns boolean language sql security definer set search_path = public as $$
  select exists (
    select 1
    from public.bj_rondas r
    join public.jugadores j on j.id = r.banca_jugador_id
    where r.id = p_ronda_id and j.auth_uid = auth.uid()
  );
$$;

-- Lecturas públicas dentro de la mesa (config, shoe, rondas, manos,
-- resultados, balance, recompras).
drop policy if exists bj_config_select on public.bj_configuracion_sesion;
create policy bj_config_select on public.bj_configuracion_sesion for select using (true);

drop policy if exists bj_shoe_select on public.bj_shoe;
create policy bj_shoe_select on public.bj_shoe for select using (true);

drop policy if exists bj_rondas_select on public.bj_rondas;
create policy bj_rondas_select on public.bj_rondas for select using (true);

drop policy if exists bj_manos_select on public.bj_manos_jugador;
create policy bj_manos_select on public.bj_manos_jugador for select using (true);

drop policy if exists bj_resultados_select on public.bj_resultados;
create policy bj_resultados_select on public.bj_resultados for select using (true);

drop policy if exists bj_balance_select on public.bj_banca_balance;
create policy bj_balance_select on public.bj_banca_balance for select using (true);

drop policy if exists bj_recompras_select on public.bj_recompras;
create policy bj_recompras_select on public.bj_recompras for select using (true);

-- Cartas: la hole card oculta del dealer sólo la ven crupier y banca.
drop policy if exists bj_cartas_select on public.bj_cartas_asignadas;
create policy bj_cartas_select on public.bj_cartas_asignadas
  for select using (
    not (es_carta_dealer and es_hole_card and not revelada)
    or public.es_crupier_de(public.bj_mesa_de_ronda(ronda_id))
    or public.bj_es_banca_de(ronda_id)
  );

-- Todas las escrituras van por el servidor (service role, bypass RLS).
