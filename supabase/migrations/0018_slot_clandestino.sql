-- ============================================================
-- 0018_slot_clandestino.sql — Slot #4 "Casino Clandestino" (mafia años 20)
--
-- Fundación de 0015 (motor/RPC/RLS). Arte raster en public/slots/clandestino/
-- (tema clandestino.ts, tile:true). Wild = 'wild'; Scatter = 'scatter' (dispara
-- giros gratis). El factor se tunea por simulación (13 símbolos → RTP bajo).
-- ============================================================

insert into public.slots (slug, name, tagline, reels, rows, paylines, bet_options, factor, mult_config, freespins, active)
values (
  'clandestino', 'Casino Clandestino', '5 rodillos · 9 líneas', 5, 3,
  '[[1,1,1,1,1],[0,0,0,0,0],[2,2,2,2,2],[0,1,2,1,0],[2,1,0,1,2],[0,0,1,2,2],[2,2,1,0,0],[1,0,1,2,1],[1,2,1,0,1]]'::jsonb,
  '{45,90,180,450}',
  '{"3":4.9,"4":9.8,"5":27}'::jsonb,   -- factor tuneado: RTP ≈ 67% (13 símbolos)
  '{"x3":0.03,"x2":0.12}'::jsonb,
  '{"trigger":"scatter","min":3,"grant":5}'::jsonb,
  true
)
on conflict (slug) do update set
  name = excluded.name, tagline = excluded.tagline, reels = excluded.reels, rows = excluded.rows,
  paylines = excluded.paylines, bet_options = excluded.bet_options, factor = excluded.factor,
  mult_config = excluded.mult_config, freespins = excluded.freespins, active = excluded.active;

insert into public.slot_symbols (slot_slug, symbol, value, weight, is_wild, sort) values
  ('clandestino', 'fichas',  2,  10, false, 1),
  ('clandestino', 'dados',   3,  9,  false, 2),
  ('clandestino', 'reloj',   4,  8,  false, 3),
  ('clandestino', 'whisky',  5,  7,  false, 4),
  ('clandestino', 'tommy',   6,  5,  false, 5),
  ('clandestino', 'maletin', 8,  4,  false, 6),
  ('clandestino', 'ruleta',  10, 3,  false, 7),
  ('clandestino', 'maton',   12, 3,  false, 8),
  ('clandestino', 'femme',   15, 2,  false, 9),
  ('clandestino', 'bonus',   18, 1,  false, 10),
  ('clandestino', 'padrino', 22, 1,  false, 11),
  ('clandestino', 'wild',    22, 1,  true,  12),
  ('clandestino', 'scatter', 5,  1,  false, 13)
on conflict (slot_slug, symbol) do update set
  value = excluded.value, weight = excluded.weight, is_wild = excluded.is_wild, sort = excluded.sort;
