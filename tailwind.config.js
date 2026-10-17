/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        navy: "#070D1A",
        surface: "#0F1729",
        emerald: "#0B5D45",
        wine: "#7F1D3A",
        gold: "#D4A33A",
        ivory: "#F7F2E9",
        mint: "#0B9A68",
        rose: "#D6455D",
      },
      fontFamily: {
        display: ["Jost", "sans-serif"],
        serif: ["Jost", "sans-serif"],
        sans: ["Jost", "sans-serif"],
      },
    },
  },
  plugins: [],
};
