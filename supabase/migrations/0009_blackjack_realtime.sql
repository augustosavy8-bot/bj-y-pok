-- ============================================================
-- 0009_blackjack_realtime.sql — Realtime para las tablas de blackjack
-- ============================================================

alter table public.bj_configuracion_sesion replica identity full;
alter table public.bj_shoe                 replica identity full;
alter table public.bj_rondas               replica identity full;
alter table public.bj_manos_jugador        replica identity full;
alter table public.bj_cartas_asignadas     replica identity full;
alter table public.bj_resultados           replica identity full;
alter table public.bj_banca_balance        replica identity full;

do $$
begin
  alter publication supabase_realtime add table
    public.bj_configuracion_sesion,
    public.bj_shoe,
    public.bj_rondas,
    public.bj_manos_jugador,
    public.bj_cartas_asignadas,
    public.bj_resultados,
    public.bj_banca_balance;
exception
  when duplicate_object then null;
end $$;
