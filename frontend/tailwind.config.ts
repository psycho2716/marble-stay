import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
        background: "var(--background)",
        foreground: "var(--foreground)",
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-foreground)",
          50: "#f0f2f5",
          100: "#e2e6ec",
          200: "#c5ccd9",
          300: "#9ca8bd",
          400: "#6d7d98",
          500: "#4a5a75",
          600: "#1a202c",
          700: "#161b26",
          800: "#12161f",
          900: "#0d1017"
        },
        success: {
          DEFAULT: "#16a34a",
          foreground: "#ffffff",
          50: "#f0fdf4",
          100: "#dcfce7",
          500: "#22c55e",
          700: "#15803d",
          800: "#166534"
        },
        rating: {
          DEFAULT: "#eab308",
          foreground: "#1a202c"
        },
        secondary: {
          DEFAULT: "var(--secondary)",
          foreground: "var(--secondary-foreground)"
        },
        destructive: "var(--destructive)",
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)"
        },
        accent: {
          DEFAULT: "var(--accent)",
          foreground: "var(--accent-foreground)"
        },
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--card-foreground)"
        },
        popover: {
          DEFAULT: "var(--popover)",
          foreground: "var(--popover-foreground)"
        }
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"]
      }
    }
  },
  plugins: []
};

export default config;

