/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        scope: {
          bg: "#0F1B2D",      // deep clinical navy — hero/header
          bgLight: "#F7F4EE", // parchment — content area
          accent: "#E85D3D",  // fundus coral-red — primary actions/alerts
          accentSoft: "#F3A98C",
          trust: "#6F9285",   // muted sage — calm secondary, "safe" states
          text: "#1C2430",
          textInverse: "#F7F4EE",
          line: "#D8D2C4",
        },
      },
      fontFamily: {
        display: ["'Fraunces'", "serif"],
        body: ["'IBM Plex Sans'", "sans-serif"],
        mono: ["'IBM Plex Mono'", "monospace"],
      },
      keyframes: {
        scan: {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100%)" },
        },
      },
      animation: {
        scan: "scan 2.2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
}
