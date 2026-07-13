/**
 * Crea (o promueve) al primer administrador. Como el signup es cerrado y no
 * podés auto-invitarte, este script usa el service role.
 *
 * Uso (desde la raíz del proyecto):
 *   ADMIN_EMAIL=vos@mail.com ADMIN_PASSWORD=tuClaveLarga ADMIN_NOMBRE="Tu Nombre" \
 *     npx tsx scripts/crear-admin.ts
 *
 * Toma NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY de .env.local.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// Cargar .env.local de forma simple (sin dependencias).
try {
  const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  for (const linea of env.split("\n")) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {
  // sin .env.local: se esperan variables ya en el entorno
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;
const nombre = process.env.ADMIN_NOMBRE || "Admin";

if (!url || !serviceKey) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
if (!email || !password) {
  console.error("Definí ADMIN_EMAIL y ADMIN_PASSWORD (>= 8 caracteres).");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  // Crear el usuario con rol admin en la metadata (el trigger lo respeta).
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nombre, rol: "admin" },
  });

  let userId = data?.user?.id;

  if (error) {
    if (/already registered|exists/i.test(error.message)) {
      // Ya existía: buscar su id por email y promoverlo.
      const { data: lista } = await admin.auth.admin.listUsers();
      userId = lista.users.find((u) => u.email?.toLowerCase() === email!.toLowerCase())?.id;
      if (!userId) throw new Error("El usuario existe pero no se pudo encontrar su id.");
      console.log("El usuario ya existía; lo promuevo a admin.");
    } else {
      throw error;
    }
  }

  // Asegurar el perfil como admin activo.
  const { error: errPerfil } = await admin
    .from("perfiles")
    .upsert({ id: userId!, email: email!, nombre, rol: "admin", activo: true });
  if (errPerfil) throw errPerfil;

  console.log(`✅ Admin listo: ${email}`);
}

main().catch((e) => {
  console.error("❌", e.message ?? e);
  process.exit(1);
});
