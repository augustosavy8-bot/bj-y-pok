-- ============================================================
-- 0020_slots_rtp_95.sql — Subir el RTP de los slots a ~95%
--
-- El RTP escala linealmente con el `factor` de pago (pay ∝ factor). Se
-- recalculó por simulación Monte Carlo (100 giros, incluyendo giros gratis y
-- retriggers) el factor que lleva cada slot a ~95% de retorno (casa ≈ 5%).
-- No cambian pesos ni valores de símbolos: sólo el factor. play_spin lee esto
-- de la DB, así que el cambio es inmediato y tunéable sin tocar código.
--
--   el-salon    65.8% -> 95%
--   faraones    69.4% -> 95%
--   olympus     71.2% -> 95%
--   clandestino 67.3% -> 95%
-- ============================================================

update public.slots set factor = '{"3":1.45,"4":2.89,"5":8.68}'::jsonb   where slug = 'el-salon';
update public.slots set factor = '{"3":0.69,"4":1.38,"5":4.14}'::jsonb   where slug = 'faraones';
update public.slots set factor = '{"3":5.22,"4":10.43,"5":29.43}'::jsonb where slug = 'olympus';
update public.slots set factor = '{"3":6.93,"4":13.86,"5":38.17}'::jsonb where slug = 'clandestino';
