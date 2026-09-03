/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif']
      },
      colors: {
        // Tokens peker på CSS-variabler så temaet kan byttes i runtime
        // (se src/index.css + ThemePicker). Verdiene er "R G B"-tripler.
        paper: 'rgb(var(--c-paper) / <alpha-value>)', // sidebakgrunn
        card: 'rgb(var(--c-card) / <alpha-value>)', // flate / kort
        ink: 'rgb(var(--c-ink) / <alpha-value>)', // primærtekst
        muted: 'rgb(var(--c-muted) / <alpha-value>)', // sekundærtekst
        line: 'rgb(var(--c-line) / <alpha-value>)', // kant mot paper
        hair: 'rgb(var(--c-hair) / <alpha-value>)', // kant inne i kort
        brand: {
          DEFAULT: 'rgb(var(--c-brand) / <alpha-value>)',
          dark: 'rgb(var(--c-brand-dark) / <alpha-value>)',
          tint: 'rgb(var(--c-brand-tint) / <alpha-value>)'
        },
        focus: 'rgb(var(--c-focus) / <alpha-value>)', // fokusring / avkryssing
        zone: 'rgb(var(--c-zone) / <alpha-value>)', // gruppe-header
        zoneink: 'rgb(var(--c-zoneink) / <alpha-value>)',
        ok: {
          DEFAULT: 'rgb(var(--c-ok) / <alpha-value>)',
          tint: 'rgb(var(--c-ok-tint) / <alpha-value>)'
        },
        danger: {
          DEFAULT: 'rgb(var(--c-danger) / <alpha-value>)',
          tint: 'rgb(var(--c-danger-tint) / <alpha-value>)',
          hover: 'rgb(var(--c-danger-hover) / <alpha-value>)'
        },
        badge: {
          DEFAULT: 'rgb(var(--c-badge) / <alpha-value>)',
          ink: 'rgb(var(--c-badge-ink) / <alpha-value>)'
        }
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        pop: 'var(--shadow-pop)'
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
