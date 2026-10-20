/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0f0fa', 100: '#dedff3', 200: '#bfc0e6', 300: '#9495d1', 400: '#6b6cbb',
          500: '#48499f', 600: '#343584', 700: '#292a72', 800: '#212266', 900: '#1a1b5c',
        },
        accent: {
          50: '#fff4ef', 100: '#ffe3d7', 200: '#ffc6af', 300: '#ffa07e', 400: '#ff7951',
          500: '#fd4219', 600: '#e63410', 700: '#b22106', 800: '#8d1f0d', 900: '#711d10',
        },
        brand: { navy: '#1A1B5C', orange: '#FD4219', intense: '#FD3300', brick: '#B22106', green: '#009444', red: '#E1251B', blue: '#0072BC' },
        sidebar: {
          DEFAULT: '#1A1B5C', hover: '#292a72', active: '#FD4219', text: '#dedff3',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
