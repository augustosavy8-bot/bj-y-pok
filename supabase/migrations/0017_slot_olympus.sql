-- ============================================================
-- 0017_slot_olympus.sql — Slot #3 "Legends of Olympus" (dioses griegos)
--
-- Usa la fundación de 0015 (motor/RPC/RLS). Sólo agrega datos: config +
-- símbolos. El tema (arte raster en public/slots/olympus/) vive en el front:
-- src/lib/slots/themes/olympus.ts (registrado en themes/index.ts).
--
-- Wild = 'wild' (medallón del rayo). Scatter = 'scatter' (templo), que dispara
-- los giros gratis. Los weight/value SON el RTP (tuneados por simulación).
-- ============================================================

insert into public.slots (slug, name, tagline, reels, rows, paylines, bet_options, factor, mult_config, freespins, active)
values (
  'olympus', 'Legends of Olympus', '5 rodillos · 9 líneas', 5, 3,
  '[[1,1,1,1,1],[0,0,0,0,0],[2,2,2,2,2],[0,1,2,1,0],[2,1,0,1,2],[0,0,1,2,2],[2,2,1,0,0],[1,0,1,2,1],[1,2,1,0,1]]'::jsonb,
  '{45,90,180,450}',
  '{"3":3.9,"4":7.8,"5":22}'::jsonb,   -- factor tuneado: RTP ≈ 66% (con 11 símbolos)
  '{"x3":0.03,"x2":0.12}'::jsonb,
  '{"trigger":"scatter","min":3,"grant":5}'::jsonb,
  true
)
on conflict (slug) do update set
  name = excluded.name, tagline = excluded.tagline, reels = excluded.reels, rows = excluded.rows,
  paylines = excluded.paylines, bet_options = excluded.bet_options, factor = excluded.factor,
  mult_config = excluded.mult_config, freespins = excluded.freespins, active = excluded.active;

insert into public.slot_symbols (slot_slug, symbol, value, weight, is_wild, sort) values
  ('olympus', 'laurel',   2,  10, false, 1),
  ('olympus', 'anfora',   3,  9,  false, 2),
  ('olympus', 'lira',     4,  8,  false, 3),
  ('olympus', 'ares',     6,  6,  false, 4),
  ('olympus', 'afrodita', 8,  5,  false, 5),
  ('olympus', 'hades',    10, 4,  false, 6),
  ('olympus', 'poseidon', 13, 3,  false, 7),
  ('olympus', 'atenea',   16, 2,  false, 8),
  ('olympus', 'zeus',     22, 1,  false, 9),
  ('olympus', 'wild',     22, 1,  true,  10),
  ('olympus', 'scatter',  5,  1,  false, 11)
on conflict (slot_slug, symbol) do update set
  value = excluded.value, weight = excluded.weight, is_wild = excluded.is_wild, sort = excluded.sort;
