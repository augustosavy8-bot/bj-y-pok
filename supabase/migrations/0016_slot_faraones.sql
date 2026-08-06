-- ============================================================
-- 0016_slot_faraones.sql — Slot #2 "Faraones" (temática egipcia)
--
-- Usa la fundación de 0015 (motor, RPC play_spin, RLS). Sólo agrega datos:
-- la fila de config + los símbolos. El tema (SVG/colores) vive en el front:
-- src/lib/slots/themes/faraones.ts (registrado en themes/index.ts).
--
-- La máscara de faraón es el comodín (is_wild) y el trigger de giros gratis.
-- Los weight/value SON el RTP: tunéables sin tocar código.
-- ============================================================

insert into public.slots (slug, name, tagline, reels, rows, paylines, bet_options, factor, mult_config, freespins, active)
values (
  'faraones', 'Faraones', '5 rodillos · 9 líneas', 5, 3,
  '[[1,1,1,1,1],[0,0,0,0,0],[2,2,2,2,2],[0,1,2,1,0],[2,1,0,1,2],[0,0,1,2,2],[2,2,1,0,0],[1,0,1,2,1],[1,2,1,0,1]]'::jsonb,
  '{45,90,180,450}',
  '{"3":0.5,"4":1,"5":3}'::jsonb,   -- factor tuneado: RTP ≈ 66% (casa ≈ 34%)
  '{"x3":0.03,"x2":0.12}'::jsonb,
  '{"trigger":"mascara","min":3,"grant":3}'::jsonb,
  true
)
on conflict (slug) do update set
  name = excluded.name, tagline = excluded.tagline, reels = excluded.reels, rows = excluded.rows,
  paylines = excluded.paylines, bet_options = excluded.bet_options, factor = excluded.factor,
  mult_config = excluded.mult_config, freespins = excluded.freespins, active = excluded.active;

insert into public.slot_symbols (slot_slug, symbol, value, weight, is_wild, sort) values
  ('faraones', 'escarabajo', 3,  8, false, 1),
  ('faraones', 'ankh',       4,  6, false, 2),
  ('faraones', 'piramide',   6,  3, false, 3),
  ('faraones', 'ojo',        10, 2, false, 4),
  ('faraones', 'mascara',    16, 1, true,  5)
on conflict (slot_slug, symbol) do update set
  value = excluded.value, weight = excluded.weight, is_wild = excluded.is_wild, sort = excluded.sort;
