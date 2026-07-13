-- ============================================================
-- 0014_banca_fija.sql — Opción de banca fija (sin rotación) en blackjack
-- ============================================================

-- Agregar 'fija' a los valores permitidos de rotacion_banca.
alter table public.bj_configuracion_sesion
  drop constraint if exists bj_configuracion_sesion_rotacion_banca_check;

alter table public.bj_configuracion_sesion
  add constraint bj_configuracion_sesion_rotacion_banca_check
  check (rotacion_banca in ('por_mano','cada_5','cada_10','hasta_fundirse','fija'));

-- Jugador designado como banca fija (solo aplica cuando rotacion_banca='fija').
-- Nota: en este proyecto "usuario en la mesa" = fila de jugadores; por eso se
-- referencia jugadores(id), consistente con orden_banca y bj_rondas.banca_jugador_id.
alter table public.bj_configuracion_sesion
  add column if not exists banca_fija_jugador_id uuid
    references public.jugadores(id) on delete set null;
