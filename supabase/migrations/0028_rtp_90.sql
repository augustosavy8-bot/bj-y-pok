-- ============================================================
-- 0028_rtp_90.sql — Bajar el RTP de 95% a 90% en los 5 slots activos.
--
-- Los slots pagaban demasiado. Se recorta ~5 puntos de forma pareja:
--   * factor (pagos de línea del juego base) escalado por 90/95
--   * natural_factor_scale recalibrado para que líneas + bonus natural = 90%
--   * bonus_factor_scale + precios de tiers recalibrados para EV ≈ 90%
-- Valores obtenidos por Monte Carlo en scripts/simulate-bonus.ts (RTP=90).
-- No cambia mecánica: sólo montos. Standard sigue a price_x 100.
-- ============================================================

create or replace function public._set_rtp90(
  p_slug text, p_factor jsonb, p_buy numeric, p_nat numeric, p_super int, p_max int
) returns void language plpgsql as $$
begin
  update public.slots
  set factor = p_factor,
      freespins = jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(freespins,
              '{bonus_factor_scale}', to_jsonb(p_buy)),
            '{natural_factor_scale}', to_jsonb(p_nat)),
          '{buy_tiers,super,price_x}', to_jsonb(p_super)),
        '{buy_tiers,max,price_x}', to_jsonb(p_max))
  where slug = p_slug;
end;
$$;

select public._set_rtp90('el-salon',    '{"3":1.37,"4":2.74,"5":8.22}'::jsonb,                     3.96, 0.81, 200, 363);
select public._set_rtp90('faraones',    '{"3":0.65,"4":1.31,"5":3.92}'::jsonb,                     2.88, 0.67, 201, 348);
select public._set_rtp90('olympus',     '{"3":4.95,"4":9.88,"5":27.88}'::jsonb,                    6.00, 0.71, 200, 402);
select public._set_rtp90('clandestino', '{"3":6.57,"4":13.13,"5":36.16}'::jsonb,                   6.60, 0.77, 201, 411);
select public._set_rtp90('cowboy',      '{"3":7.43,"4":16.71,"5":40.84,"6":111.38,"7":334.16}'::jsonb, 5.77, 0.66, 198, 393);

drop function public._set_rtp90(text, jsonb, numeric, numeric, int, int);
