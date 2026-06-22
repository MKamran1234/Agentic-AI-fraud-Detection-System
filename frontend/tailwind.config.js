/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        shell: "#090b10",
        panel: "#11151d",
        panelSoft: "#171d26",
        line: "#293241",
        mint: "#3ddc97",
        aqua: "#24c6dc",
        danger: "#ff4d6d",
        warning: "#f2b84b",
        violet: "#9b8cff"
      },
      boxShadow: {
        glow: "0 0 26px rgba(36, 198, 220, 0.16)"
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"]
      }
    },
  },
  plugins: [],
};
