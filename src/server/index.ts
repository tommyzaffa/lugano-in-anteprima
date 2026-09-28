/**
 * Avvio del server: carica i dati, apre il database, espone l'API e, in
 * produzione, serve l'applicazione compilata e i dati cartografici locali.
 */
process.env.TZ ??= 'Europe/Zurich';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { compress } from 'hono/compress';
import { existsSync, readFileSync } from 'node:fs';
import { config, ensureAdminToken, aiConfigured } from './config.ts';
import { openDb } from './db.ts';
import { DataStore } from './data.ts';
import { createApi } from './api.ts';
import { setCatalogNames } from './ai/index.ts';

const t0 = Date.now();
const db = openDb(config.dbPath);
const data = new DataStore(config.dataDir);
data.load(db);
setCatalogNames([...data.places.values()].map((p) => ({ id: p.id, name: p.name })));
config.demoMode = !aiConfigured() || config.weather.provider !== 'open-meteo' || config.transitLive.provider === 'none';

const app = new Hono();
app.use('/api/*', compress());
app.route('/', createApi(data, db));

// glifi mancanti: risposta vuota valida invece di un 404 (evita errori di rendering delle etichette)
app.get('/glyphs/:stack/:range', async (c, next) => {
  const file = `public/glyphs/${decodeURIComponent(c.req.param('stack'))}/${c.req.param('range')}`;
  if (existsSync(file)) return next();
  return new Response(new Uint8Array(0), { headers: { 'Content-Type': 'application/x-protobuf', 'Cache-Control': 'public, max-age=86400' } });
});
const staticHeaders = (path: string, c: any) => {
  if (path.endsWith('.pbf')) c.header('Content-Type', 'application/x-protobuf');
  if (/\/(tiles|terrain|glyphs)\//.test(path)) c.header('Cache-Control', 'public, max-age=604800');
};
app.use('/tiles/*', serveStatic({ root: './public', onFound: staticHeaders }));
app.use('/terrain/*', serveStatic({ root: './public', onFound: staticHeaders }));
app.use('/glyphs/*', serveStatic({ root: './public', onFound: staticHeaders }));
// tile fuori copertura: 404 esplicito, mai la pagina dell'app
app.get('/tiles/*', (c) => c.body(null, 404));
app.get('/terrain/*', (c) => c.body(null, 404));
app.get('/vendor/*', serveStatic({ root: './public' }));

if (existsSync('dist/index.html')) {
  app.use('/assets/*', serveStatic({ root: './dist', onFound: (_p, c) => c.header('Cache-Control', 'public, max-age=31536000, immutable') }));
  app.use('/*', serveStatic({ root: './dist' }));
  const index = readFileSync('dist/index.html', 'utf8');
  // SPA: /s/:token, /admin, /p/:id ecc.
  app.get('*', (c) => (c.req.path.startsWith('/api/') ? c.json({ error: 'not_found' }, 404) : c.html(index)));
}

serve({ fetch: app.fetch, port: config.port, hostname: config.host }, (info) => {
  console.log(`Lugano in anteprima — server su http://${info.address}:${info.port} (avvio ${Date.now() - t0} ms, dati ${data.loadMs} ms)`);
  console.log(`Catalogo ${data.catalogVersion}, orario GTFS ${data.transit.feedVersion}, AI: ${aiConfigured() ? config.ai.anthropicModel : 'deterministico'}, meteo: ${config.weather.provider}`);
  if (!config.adminToken) console.log(`Pannello editoriale: token temporaneo per questa sessione → ${ensureAdminToken()} (impostare ADMIN_TOKEN per un token stabile)`);
});
