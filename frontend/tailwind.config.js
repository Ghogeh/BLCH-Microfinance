/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        'loan-open':      '#3B82F6',
        'loan-funding':   '#F59E0B',
        'loan-active':    '#10B981',
        'loan-repaid':    '#6366F1',
        'loan-defaulted': '#EF4444',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [require('@tailwindcss/forms')],
}
