import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite serverer klienten på 5173. `wrangler pages dev` kjører denne som subprosess
// (se package.json -> "dev") og proxyer /api/* til Pages Functions.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
});
