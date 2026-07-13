"use client";

import { useEffect, useState } from "react";

// Muestra el saldo de créditos del usuario. Refresca al montar y cuando
// cambia `refreshKey` (para actualizar tras un buy-in / cash-out).
export function SaldoBadge({ refreshKey = 0 }: { refreshKey?: number }) {
  const [saldo, setSaldo] = useState<number | null>(null);

  useEffect(() => {
    let activo = true;
    fetch("/api/creditos/mi")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (activo && d) setSaldo(d.saldo);
      })
      .catch(() => {});
    return () => {
      activo = false;
    };
  }, [refreshKey]);

  return (
    <a
      href="/perfil"
      className="inline-flex items-center gap-1.5 rounded-full bg-black/30 px-3 py-1 text-sm font-semibold text-oro hover:bg-black/50"
      title="Ver mi perfil y créditos"
    >
      <span className="text-white/50">créditos</span>
      <span className="tabular-nums">
        {saldo === null ? "…" : saldo.toLocaleString("es")}
      </span>
    </a>
  );
}
