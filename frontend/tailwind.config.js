/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{svelte,ts,js}'],
  theme: {
    extend: {
      colors: {
        ink: '#23282a',
        'ink-soft': '#4c5254',
        seal: '#9c2b1f',
        'seal-soft': '#c2553f',
        amber: '#b98a3c',
        paper: '#f4efe3',
        'paper-light': '#fffdf6',
        jade: '#3f6b57',
        line: 'rgba(35,40,42,0.14)',
      },
      fontFamily: {
        serif: ['Songti SC', 'Noto Serif SC', 'Source Han Serif SC', 'PingFang SC', 'Microsoft YaHei', 'serif'],
      },
      boxShadow: {
        card: '0 2px 10px rgba(35,40,42,0.06)',
      },
    },
  },
  plugins: [],
};
