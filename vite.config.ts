import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';

/** Copia il worker di MapLibre (modulo ES + chunk condiviso) in public/vendor, usato con setWorkerUrl. */
function maplibreWorker(): Plugin {
  const copy = () => {
    mkdirSync('public/vendor/maplibre', { recursive: true });
    for (const f of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) copyFileSync(`node_modules/maplibre-gl/dist/${f}`, `public/vendor/maplibre/${f}`);
  };
  return { name: 'maplibre-worker', buildStart: copy, configureServer: copy };
}

/** In sviluppo: glifi mancanti -> PBF vuoto valido (come in produzione). */
function glyphFallback(): Plugin {
  return {
    name: 'glyph-fallback',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.startsWith('/glyphs/')) {
          const file = decodeURIComponent('public' + req.url.split('?')[0]);
          if (!existsSync(file)) { res.setHeader('Content-Type', 'application/x-protobuf'); res.end(Buffer.alloc(0)); return; }
        }
        // tile fuori copertura: 404 esplicito (mai la pagina HTML dell'app)
        if (req.url?.startsWith('/tiles/') || req.url?.startsWith('/terrain/')) {
          const file = decodeURIComponent('public' + req.url.split('?')[0]);
          if (!existsSync(file)) { res.statusCode = 404; res.end(); return; }
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), maplibreWorker(), glyphFallback()],
  server: {
    port: 5173,
    host: '127.0.0.1',
    proxy: { '/api': { target: 'http://127.0.0.1:8787', changeOrigin: false } },
  },
  preview: { port: 4173, proxy: { '/api': 'http://127.0.0.1:8787' } },
  optimizeDeps: { exclude: ['maplibre-gl'] },
  build: { target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 2000 },
});
