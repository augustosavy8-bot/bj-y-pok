-- ============================================================
-- 0035_dino_crash_advance_lockfree.sql — menos contención en crash_tick
--
-- Antes _crash_advance tomaba un advisory lock GLOBAL en cada llamada (cada
-- poll de cada jugador), serializándolos. Ahora hace una lectura SIN lock: si
-- la ronda está a mitad de fase (no hay transición pendiente) devuelve el estado
-- directo. Sólo toma el lock cuando hay que avanzar (fin de apuestas, crash, o
-- abrir la próxima ronda). Mucho menos contención con varios jugadores.
-- (Cuerpo del loop de avance idéntico a 0034, con el anti fast-forward.)
-- ============================================================

create or replace function public._crash_advance()
returns public.crash_rounds language plpgsql security definer set search_path=public,extensions as $$
declare c public.crash_config%rowtype; r public.crash_rounds%rowtype;
        v_crash_at timestamptz; v_next_start timestamptz; guard int := 0; v_due bool;
begin
  select * into c from public.crash_config where id=1;

  select * into r from public.crash_rounds order by nonce desc limit 1;
  if found then
    v_due := (r.phase = 'betting' and now() >= r.betting_ends_at)
          or (r.phase = 'running' and now() >= r.running_started_at + ((ln(r.crash_point)/c.growth)::double precision) * interval '1 second')
          or (r.phase = 'crashed' and now() >= r.crashed_at + (c.crash_hold || ' seconds')::interval);
    if not v_due then return r; end if;
  end if;

  perform pg_advisory_xact_lock(759123481);
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
      if v_next_start < now() - interval '3 seconds' then v_next_start := now(); end if;
      r := public._crash_open_round(r.nonce + 1, v_next_start);
      continue;
    end if;

    exit;
  end loop;
  return r;
end; $$;
