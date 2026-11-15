/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { 950: '#06080c', 925: '#090c12', 900: '#0c1018', 875: '#0f141d', 850: '#121823', 800: '#171e2b', 750: '#1c2433', 700: '#222b3b', 600: '#2d384b', 500: '#3d4a60' },
        mute: { 500: '#6f7c8f', 400: '#8b97a8', 300: '#a9b4c3', 200: '#cdd5df', 100: '#e6ebf2' },
        accent: { DEFAULT: '#4fa3ff', dim: '#2b6cb0', soft: 'rgba(79,163,255,0.12)' },
        mars: '#e0773b',
        moon: '#b9c2d0',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: { '2xs': ['0.6875rem', '1rem'], 'xs2': ['0.75rem', '1.125rem'] },
      boxShadow: {
        panel: '0 1px 0 rgba(255,255,255,0.03) inset, 0 8px 24px -12px rgba(0,0,0,0.6)',
        float: '0 12px 40px -12px rgba(0,0,0,0.75), 0 0 0 1px rgba(255,255,255,0.04)',
      },
    },
  },
  plugins: [],
};
