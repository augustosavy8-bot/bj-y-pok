import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // — Nocturne (identidad nueva) —
        noche: "#161826", // fondo base
        superficie: "#232532", // surface
        tinta: "#e9e9ed", // texto
        acento: {
          DEFAULT: "#9184d9",
          100: "#f5f4ff",
          200: "#e7e5fe",
          300: "#d2cefd",
          400: "#b5abfc",
          500: "#968ae0",
          600: "#796cbf",
          700: "#5d5294",
          800: "#423a6a",
          900: "#2b2741",
        },
        acento2: "#a7a1db",
        seccion: {
          DEFAULT: "#262a60",
          glow: "#353b80",
          ghost: "#4c5397",
        },

        // — Club privado (legado, para las vistas de juego hasta migrarlas) —
        fieltro: {
          DEFAULT: "#0f3d2e",
          dark: "#0a2a20",
          light: "#155843",
        },
        oro: "#e0b64d",
        carta: "#f8f7f2",
        carbon: {
          DEFAULT: "#241a12",
          dark: "#150f0a",
          light: "#3a2a1c",
        },
        crema: "#f1ead9",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
      boxShadow: {
        // Nocturne: borde hairline + oscuridad ambiental
        "n-sm": "0 0 0 1px #3f424d",
        "n-md": "0 0 0 1px #595d6c, 0 6px 18px rgba(0,0,0,0.55)",
        "n-lg": "0 0 0 1px #9397ab, 0 16px 40px rgba(0,0,0,0.65)",
        // Legado
        carta: "0 4px 14px rgba(0,0,0,0.35)",
        mesa: "inset 0 0 120px rgba(0,0,0,0.55)",
        camara: "inset 0 2px 10px rgba(0,0,0,0.6), 0 6px 20px rgba(0,0,0,0.45)",
        asiento: "0 2px 10px rgba(0,0,0,0.35)",
      },
      keyframes: {
        "card-in": {
          "0%": { opacity: "0", transform: "translateY(-12px) scale(0.9)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        "turn-pulse": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(224,182,77,0.7)" },
          "50%": { boxShadow: "0 0 0 8px rgba(224,182,77,0)" },
        },
      },
      animation: {
        "card-in": "card-in 0.35s ease-out",
        "turn-pulse": "turn-pulse 1.6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
export default config;
