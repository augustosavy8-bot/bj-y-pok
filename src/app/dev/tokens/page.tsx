// ============================================================
// /dev/tokens — Página TEMPORAL de revisión de los design tokens.
// Renderiza swatches de todos los tokens en los 3 temas (base / mesa / crash).
// Los swatches usan las clases de Tailwind (que referencian las CSS vars), así
// que reflejan los tokens reales. BORRAR tras aprobar.
// ============================================================

export const dynamic = "force-static";

type Theme = { key: string; label: string; attr?: "mesa" | "crash"; contraste: string; hex: Record<string, string> };

const THEMES: Theme[] = [
  {
    key: "base", label: "Speakeasy — global (base)", attr: undefined, contraste: "texto/bg-0 = 15.2:1",
    hex: { "surface-0": "#160A0D", "surface-1": "#241016", "surface-2": "#4A1220", accent: "#8E2438", "accent-hover": "#A83249", gold: "#C98F3D", "gold-bright": "#E6B35C", ink: "#EFE2CE", "ink-muted": "#B89F8A", "ink-dim": "#7A6555", win: "#3DBB6E", loss: "#E24B4A", edge: "#3A1B22" },
  },
  {
    key: "mesa", label: 'Mesa — data-theme="mesa" (truco / blackjack / póker)', attr: "mesa", contraste: "texto/bg-0 = 13.5:1",
    hex: { "surface-0": "#0A1F14", "surface-1": "#102E1D", "surface-2": "#14532D", accent: "#1F8A50", "accent-hover": "#27A862", gold: "#E6B31E", "gold-bright": "#E6B35C", ink: "#EFE2CE", "ink-muted": "#B89F8A", "ink-dim": "#7A6555", win: "#3DBB6E", loss: "#E24B4A", edge: "#1A3826" },
  },
  {
    key: "crash", label: 'Crash — data-theme="crash" (Dino)', attr: "crash", contraste: "texto/bg-0 = 15.1:1",
    hex: { "surface-0": "#0B0E1A", "surface-1": "#12162A", "surface-2": "#161B33", accent: "#00E5C7", "accent-hover": "#2EF0D6", gold: "#FFC93C", "gold-bright": "#E6B35C", ink: "#EFE2CE", "ink-muted": "#B89F8A", "ink-dim": "#7A6555", win: "#3DBB6E", loss: "#FF2E7E", edge: "#1E2440" },
  },
];

function Swatch({ cls, name, hex, ring }: { cls: string; name: string; hex: string; ring?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className={`h-14 rounded-lg ${cls} ${ring ? "ring-1 ring-inset ring-white/10" : ""}`} />
      <div className="leading-tight">
        <div className="text-[11px] font-medium text-ink">{name}</div>
        <div className="font-mono text-[10px] text-ink-dim">{hex}</div>
      </div>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted">{title}</div>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">{children}</div>
    </div>
  );
}

function ThemeBlock({ t }: { t: Theme }) {
  const h = t.hex;
  return (
    <section
      data-theme={t.attr}
      className="overflow-hidden rounded-2xl border border-edge bg-surface-0 text-ink"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-edge px-5 py-3.5">
        <h2 className="text-[15px] font-semibold text-ink">{t.label}</h2>
        <span className="font-mono text-[11px] text-ink-muted">{t.contraste} · AA ✔</span>
      </div>

      <div className="flex flex-col gap-6 p-5">
        <Group title="Superficies (60/30)">
          <Swatch cls="bg-surface-0" name="surface-0" hex={h["surface-0"]} ring />
          <Swatch cls="bg-surface-1" name="surface-1" hex={h["surface-1"]} />
          <Swatch cls="bg-surface-2" name="surface-2" hex={h["surface-2"]} />
        </Group>

        <Group title="Acento (10%)">
          <Swatch cls="bg-accent" name="accent" hex={h["accent"]} />
          <Swatch cls="bg-accent-hover" name="accent-hover" hex={h["accent-hover"]} />
        </Group>

        <Group title="Oro — SOLO dinero / premios">
          <Swatch cls="bg-gold" name="gold" hex={h["gold"]} />
          <Swatch cls="bg-gold-bright" name="gold-bright" hex={h["gold-bright"]} />
        </Group>

        <Group title="Estados y bordes">
          <Swatch cls="bg-win" name="win" hex={h["win"]} />
          <Swatch cls="bg-loss" name="loss" hex={h["loss"]} />
          <Swatch cls="bg-surface-1 border border-edge" name="edge (borde)" hex={h["edge"]} />
        </Group>

        {/* Texto sobre superficies */}
        <div className="grid gap-3 sm:grid-cols-2">
          {(["bg-surface-0", "bg-surface-1"] as const).map((bg) => (
            <div key={bg} className={`rounded-xl border border-edge p-4 ${bg}`}>
              <div className="mb-2 font-mono text-[10px] text-ink-dim">{bg}</div>
              <p className="text-[15px] text-ink">Texto principal — ink ({h.ink})</p>
              <p className="text-[13px] text-ink-muted">Texto secundario — ink-muted ({h["ink-muted"]})</p>
              <p className="text-[12px] text-ink-dim">Hint / disabled — ink-dim ({h["ink-dim"]})</p>
            </div>
          ))}
        </div>

        {/* Mini-UI de ejemplo: 60/30/10 en contexto */}
        <div className="rounded-xl border border-edge bg-surface-1 p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[12px] uppercase tracking-[0.14em] text-ink-muted">Saldo</span>
            <span className="font-mono text-xl font-bold text-gold">128.400 fichas</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button className="rounded-lg bg-accent px-5 py-2.5 text-sm font-bold text-ink hover:bg-accent-hover">Apostar</button>
            <button className="rounded-lg border border-edge px-4 py-2.5 text-sm text-ink-muted">Cancelar</button>
            <span className="text-sm font-semibold text-win">+ 4.200</span>
            <span className="text-sm font-semibold text-loss">− 1.500</span>
            <span className="ml-auto text-sm font-bold text-gold-bright">¡BIG WIN 25.000!</span>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function TokensDemoPage() {
  return (
    <div className="min-h-screen bg-[#0c0709] px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6">
          <div className="mb-2 inline-block rounded bg-amber-400/15 px-2 py-1 text-[11px] font-semibold text-amber-300">
            Página temporal · revisión de tokens · borrar tras aprobar
          </div>
          <h1 className="text-2xl font-bold text-[#efe2ce]">Design tokens — Nocturna</h1>
          <p className="mt-1 max-w-2xl text-[13px] text-[#b89f8a]">
            Sistema &quot;Speakeasy burdeos&quot; + variantes por tipo de juego. Los swatches usan las clases reales
            (<span className="font-mono">bg-surface-0</span>, <span className="font-mono">text-gold</span>…), que referencian las CSS vars;
            cambiando <span className="font-mono">data-theme</span> se recolorea todo sin clases extra.
          </p>
        </div>

        <div className="flex flex-col gap-6">
          {THEMES.map((t) => <ThemeBlock key={t.key} t={t} />)}
        </div>

        <p className="mt-8 text-center font-mono text-[11px] text-[#7a6555]">
          Reglas: 60/30/10 · gold = solo dinero · texto siempre ink (nunca #fff) · win/loss solo para balance
        </p>
      </div>
    </div>
  );
}
