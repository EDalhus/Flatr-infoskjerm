/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif']
      },
      colors: {
        // Mørk lilla admin-palett med magenta aksent og gul highlight.
        paper: '#2b0d40', // sidebakgrunn (mørkeste lilla)
        card: '#3a1f73', // flate / kort (indigo)
        ink: '#f2edff', // primærtekst (nær-hvit lavendel)
        muted: '#a999cf', // sekundærtekst
        line: '#4e3196', // kant mot paper
        hair: '#472c88', // kant inne i kort
        brand: {
          DEFAULT: '#bc17bf', // magenta aksent
          dark: '#9d0fa0',
          tint: '#4a1566' // mørk magenta-vask (aktiv nav-bakgrunn)
        },
        focus: '#3e22f2', // elektrisk blå – fokusring / avkryssing
        zone: '#33195f', // gruppe-header
        zoneink: '#bcabde',
        ok: { DEFAULT: '#34d399', tint: '#123a30' },
        danger: { DEFAULT: '#fb7185', tint: '#4a1626', hover: '#5c1b2f' },
        badge: { DEFAULT: '#f2ea79', ink: '#2b0d40' } // gul brikke, mørk tekst
      },
      boxShadow: {
        card: '0 1px 2px rgba(0,0,0,0.30)',
        pop: '0 10px 40px rgba(0,0,0,0.55)'
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
