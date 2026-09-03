/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif']
      },
      colors: {
        // Nøytral, moderne admin-palett med oransje aksent.
        paper: '#f6f6f7', // sidebakgrunn (kjølig off-white)
        card: '#ffffff',
        ink: '#1c1d1f', // primærtekst (nær-svart)
        muted: '#8b8d94', // sekundærtekst
        line: '#e9e9ec', // kant mot paper
        hair: '#f0f0f2', // kant inne i kort
        brand: {
          DEFAULT: '#f15a29', // oransje aksent
          dark: '#d94d1e',
          tint: '#fdeee7'
        },
        zone: '#f4f4f6', // gruppe-header
        zoneink: '#6a6c72',
        ok: { DEFAULT: '#16a34a', tint: '#e4f6ea' },
        danger: { DEFAULT: '#e0393a', tint: '#fdeceb', hover: '#f9dcdb' },
        badge: { DEFAULT: '#eeeef0', ink: '#52545a' }
      },
      boxShadow: {
        card: '0 1px 2px rgba(17,18,20,0.04), 0 1px 3px rgba(17,18,20,0.05)',
        pop: '0 8px 30px rgba(17,18,20,0.12)'
      },
      keyframes: {
        'alert-in': {
          '0%': { opacity: '0', transform: 'translateY(24px) scale(0.96)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' }
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' }
        }
      },
      animation: {
        'alert-in': 'alert-in 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
        'fade-in': 'fade-in 0.4s ease'
      }
    }
  },
  plugins: []
};
