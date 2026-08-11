-- ============================================================
-- 0034_dino_crash_no_fastforward.sql — evitar el "fast-forward" tras inactividad
--
-- El reloj de las rondas es una cadena continua anclada a timestamps. Si el
-- juego queda mucho rato sin que nadie juegue, la cadena queda muy atrás y el
-- scheduler perezoso la reproduce de a saltos para ponerse al día (se ven
-- rondas pasando volando al volver a entrar).
--
-- Fix: al abrir la próxima ronda, si su arranque calculado (crashed_at + hold)
-- ya quedó en el pasado por más de unos segundos (= hubo inactividad), se ancla
-- a now() y arranca FRESCA. Así, tras un rato idle, se abre UNA sola ronda nueva
-- desde ahora en vez de reproducir toda la cadena. En juego activo no cambia
-- nada (crashed_at + hold está a ~ms de now, no supera el umbral).
-- ============================================================

create or replace function public._crash_advance()
returns public.crash_rounds language plpgsql security definer set search_path=public,extensions as $$
declare c public.crash_config%rowtype; r public.crash_rounds%rowtype;
        v_crash_at timestamptz; v_next_start timestamptz; guard int := 0;
begin
  perform pg_advisory_xact_lock(759123481);
  select * into c from public.crash_config where id=1;
  select * into r from public.crash_rounds order by nonce desc limit 1;
  if not found then r := public._crash_open_round(1, now()); end if;

  loop
    guard := guard + 1; exit when guard > 6;

    if r.phase = 'betting' and now() >= r.betting_ends_at then
      update public.crash_rounds set phase='running', running_started_at=r.betting_ends_at where id=r.id;
      r.phase := 'running'; r.running_started_at := r.betting_ends_at;
    end if;

    if r.phase = 'running' then
      v_crash_at := r.running_started_at + ((ln(r.crash_point)/c.growth)::double precision) * interval '1 second';
      if now() >= v_crash_at then
        update public.crash_rounds set phase='crashed', crashed_at=v_crash_at where id=r.id;
        update public.crash_bets set status='lost' where round_id=r.id and status='active';
        r.phase := 'crashed'; r.crashed_at := v_crash_at;
      end if;
    end if;

    if r.phase = 'crashed' and now() >= r.crashed_at + (c.crash_hold || ' seconds')::interval then
      v_next_start := r.crashed_at + (c.crash_hold || ' seconds')::interval;
      -- si estuvo inactivo, no reproducir la cadena: arrancar fresco desde ahora
      if v_next_start < now() - interval '3 seconds' then v_next_start := now(); end if;
      r := public._crash_open_round(r.nonce + 1, v_next_start);
      continue;
    end if;

    exit;
  end loop;
  return r;
end; $$;
