import Anthropic from "@anthropic-ai/sdk";
import { json, errorJson } from "@/lib/utils";
import { VALORES, PALOS } from "@/lib/types";
import type { Valor, Palo } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

const PROMPT = `Sos un lector experto de cartas de póker. En la imagen hay UNA carta de una baraja francesa estándar apoyada frente a la cámara.
Identificá su valor y su palo.

Respondé ÚNICAMENTE con un objeto JSON válido, sin texto adicional, sin markdown, con esta forma exacta:
{"valor": "<uno de: 2,3,4,5,6,7,8,9,10,J,Q,K,A>", "palo": "<uno de: corazones,diamantes,treboles,picas>", "confianza": <número entre 0 y 1>}

Reglas:
- "valor" en mayúscula para las figuras (J, Q, K, A) y como número para el resto (usá "10", no "T").
- "palo": corazones (♥ rojo), diamantes (♦ rojo), treboles (♣ negro), picas (♠ negro).
- "confianza" refleja qué tan seguro estás (1 = totalmente seguro).
- Si no distinguís bien la carta, igual devolvé tu mejor estimación con confianza baja.`;

function extraerJSON(texto: string): unknown {
  const limpio = texto.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "");
  const inicio = limpio.indexOf("{");
  const fin = limpio.lastIndexOf("}");
  if (inicio === -1 || fin === -1) throw new Error("No se encontró JSON en la respuesta");
  return JSON.parse(limpio.slice(inicio, fin + 1));
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return errorJson("Falta ANTHROPIC_API_KEY en el servidor", 500);

    const body = await req.json();
    const imagen: string | undefined = body?.imagen;
    if (!imagen) return errorJson("Falta la imagen (base64 JPEG)", 400);

    // Aceptar tanto "data:image/jpeg;base64,XXXX" como el base64 puro.
    const base64 = imagen.includes(",") ? imagen.split(",")[1] : imagen;

    const anthropic = new Anthropic({ apiKey });
    const respuesta = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 200,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: "image/jpeg", data: base64 },
            },
            { type: "text", text: PROMPT },
          ],
        },
      ],
    });

    const bloque = respuesta.content.find((b) => b.type === "text");
    const texto = bloque && bloque.type === "text" ? bloque.text : "";
    const parsed = extraerJSON(texto) as {
      valor?: string;
      palo?: string;
      confianza?: number;
    };

    const valor = parsed.valor as Valor;
    const palo = parsed.palo as Palo;
    if (!VALORES.includes(valor) || !PALOS.includes(palo)) {
      return json(
        {
          error: "La IA no devolvió un valor/palo válido",
          crudo: texto,
        },
        422
      );
    }

    return json({
      valor,
      palo,
      confianza:
        typeof parsed.confianza === "number"
          ? Math.max(0, Math.min(1, parsed.confianza))
          : 0.5,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error desconocido";
    return errorJson("Error al leer la carta: " + msg, 500);
  }
}
