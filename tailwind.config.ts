import type { Config } from "tailwindcss";

// Design tokens from design.md §3 — semantic colors per card type.
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: "#0E9F6E", dark: "#047857", soft: "#D9F5EC" },
        safety: { DEFAULT: "#E02424", soft: "#FDE8E8" },
        rights: { DEFAULT: "#0E9F6E", soft: "#D9F5EC" },
        benefit: { DEFAULT: "#C27803", soft: "#FDF6B2" },
        facility: { DEFAULT: "#1C64F2", soft: "#E1EFFE" },
        line: { DEFAULT: "#06C755", dark: "#04A94B" },
        canvas: "#F7F8FA",
        surface: "#FFFFFF",
        hairline: "#E5E7EB",
        ink: { DEFAULT: "#111827", soft: "#4B5563", muted: "#9CA3AF" },
        info: "#1C64F2",
        warn: "#C27803",
        review: "#6B7280",
      },
      fontFamily: {
        sans: ["var(--font-thai)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        card: "16px",
        btn: "12px",
      },
      boxShadow: {
        card: "0 1px 3px rgba(0,0,0,.08), 0 1px 2px rgba(0,0,0,.04)",
        emergency: "0 0 0 2px #E02424 inset",
        sheet: "0 -8px 30px rgba(0,0,0,.12)",
      },
      keyframes: {
        "card-in": {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-ring": {
          "0%": { boxShadow: "0 0 0 0 rgba(224,36,36,.45)" },
          "70%": { boxShadow: "0 0 0 18px rgba(224,36,36,0)" },
          "100%": { boxShadow: "0 0 0 0 rgba(224,36,36,0)" },
        },
      },
      animation: {
        "card-in": "card-in .25s ease-out both",
        "pulse-ring": "pulse-ring 1.4s ease-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
