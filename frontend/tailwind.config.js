/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0F172A",
        paper: "#F8FAFC",
        accent: "#0EA5E9",
        danger: "#DC2626"
      }
    }
  },
  plugins: []
};
