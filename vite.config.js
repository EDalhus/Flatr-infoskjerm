import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

// Service workeren for nettleserskjermer (src/sw.js) får lista over filene spilleren
// trenger: inngangen, spilleren (Viewer) og alt de laster, men ikke admin og forsiden.
// Navnet på hver fil har en hash, så lista (og VERSION) endres når noe endres.
function playerServiceWorker() {
  return {
    name: 'flatr-player-sw',
    apply: 'build',
    generateBundle(_options, bundle) {
      const chunks = Object.values(bundle).filter((c) => c.type === 'chunk');
      const byFile = new Map(chunks.map((c) => [c.fileName, c]));
      const files = new Set(['/display/']);
      const visit = (fileName, withDynamic) => {
        if (files.has(`/${fileName}`)) return;
        files.add(`/${fileName}`);
        const chunk = byFile.get(fileName);
        if (!chunk) return;
        for (const f of chunk.viteMetadata?.importedCss ?? []) files.add(`/${f}`);
        for (const f of chunk.viteMetadata?.importedAssets ?? []) files.add(`/${f}`);
        for (const f of chunk.imports) visit(f, withDynamic);
        if (withDynamic) for (const f of chunk.dynamicImports) visit(f, true);
      };
      const entry = chunks.find((c) => c.isEntry);
      const viewer = chunks.find((c) => c.facadeModuleId?.endsWith('/src/viewer/Viewer.jsx'));
      if (!entry || !viewer) this.error('Fant ikke inngangen eller spilleren (src/viewer/Viewer.jsx)');
      visit(entry.fileName, false);
      visit(viewer.fileName, true);

      const template = readFileSync(new URL('./src/sw.js', import.meta.url), 'utf8');
      const list = [...files].sort();
      const version = createHash('sha256').update(list.join('\n')).update(template).digest('hex').slice(0, 12);
      const source = template
        .replace("'__VERSION__'", JSON.stringify(version))
        .replace("'__ENTRY__'", JSON.stringify(`/${entry.fileName}`))
        .replace('__PRECACHE__', JSON.stringify(list));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    }
  };
}

// Vite serverer klienten på 5173. `wrangler pages dev` kjører denne som subprosess
// (se package.json -> "dev") og proxyer /api/* til Pages Functions.
export default defineConfig({
  plugins: [react(), playerServiceWorker()],
  server: {
    port: 5173,
    strictPort: true
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
});
