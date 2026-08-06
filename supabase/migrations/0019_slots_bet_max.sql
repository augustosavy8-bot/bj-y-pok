-- ============================================================
-- 0019_slots_bet_max.sql — Subir el tope de apuesta de los slots a 10.000
--
-- Nueva escalera de apuestas para TODOS los slots (pasos graduales hasta 10k,
-- así el jugador no salta de golpe). play_spin valida p_bet ∈ bet_options, y la
-- apuesta por defecto en el front es bet_options[0] (la más baja).
-- ============================================================

update public.slots
set bet_options = '{45,90,180,450,900,1800,4500,10000}'
where active = true;
