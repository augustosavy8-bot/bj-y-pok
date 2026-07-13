# 🃏 Mesa de Poker — Texas Hold'em con crupier físico

Webapp para jugar Texas Hold'em a distancia con amigos. **Vos sos el crupier**: repartís cartas físicas reales y las mostrás a una webcam. Claude (Haiku con visión) lee cada carta, vos confirmás, y el sistema la reparte automáticamente. Los jugadores entran desde el celular, ven sus cartas privadas y apuestan con fichas virtuales.

- **Stack:** Next.js 14 (App Router) · Supabase (Postgres + Realtime + Auth anónima) · Tailwind · Anthropic API · `pokersolver`
- **Deploy:** Vercel

---

# A. Setup del proyecto Supabase (UNA sola vez)

Esto lo hace **una persona**, cuando se crea el proyecto. No hace falta repetirlo
por cada dev ni por cada deploy.

### A.1 — Crear el proyecto y correr las migraciones

1. Creá un proyecto en [supabase.com](https://supabase.com).
2. Abrí el **SQL Editor** y corré, **en orden**, los archivos de
   [`supabase/migrations/`](supabase/migrations/):

   | Archivo | Qué hace |
   |---|---|
   | `0001_schema.sql` | Tablas: mesas, jugadores, manos, cartas, acciones + función helper |
   | `0002_rls.sql` | Row Level Security (privacidad de cartas ocultas) |
   | `0003_realtime.sql` | Habilita Realtime en las 5 tablas |
   | `0004_configuracion_manual.sql` | **Solo comentarios** — checklist de toggles del dashboard |
   | `0005_historial_y_correcciones.sql` | `acciones.fase` + tabla de auditoría `correcciones_cartas` |

### A.2 — Toggles manuales del dashboard

Estos **no** se pueden setear por SQL. Ver también `0004_configuracion_manual.sql`.

**1) Autenticación anónima** — _imprescindible_.
Sin esto, ningún jugador ve sus cartas y las apuestas fallan.

```
Dashboard → Authentication → Sign In / Providers
  └─ sección "Anonymous sign-ins"
       └─ [x] Allow anonymous sign-ins     ← ACTIVAR
```

**2) Realtime en las tablas** — normalmente ya lo dejó `0003_realtime.sql`.
Para verificar / activar a mano:

```
Dashboard → Database → Publications → "supabase_realtime"
  ├─ [x] public.mesas
  ├─ [x] public.jugadores
  ├─ [x] public.manos
  ├─ [x] public.cartas       (cartas + feed dependen de esto)
  └─ [x] public.acciones     (historial de acciones depende de esto)
```

> La tabla `correcciones_cartas` (auditoría) **no** necesita Realtime.

Chequeo rápido por SQL de que Realtime quedó bien:

```sql
select tablename from pg_publication_tables
where pubname = 'supabase_realtime' order by tablename;
-- Debe listar: acciones, cartas, jugadores, manos, mesas
```

### A.3 — Copiar las claves

```
Dashboard → Settings → API
  ├─ Project URL          → NEXT_PUBLIC_SUPABASE_URL
  ├─ anon public key      → NEXT_PUBLIC_SUPABASE_ANON_KEY
  └─ service_role key     → SUPABASE_SERVICE_ROLE_KEY   (¡secreta!)
```

---

# B. Setup local (cada dev)

### B.1 — Variables de entorno

Copiá `.env.local.example` a `.env.local` y completá con las claves de A.3
(pedíselas a quien creó el proyecto) más tu `ANTHROPIC_API_KEY`:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
ANTHROPIC_API_KEY=sk-ant-...
```

> `SUPABASE_SERVICE_ROLE_KEY` y `ANTHROPIC_API_KEY` son **secretas**: sólo se
> usan en el servidor (route handlers). Nunca se exponen al cliente.

### B.2 — Correr

```bash
npm install
npm run dev
```

Abrí <http://localhost:3000>.

> La cámara (`getUserMedia`) requiere **HTTPS** o `localhost`. En producción,
> Vercel ya sirve por HTTPS.

---

# C. Deploy en Vercel

1. Subí el repo a GitHub e importalo en Vercel.
2. Cargá las **4 variables de entorno** en
   **Project Settings → Environment Variables**.
3. Deploy. (El proyecto Supabase ya está configurado desde el paso A.)

---

## Cómo se juega

### Crupier (vos) — `/mesa/[codigo]/crupier`
1. En la home, tocá **"Soy el crupier — crear mesa"**, definí ciegas y fichas.
2. Compartí el enlace `/mesa/CODIGO` con tus amigos.
3. Cuando estén todos sentados, tocá **Iniciar mano nueva** (rota el botón y
   cobra las ciegas automáticamente).
4. Repartí las cartas físicas y escaneá cada una en la **estación de escaneo**:
   apoyala en el recuadro guía y tocá **Escanear carta**. Claude la lee; confirmás
   o corregís. El panel te dice a quién le toca la próxima carta.
   - **Preflop:** 2 ocultas por jugador (dos vueltas, en orden de reparto).
   - **Flop / Turn / River:** cartas comunitarias.
5. Cuando la ronda de apuestas se cierra, tocá **Avanzar fase** y escaneá la
   siguiente calle. En el river, **Avanzar fase** resuelve el showdown y reparte
   el pozo (incluye side pots y empates).
6. **¿La IA leyó mal una carta?** Pasá el mouse por encima de cualquier carta ya
   asignada (en tablet el lápiz ✎ se ve siempre) y corregила desde el modal. El
   cambio se propaga en vivo a los jugadores que corresponda (RLS: la hole card
   sólo a su dueño, las comunitarias a todos). Cada corrección queda registrada
   en `correcciones_cartas` para auditoría. No se puede corregir una mano ya
   terminada.
7. El **panel lateral derecho** muestra el historial de la mano en vivo.

### Jugadores — `/mesa/[codigo]`
- Entran con su nombre desde el celular, ven sus 2 cartas, las comunitarias, el
  pozo, las fichas de todos y de quién es el turno.
- En su turno: **Retirarse / Pasar / Igualar / Subir (slider) / All-in**.
- **Historial:** drawer colapsable desde abajo con las acciones de la mano en
  lenguaje natural y separadores de fase (`— FLOP: A♠ K♥ 3♦ —`). Un badge avisa
  cuántas acciones nuevas hubo desde que lo abriste por última vez.

---

## Notas de diseño

- **Privacidad de cartas:** las cartas `hole` están protegidas por RLS —
  Realtime respeta las policies de `SELECT`, así que un jugador nunca recibe las
  cartas de otro. El crupier ve todo.
- **Toda la lógica de apuestas es server-side** (route handlers con la
  `service_role key`) para que el cliente no pueda hacer trampa.
- **Motor de juego:** ver [`src/lib/poker/`](src/lib/poker/) (turnos, min-raise,
  reapertura de acción, side pots) y [`src/lib/server/juego.ts`](src/lib/server/juego.ts)
  (orquestación de la mano).
- **Historial de acciones:** cada acción guarda su `fase`; el feed deriva los
  separadores de calle a partir de ese dato + la fase actual de la mano (vía
  Realtime), así que se reconstruye correcto incluso al recargar o entrar tarde.
- **Corrección de cartas:** endpoint `PATCH /api/carta/corregir` — valida crupier,
  estado de la mano y duplicados con la `service_role key`, hace el `UPDATE` y
  registra el cambio en `correcciones_cartas`.

### Limitaciones conocidas
- El heads-up (2 jugadores) usa la regla estándar (dealer = small blind) pero no
  cubre todos los casos raros de acción.
- El crupier controla el ritmo manualmente (escanear + avanzar fase); no hay
  timers ni auto-run-out: como las cartas son físicas, siempre hay que escanearlas.
