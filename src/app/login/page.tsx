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
        <h1 className="text-3xl font-bold text-oro">♠ Mesa de Poker ♥</h1>
        <p className="mt-1 text-sm text-white/60">Ingresá con tu cuenta</p>
      </div>
      <form onSubmit={entrar} className="panel flex flex-col gap-3 p-5">
        <label className="text-sm text-white/70">
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-xl bg-white/10 p-3"
            autoComplete="email"
          />
        </label>
        <label className="text-sm text-white/70">
          Contraseña
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-xl bg-white/10 p-3"
            autoComplete="current-password"
          />
        </label>
        <button className="btn btn-oro" disabled={cargando}>
          {cargando ? "Ingresando…" : "Ingresar"}
        </button>
        {error && (
          <div className="rounded-lg bg-red-900/50 px-3 py-2 text-center text-sm text-red-100">
            {error}
          </div>
        )}
      </form>
      <p className="text-center text-xs text-white/40">
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
