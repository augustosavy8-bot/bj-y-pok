// Utilidades varias

const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sin I,O,0,1 para evitar confusión

export function generarCodigoSala(): string {
  let s = "";
  for (let i = 0; i < 6; i++) {
    s += ALFABETO[Math.floor(Math.random() * ALFABETO.length)];
  }
  return s;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function claveJugadorLocal(codigo: string): string {
  return `poker:jugador:${codigo.toUpperCase()}`;
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function errorJson(mensaje: string, status = 400): Response {
  return json({ error: mensaje }, status);
}

// Mapea un error atrapado a una Response, respetando `status` si el error lo
// trae (p. ej. AuthError con 401/403). Útil en el catch de los route handlers.
export function errorFrom(e: unknown, fallback = 400): Response {
  const status =
    e && typeof e === "object" && "status" in e && typeof (e as { status: unknown }).status === "number"
      ? (e as { status: number }).status
      : fallback;
  return errorJson(e instanceof Error ? e.message : "Error", status);
}
