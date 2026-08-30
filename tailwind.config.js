/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        navy: "#0B1B2B",
        emerald: "#114B3B",
        wine: "#7A1E3D",
        gold: "#C9A227",
        ivory: "#F7F2E9",
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
