-- ============================================================
-- 0023_slot_cowboy.sql — Slot #5 "Wild West 7" (7 rodillos × 4 filas)
--
-- Primer slot de grilla grande sobre la misma fundación (motor + RPC play_spin
-- sin tocar). 7 rodillos, 4 filas, 30 líneas de pago. 14 símbolos. El wild
-- sustituye; el tren (scatter) dispara 8 giros gratis con 3+. Factor tuneado por
-- simulación Monte Carlo a RTP ≈ 95%. Arte: public/slots/cowboy/*.webp; tema:
-- src/lib/slots/themes/cowboy.ts.
-- ============================================================

insert into public.slots (slug, name, tagline, reels, rows, paylines, bet_options, factor, mult_config, freespins, active)
values (
  'cowboy', 'Wild West 7', '7 rodillos · 30 líneas', 7, 4,
  '[[0,0,0,0,0,0,0],[1,1,1,1,1,1,1],[2,2,2,2,2,2,2],[3,3,3,3,3,3,3],[1,2,2,2,2,2,1],[2,2,2,1,1,0,0],[1,1,0,0,0,1,1],[0,0,0,1,1,2,2],[1,2,2,1,0,0,1],[2,2,1,0,0,2,2],[1,0,0,1,2,2,1],[0,0,1,2,1,1,0],[1,2,2,3,2,2,1],[3,2,2,1,0,0,0],[1,0,0,0,0,0,1],[0,0,0,1,2,2,3],[3,2,0,0,0,2,3],[0,0,2,3,2,0,0],[2,2,2,3,2,2,2],[3,2,2,2,1,1,1],[2,1,1,1,1,1,1],[1,1,1,1,2,2,3],[2,2,2,2,1,1,1],[3,2,1,1,1,2,3],[2,1,1,1,2,2,2],[1,1,2,3,2,1,1],[2,2,3,3,3,2,2],[3,3,2,2,1,0,0],[2,1,0,0,0,1,1],[0,0,1,1,2,3,3]]'::jsonb,
  '{45,90,180,450,900,1800,4500,10000}',
  '{"3":7.84,"4":17.64,"5":43.11,"6":117.57,"7":352.72}'::jsonb,  -- RTP ≈ 95%
  '{"x3":0.03,"x2":0.12}'::jsonb,
  '{"trigger":"scatter","min":3,"grant":8}'::jsonb,
  true
)
on conflict (slug) do update set
  name = excluded.name, tagline = excluded.tagline, reels = excluded.reels, rows = excluded.rows,
  paylines = excluded.paylines, bet_options = excluded.bet_options, factor = excluded.factor,
  mult_config = excluded.mult_config, freespins = excluded.freespins, active = excluded.active;

insert into public.slot_symbols (slot_slug, symbol, value, weight, is_wild, sort) values
  ('cowboy', 's9',      2,  12, false, 1),
  ('cowboy', 's10',     3,  11, false, 2),
  ('cowboy', 'sj',      4,  10, false, 3),
  ('cowboy', 'sq',      5,  9,  false, 4),
  ('cowboy', 'sk',      6,  8,  false, 5),
  ('cowboy', 'sa',      8,  7,  false, 6),
  ('cowboy', 'horse',   10, 5,  false, 7),
  ('cowboy', 'saloon',  12, 4,  false, 8),
  ('cowboy', 'money',   15, 3,  false, 9),
  ('cowboy', 'cowgirl', 20, 2,  false, 10),
  ('cowboy', 'cowboy',  26, 2,  false, 11),
  ('cowboy', 'outlaw',  34, 1,  false, 12),
  ('cowboy', 'wild',    34, 1,  true,  13),
  ('cowboy', 'scatter', 5,  1,  false, 14)
on conflict (slot_slug, symbol) do update set
  value = excluded.value, weight = excluded.weight, is_wild = excluded.is_wild, sort = excluded.sort;
