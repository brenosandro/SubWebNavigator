/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      screens: { xs: '480px' },
      fontFamily: { sans: ['Montserrat', 'sans-serif'] },
      colors: {
        brand: {
          50: '#f4f4f5',
          100: '#e4e4e7',
          200: '#d4d4d8',
          300: '#a1a1aa',
          400: '#71717a',
          500: '#52525b',
          600: '#3f3f46',
          700: '#27272a',
          800: '#18181b',
          900: '#09090b',
        },
      },
      boxShadow: {
        'premium-soft': '0 2px 10px rgba(0, 0, 0, 0.02), 0 1px 3px rgba(0, 0, 0, 0.04)',
        'premium-md': '0 4px 15px rgba(0, 0, 0, 0.03), 0 2px 4px rgba(0, 0, 0, 0.04)',
        'premium-dark': '0 2px 10px rgba(0, 0, 0, 0.15), 0 1px 3px rgba(0, 0, 0, 0.2)',
      },
      letterSpacing: { 'tight-premium': '-0.015em' },
      fontWeight: { bold: '600', extrabold: '700', black: '700' },
      width: { 'icon-xs': '10px', 'icon-sm': '12px', icon: '14px', 'icon-md': '16px' },
      height: { 'icon-xs': '10px', 'icon-sm': '12px', icon: '14px', 'icon-md': '16px' },
    },
  },
  plugins: [],
};
