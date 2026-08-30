/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif']
      },
      colors: {
        // Varm, rolig admin-palett – inspirert av referansedesignet.
        paper: '#ece9df', // sidebakgrunn
        card: '#ffffff',
        ink: '#20303a', // primærtekst
        muted: '#8a94a0', // sekundærtekst
        line: '#e0ddd2', // kant mot paper
        hair: '#e9edee', // kant inne i kort
        brand: {
          DEFAULT: '#1f5566',
          dark: '#17414f',
          tint: '#e6eef0'
        },
        zone: '#dce9f1', // gruppe-header
        zoneink: '#3c5a68',
        ok: { DEFAULT: '#1f9d55', tint: '#dcf1e3' },
        danger: { DEFAULT: '#c0392b', tint: '#f8e2df', hover: '#f2d1cc' },
        badge: { DEFAULT: '#cfe3ee', ink: '#1f5566' }
      },
      boxShadow: {
        card: '0 1px 2px rgba(20,32,40,0.04), 0 1px 3px rgba(20,32,40,0.06)',
        pop: '0 12px 40px rgba(20,32,40,0.16)'
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
