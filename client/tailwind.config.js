/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Manrope', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        ink: { 50: '#f2f7f7', 100: '#dcebea', 200: '#b9d6d4', 300: '#8bb9b6', 400: '#5b9693', 500: '#3c7a77', 600: '#2c6260', 700: '#204d4c', 800: '#173e3e', 900: '#0f3d3e', 950: '#0a2829' },
        // Theme-aware tokens (values in src/index.css, swapped by the .dark class).
        paper: 'rgb(var(--paper) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        well: 'rgb(var(--well) / <alpha-value>)',
        slate: Object.fromEntries([50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map((n) => [n, `rgb(var(--slate-${n}) / <alpha-value>)`])),
        ember: { 50: '#fff6ec', 100: '#ffe8cc', 400: '#f6a23a', 500: '#e98a15', 600: '#c96f0a', 700: '#9e550a' },
      },
      boxShadow: {
        card: '0 1px 2px rgba(16, 40, 40, 0.04), 0 1px 3px rgba(16, 40, 40, 0.06)',
        lift: '0 8px 24px -6px rgba(16, 40, 40, 0.18)',
      },
      keyframes: {
        'slide-in': { from: { transform: 'translateX(100%)' }, to: { transform: 'translateX(0)' } },
        'fade-in': { from: { opacity: 0 }, to: { opacity: 1 } },
        'rise': { from: { opacity: 0, transform: 'translateY(6px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
      },
      animation: {
        'slide-in': 'slide-in 220ms cubic-bezier(.2,.8,.2,1)',
        'fade-in': 'fade-in 160ms ease-out',
        rise: 'rise 220ms ease-out',
      },
    },
  },
  plugins: [],
};
