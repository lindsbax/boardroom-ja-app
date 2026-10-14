/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        navy: "#0B1B2B",
        surface: "#152A40",
        emerald: "#114B3B",
        wine: "#7A1E3D",
        gold: "#C9A227",
        ivory: "#F7F2E9",
        mint: "#4CC199",
        rose: "#D9789B",
      },
      fontFamily: {
        display: ["Cinzel", "serif"],
        serif: ["'Cormorant Garamond'", "serif"],
        sans: ["Jost", "sans-serif"],
      },
    },
  },
  plugins: [],
};
