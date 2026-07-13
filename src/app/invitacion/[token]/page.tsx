"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase/client";

type Estado =
  | { fase: "validando" }
  | { fase: "invalida"; motivo: string }
  | { fase: "ok"; email: string | null };

const MOTIVO: Record<string, string> = {
  no_existe: "Este link de invitación no existe.",
  usada: "Esta invitación ya fue usada.",
  expirada: "Esta invitación expiró.",
  revocada: "Esta invitación fue revocada.",
  sin_token: "Link de invitación inválido.",
};

export default function InvitacionPage() {
  const token = useParams().token as string;
  const router = useRouter();
  const [estado, setEstado] = useState<Estado>({ fase: "validando" });
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/invitacion/validar?token=${encodeURIComponent(token)}`);
      const data = await res.json();
      if (data.valido) {
        setEstado({ fase: "ok", email: data.email });
        if (data.email) setEmail(data.email);
      } else {
        setEstado({ fase: "invalida", motivo: data.motivo ?? "no_existe" });
      }
    })();
  }, [token]);

  async function registrar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== password2) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    setEnviando(true);
    try {
      const res = await fetch("/api/invitacion/aceptar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, nombre, email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "No se pudo completar el registro.");
        setEnviando(false);
        return;
      }
      // Iniciar sesión con la cuenta recién creada.
      const supabase = getSupabaseBrowser();
      const { error: errLogin } = await supabase.auth.signInWithPassword({
        email: data.email,
        password,
      });
      if (errLogin) {
        // La cuenta se creó; mandarlo al login.
        router.replace("/login");
        return;
      }
      router.replace("/home");
      router.refresh();
    } catch {
      setError("Error de red.");
      setEnviando(false);
    }
  }

  if (estado.fase === "validando") {
    return <Centro>Validando invitación…</Centro>;
  }
  if (estado.fase === "invalida") {
    return (
      <Centro>
        <div className="max-w-sm text-center">
          <p className="text-lg font-semibold text-oro">Invitación no válida</p>
          <p className="mt-2 text-sm text-white/70">
            {MOTIVO[estado.motivo] ?? "Este link de invitación ya no es válido."} Pedile
            uno nuevo al admin.
          </p>
        </div>
      </Centro>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-5 p-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-oro">Completar registro</h1>
        <p className="mt-1 text-sm text-white/60">Creá tu cuenta para entrar a la mesa</p>
      </div>
      <form onSubmit={registrar} className="panel flex flex-col gap-3 p-5">
        <label className="text-sm text-white/70">
          Nombre
          <input required value={nombre} onChange={(e) => setNombre(e.target.value)}
            className="mt-1 w-full rounded-xl bg-white/10 p-3" />
        </label>
        <label className="text-sm text-white/70">
          Email
          <input type="email" required value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={!!estado.email}
            className="mt-1 w-full rounded-xl bg-white/10 p-3 disabled:opacity-60" />
        </label>
        <label className="text-sm text-white/70">
          Contraseña
          <input type="password" required value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-xl bg-white/10 p-3" autoComplete="new-password" />
        </label>
        <label className="text-sm text-white/70">
          Repetir contraseña
          <input type="password" required value={password2}
            onChange={(e) => setPassword2(e.target.value)}
            className="mt-1 w-full rounded-xl bg-white/10 p-3" autoComplete="new-password" />
        </label>
        <button className="btn btn-oro" disabled={enviando}>
          {enviando ? "Creando cuenta…" : "Crear cuenta y entrar"}
        </button>
        {error && (
          <div className="rounded-lg bg-red-900/50 px-3 py-2 text-center text-sm text-red-100">
            {error}
          </div>
        )}
      </form>
    </main>
  );
}

function Centro({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-6 text-white/70">
      {children}
    </div>
  );
}
