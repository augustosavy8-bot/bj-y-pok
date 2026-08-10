-- ============================================================
-- 0025_bonus_calibrado.sql — Valores de bonus calibrados por simulación
--
-- scripts/simulate-bonus.ts calibró por slot:
--   bonus_factor_scale   → los 3 buy tiers quedan en RTP ≈ 95%
--   natural_factor_scale → líneas base + bonus natural = RTP ≈ 95%
--   precios super/max     → 95% a mult_start/increment fijos
-- persistent_mult {start:1,increment:1,max:50} viene de 0024.
-- ============================================================

create or replace function public._set_bonus_cfg(p_slug text, p_buy numeric, p_nat numeric, p_super int, p_max int)
returns void language sql as $$
  update public.slots
  set freespins = freespins || jsonb_build_object(
    'bonus_factor_scale', p_buy,
    'natural_factor_scale', p_nat,
    'buy_tiers', jsonb_build_object(
      'standard', jsonb_build_object('price_x', 100,     'spins', 10, 'mult_start', 1, 'mult_increment', 1),
      'super',    jsonb_build_object('price_x', p_super, 'spins', 10, 'mult_start', 2, 'mult_increment', 2),
      'max',      jsonb_build_object('price_x', p_max,   'spins', 10, 'mult_start', 5, 'mult_increment', 3)
    ))
  where slug = p_slug;
$$;

select public._set_bonus_cfg('el-salon',    3.96, 0.78, 200, 365);
select public._set_bonus_cfg('faraones',    2.89, 0.69, 199, 347);
select public._set_bonus_cfg('olympus',     6.01, 0.76, 199, 400);
select public._set_bonus_cfg('clandestino', 6.58, 0.64, 199, 412);
select public._set_bonus_cfg('cowboy',      5.73, 0.71, 197, 394);

drop function public._set_bonus_cfg(text, numeric, numeric, int, int);
