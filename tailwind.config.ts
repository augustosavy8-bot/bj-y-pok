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
        fieltro: {
          DEFAULT: "#0f3d2e",
          dark: "#0a2a20",
          light: "#155843",
        },
        oro: "#e0b64d",
        carta: "#f8f7f2",
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
      boxShadow: {
        carta: "0 4px 14px rgba(0,0,0,0.35)",
        mesa: "inset 0 0 120px rgba(0,0,0,0.55)",
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
