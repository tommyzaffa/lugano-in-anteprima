/**
 * Sonda delle fonti web (eseguita da GitHub Actions, che ha accesso alla rete):
 * stampa nei log la struttura delle pagine candidate per l'import degli eventi
 * (feed, API, dati strutturati schema.org, link alle schede) senza salvare nulla.
 *
 * Uso: npm run data:probe [-- url1 url2 …]
 */
export {};

const DEFAULT = [
  'https://luganoeventi.ch/robots.txt',
  'https://luganoeventi.ch/it/eventi/',
  'https://luganoeventi.ch/it/ricerca-eventi/',
  'https://luganoeventi.ch/wp-json/',
  'https://luganoeventi.ch/it/feed/',
  'https://luganoeventi.ch/sitemap_index.xml',
  'https://www.luganoregion.com/robots.txt',
  'https://www.luganoregion.com/it/eventi',
  'https://www.ticino.ch/robots.txt',
  'https://www.ticino.ch/it/events.html',
];
const UA = 'LuganoInAnteprima/0.1 (+https://github.com/tommyzaffa/lugano-in-anteprima; prototipo, import settimanale)';

const urls = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT;
const uniq = (a: string[]) => [...new Set(a)];
for (const url of urls) {
  console.log(`\n==================== ${url}`);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,application/json,application/xml;q=0.9,*/*;q=0.5' }, redirect: 'follow', signal: AbortSignal.timeout(20000) });
    const body = await res.text();
    console.log(`status ${res.status} · ${res.headers.get('content-type')} · ${body.length} caratteri · finale ${res.url}`);
    if (/robots\.txt$/.test(url) || /xml|json/.test(res.headers.get('content-type') ?? '')) { console.log(body.slice(0, 4000)); continue; }
    const attr = (re: RegExp) => uniq([...body.matchAll(re)].map((m) => m[1]));
    console.log('generator:', attr(/<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)/gi).join(' | '));
    console.log('feed alternate:', attr(/<link[^>]+type=["']application\/(?:rss|atom)\+xml["'][^>]*href=["']([^"']+)/gi).join(' | '));
    console.log('api/json link:', attr(/<link[^>]+rel=["'](?:https:\/\/api\.w\.org\/|alternate)["'][^>]*href=["']([^"']+json[^"']*)/gi).join(' | '));
    console.log('ics/webcal:', attr(/href=["']([^"']*(?:\.ics|webcal:|ical)[^"']*)/gi).slice(0, 10).join(' | '));
    console.log('endpoint negli script:', attr(/["'](\/[a-z0-9_\-/]*(?:api|ajax|json|graphql|events?)[a-z0-9_\-/.?=&]*)["']/gi).slice(0, 25).join(' | '));
    const ld = [...body.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
    const types = ld.flatMap((j) => { try { const o = JSON.parse(j); const arr = Array.isArray(o) ? o : o['@graph'] ?? [o]; return arr.map((x: any) => x['@type']); } catch { return ['(json non valido)']; } });
    console.log(`JSON-LD: ${ld.length} blocchi, tipi ${JSON.stringify(types.slice(0, 20))}`);
    const ev = ld.find((j) => /"@type"\s*:\s*"(Event|MusicEvent|TheaterEvent|Festival|ExhibitionEvent)"/.test(j));
    if (ev) console.log('esempio evento JSON-LD:', ev.slice(0, 1500));
    const links = attr(/href=["']([^"'#]+)["']/gi).filter((h) => /event|evento|manifestaz|agenda|veranstalt/i.test(h));
    console.log(`link a eventi (${links.length}):`, links.slice(0, 40).join('\n  '));
    console.log('data-* interessanti:', attr(/(data-(?:api|url|endpoint|source|events?)[a-z-]*=["'][^"']{3,120}["'])/gi).slice(0, 15).join(' | '));
    const text = body.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    console.log('testo (inizio):', text.slice(0, 1500));
  } catch (e) {
    console.log('errore:', (e as Error).message);
  }
}
