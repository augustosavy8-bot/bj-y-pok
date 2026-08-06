# Slots — fundación reutilizable

Motor, API, RPC y esquema son **agnósticos al tema** y se hacen una sola vez.
Cada slot = **1 fila de config + N símbolos en la DB + 1 tema en el front**.

## Regla de oro

El resultado del giro lo decide **siempre el servidor** (RPC `play_spin` en
Postgres, `SECURITY DEFINER`). El cliente sólo pide el resultado y anima los
rodillos hasta la grilla devuelta. La evaluación de líneas vive **sólo** en la
RPC; el front nunca la duplica.

## Piezas

| Pieza | Archivo | Rol |
|---|---|---|
| Esquema + RPC | `supabase/migrations/0015_slots_fundacion.sql` | Tablas, RLS, `play_spin`, `verify_spin`, `slot_build_grid`, seed `el-salon` |
| API giro | `src/app/api/slots/spin/route.ts` | Valida sesión, llama `play_spin`. Cero juego. |
| API verify | `src/app/api/slots/verify/route.ts` | Revela `server_seed` y recomputa la grilla |
| Verify (JS) | `src/lib/slots/verify.ts` | Recompute independiente del HMAC por celda |
| Motor | `src/lib/slots/engine.ts` | Rodillos con Web Animations API (blur, paradas escalonadas). No calcula nada. |
| Temas | `src/lib/slots/themes/*` | SVG + colores por slot |
| Ruta | `src/app/slots/[slug]/page.tsx` | Server component: carga config + saldo → `<SlotMachine>` |
| UI | `src/components/SlotMachine.tsx` | Gabinete + rodillos. Sólo pinta lo que mandó el server. |

## Saldo

No hay tabla `wallets`. El saldo es el **ledger de créditos existente**
(`creditos_movimientos`): `play_spin` descuenta la apuesta y acredita el premio
vía `registrar_movimiento_credito` (tipo `'slots'`). Es el **mismo saldo** que
usan póker y blackjack.

## Provably-fair (commit-reveal)

1. Al jugar, la RPC genera `server_seed` (32 bytes) y devuelve sólo su
   `server_seed_hash = sha256(server_seed)` (compromiso).
2. Cada celda `k` sale de `hmac(client_seed:nonce:k, server_seed)` → uint32 →
   elección por peso. Reproducible.
3. En `/verify` (giro ya cerrado) se **revela** `server_seed`; cualquiera
   recomputa la grilla (`slot_build_grid` en SQL o `recomputarGrid` en JS) y
   confirma `match` y `hash_ok`.

## Cómo agregar un slot nuevo (sin tocar motor ni RPC)

1. **DB — config.** Insertá una fila en `slots`:
   ```sql
   insert into public.slots (slug, name, tagline, reels, rows, paylines,
     bet_options, factor, mult_config, freespins, active)
   values ('mi-slot', 'Mi Slot', '5×3', 5, 3,
     '[[1,1,1,1,1],[0,0,0,0,0], ...]'::jsonb,   -- líneas (largo = reels)
     '{45,90,180,450}',
     '{"3":1,"4":2,"5":6}'::jsonb,
     '{"x3":0.03,"x2":0.12}'::jsonb,
     '{"trigger":"wild","min":3,"grant":3}'::jsonb,
     true);
   ```

2. **DB — símbolos (define el RTP).** Insertá en `slot_symbols`. `weight` y
   `value` son el RTP: cambiarlos ajusta el retorno **sin tocar código**.
   ```sql
   insert into public.slot_symbols (slot_slug, symbol, value, weight, is_wild, sort) values
     ('mi-slot','a', 3, 6, false, 1),
     ...
     ('mi-slot','wild', 18, 1, true, 7);
   ```

3. **Front — tema.** Creá `src/lib/slots/themes/mi-slot.ts` (copiá
   `el-salon.ts`) con los 7+ SVG y colores, y registralo en
   `src/lib/slots/themes/index.ts`:
   ```ts
   import { miSlot } from "./mi-slot";
   export const TEMAS = { "el-salon": elSalon, "mi-slot": miSlot };
   ```

Listo. `/slots` lo lista y `/slots/mi-slot` funciona solo.

> Las claves de `theme.symbols` deben coincidir con los `symbol` de
> `slot_symbols`. El símbolo con `is_wild=true` es el comodín / trigger de
> freespins.

## Deprecado

El slot único viejo (`src/lib/slots/maquina.ts`, `girar.ts`, tabla
`slots_giros`, RPC `slots_registrar_giro`) quedó reemplazado por esta fundación.
Se dejan los archivos por referencia; ya no se importan.
