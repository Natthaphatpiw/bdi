import type { Config } from "tailwindcss";

// HealthTech design tokens — white · navy (กรมท่า) · deep blue · sky · black.
// Components reference these semantic names, so changing the hex here recolors
// the whole app (web + LIFF) consistently. Red is reserved for emergencies only.
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // primary = deep navy (กรมท่า)
        brand: { DEFAULT: "#16315B", dark: "#0F2444", soft: "#E8EEF6" },
        // emergency only
        safety: { DEFAULT: "#DC2626", soft: "#FEF2F2" },
        // covered / free — clinical teal
        rights: { DEFAULT: "#0E7490", soft: "#E0F2FE" },
        // entitlements / money — muted amber accent
        benefit: { DEFAULT: "#B45309", soft: "#FEF3C7" },
        // facilities — deep blue
        facility: { DEFAULT: "#2563EB", soft: "#EFF6FF" },
        // LINE brand (share-to-chat actions only)
        line: { DEFAULT: "#06C755", dark: "#04A94B" },
        canvas: "#F8FAFC",
        surface: "#FFFFFF",
        hairline: "#E2E8F0",
        ink: { DEFAULT: "#0F172A", soft: "#475569", muted: "#94A3B8" },
        info: "#0EA5E9",
        warn: "#B45309",
        review: "#64748B",
      },
      fontFamily: {
        sans: ["var(--font-thai)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        card: "12px",
        btn: "10px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(15,23,42,.06), 0 1px 3px rgba(15,23,42,.05)",
        emergency: "0 0 0 2px #DC2626 inset",
        sheet: "0 -8px 30px rgba(15,23,42,.14)",
      },
      keyframes: {
        "card-in": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-ring": {
          "0%": { boxShadow: "0 0 0 0 rgba(220,38,38,.4)" },
          "70%": { boxShadow: "0 0 0 16px rgba(220,38,38,0)" },
          "100%": { boxShadow: "0 0 0 0 rgba(220,38,38,0)" },
        },
        "pulse-ring-brand": {
          "0%": { boxShadow: "0 0 0 0 rgba(22,49,91,.35)" },
          "70%": { boxShadow: "0 0 0 22px rgba(22,49,91,0)" },
          "100%": { boxShadow: "0 0 0 0 rgba(22,49,91,0)" },
        },
        rise: {
          "0%": { opacity: "0", transform: "translateY(40px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "card-in": "card-in .22s ease-out both",
        "pulse-ring": "pulse-ring 1.4s ease-out infinite",
        "pulse-ring-brand": "pulse-ring-brand 1.6s ease-out infinite",
        rise: "rise .28s cubic-bezier(.16,1,.3,1) both",
      },
    },
  },
  plugins: [],
};

export default config;
