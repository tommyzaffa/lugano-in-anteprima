/**
 * Configurazione lato server da variabili d'ambiente (vedi .env.example).
 * Nessuna chiave è mai inviata al browser.
 */
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

function loadDotEnv() {
  for (const f of ['.env.local', '.env']) {
    if (!existsSync(f)) continue;
    for (const line of readFileSync(f, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m || process.env[m[1]] != null) continue;
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}
loadDotEnv();

const env = (k: string, d = ''): string => process.env[k] ?? d;
const num = (k: string, d: number) => (process.env[k] ? Number(process.env[k]) : d);

/** Fornitori AI implementati. Altri si aggiungono implementando l'interfaccia AiProvider (src/server/ai/provider.ts). */
export type AiProviderName = 'anthropic' | 'none';

export const config = {
  port: num('API_PORT', num('PORT', 8787)),
  host: env('HOST', '127.0.0.1')!,
  publicBaseUrl: env('PUBLIC_BASE_URL', env('RENDER_EXTERNAL_URL', '')),
  /** Il prototipo resta fuori dai motori di ricerca finché non è un servizio autorizzato (ALLOW_INDEXING=true per cambiarlo). */
  allowIndexing: env('ALLOW_INDEXING') === 'true',
  /** Disco non persistente (es. piano gratuito di Render): salvataggi e link condivisi possono sparire a ogni riavvio. */
  ephemeralStorage: env('EPHEMERAL_STORAGE') === 'true',
  /** Salvataggio sul server, link condivisi e voto degli amici: disattivati salvo SAVE_AND_SHARE=true. */
  sharing: env('SAVE_AND_SHARE') === 'true',
  dataDir: env('DATA_DIR', 'data')!,
  dbPath: env('DB_PATH', 'data/db/lugano.sqlite')!,
  adminToken: env('ADMIN_TOKEN'),
  generatedAdminToken: '',
  ai: {
    provider: (env('AI_PROVIDER', 'none') as AiProviderName),
    anthropicKey: env('ANTHROPIC_API_KEY', ''),
    anthropicModel: env('ANTHROPIC_MODEL', 'claude-opus-5'),
    maxTokens: num('AI_MAX_OUTPUT_TOKENS', 8000),
    timeoutMs: num('AI_TIMEOUT_MS', 25000),
    maxRetries: num('AI_MAX_RETRIES', 1),
    dailyTokenBudget: num('AI_DAILY_TOKEN_BUDGET', 400000),
  },
  weather: {
    // previsioni reali di default (gratuite, senza chiave); senza rete lo stato è «non disponibile», mai inventato
    provider: env('WEATHER_PROVIDER', 'open-meteo') as 'open-meteo' | 'demo' | 'none',
    openMeteoUrl: env('OPEN_METEO_URL', 'https://api.open-meteo.com/v1/forecast'),
  },
  transitLive: {
    provider: env('TRANSIT_LIVE_PROVIDER', 'none') as 'ojp' | 'none',
    ojpUrl: env('OJP_URL', 'https://api.opentransportdata.swiss/ojp20'),
    ojpToken: env('OJP_API_KEY', ''),
    requestorRef: env('OJP_REQUESTOR_REF', 'LuganoInAnteprima_dev'),
  },
  planner: {
    minChangeSec: num('PLANNER_MIN_CHANGE_SEC', 120),
    boardMarginSec: num('PLANNER_BOARD_MARGIN_SEC', 120),
    returnMarginMin: num('PLANNER_RETURN_MARGIN_MIN', 0),
    maxAlternatives: 3,
    timeoutMs: num('PLANNER_TIMEOUT_MS', 20000),
  },
  rateLimit: {
    planPerMinute: num('RATE_LIMIT_PLAN_PER_MIN', 12),
    generalPerMinute: num('RATE_LIMIT_GENERAL_PER_MIN', 600),
  },
  demoMode: true, // calcolato all'avvio: vero se mancano integrazioni live
};

export function ensureAdminToken(): string {
  if (config.adminToken) return config.adminToken;
  if (!config.generatedAdminToken) config.generatedAdminToken = randomBytes(18).toString('base64url');
  return config.generatedAdminToken;
}

export function aiConfigured(): boolean {
  // Con AI_PROVIDER=anthropic l'SDK risolve le credenziali: ANTHROPIC_API_KEY oppure un profilo `ant auth login`.
  return config.ai.provider === 'anthropic';
}
