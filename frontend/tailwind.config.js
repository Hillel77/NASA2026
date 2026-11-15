/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { 950: '#07090d', 900: '#0b0f16', 850: '#10151e', 800: '#151b26', 700: '#1e2633', 600: '#2a3444', 500: '#3a4659' },
        mute: { 400: '#8b97a8', 300: '#a9b4c3', 200: '#cdd5df' },
        accent: { DEFAULT: '#4fa3ff', dim: '#2b6cb0' },
        mars: '#e0773b',
        moon: '#b9c2d0',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: { '2xs': ['0.6875rem', '1rem'] },
    },
  },
  plugins: [],
};
