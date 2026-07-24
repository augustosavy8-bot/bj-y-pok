"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase/client";

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/home";
  const errorInicial =
    params.get("error") === "cuenta-desactivada"
      ? "Tu cuenta fue desactivada. Pedile al admin que la reactive."
      : params.get("error") === "solo-admin"
      ? "Esa sección es solo para administradores."
      : null;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(errorInicial);
  const [cargando, setCargando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setCargando(true);
    setError(null);
    const supabase = getSupabaseBrowser();

    const { data, error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err || !data.user) {
      setError("Email o contraseña incorrectos.");
      setCargando(false);
      return;
    }

    // Verificar que la cuenta esté activa.
    const { data: perfil } = await supabase
      .from("perfiles")
      .select("activo")
      .eq("id", data.user.id)
      .maybeSingle();
    if (perfil && (perfil as { activo: boolean }).activo === false) {
      await supabase.auth.signOut();
      setError("Tu cuenta está desactivada. Pedile al admin que la reactive.");
      setCargando(false);
      return;
    }

    router.replace(next);
    router.refresh();
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-6">
      <div className="text-center">
        <div className="mb-2 flex items-center justify-center gap-2">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="9.3" /><circle cx="12" cy="12" r="4.3" /><path d="M12 2.7V7.2M12 16.8v4.5M2.7 12h4.5M16.8 12h4.5" /></svg>
          <span className="text-lg font-medium tracking-[0.24em]">NOCTURNA</span>
        </div>
        <p className="text-sm text-tinta/60">Ingresá con tu cuenta</p>
      </div>
      <form onSubmit={entrar} className="ncard flex flex-col gap-3 border border-white/[0.06] p-5 shadow-n-md">
        <label className="text-xs text-tinta/70">
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="ninput mt-1"
            autoComplete="email"
          />
        </label>
        <label className="text-xs text-tinta/70">
          Contraseña
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="ninput mt-1"
            autoComplete="current-password"
          />
        </label>
        <button className="nbtn nbtn-primary py-2.5" disabled={cargando}>
          {cargando ? "Ingresando…" : "Ingresar"}
        </button>
        {error && (
          <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-center text-sm text-red-200">
            {error}
          </div>
        )}
      </form>
      <p className="text-center text-xs text-tinta/40">
        ¿No tenés cuenta? El acceso es solo por invitación de un administrador.
      </p>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  );
}
