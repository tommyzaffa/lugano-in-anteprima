/**
 * API HTTP (Hono). Tutte le chiavi restano lato server. Gli input sono validati
 * con schemi runtime; le chiamate costose hanno limiti di frequenza e timeout.
 */
import { Hono, type Context } from 'hono';
import { stream } from 'hono/streaming';
import { z } from 'zod';
import { DateTime } from 'luxon';
import { GroupRequest, Decision, TZ, MAX_PEOPLE, Place, type Plan } from '../shared/types.ts';
import { openIntervals, describeDay, checkVisit } from '../shared/calendar.ts';
import { planToIcs, redactPlan, DEFAULT_REDACTION, type Redaction } from '../shared/export.ts';
import { parseOsmOpeningHours } from '../shared/osm-hours.ts';
import { baseHash, type DataStore } from './data.ts';
import type { Db } from './db.ts';
import { config, ensureAdminToken, aiConfigured } from './config.ts';
import { planAlternatives } from './planner/index.ts';
import { replan } from './planner/replan.ts';
import { planB } from './planner/planb.ts';
import { revalidate } from './planner/revalidate.ts';
import { weatherFor } from './adapters/weather.ts';
import { ojpTrip } from './adapters/ojp.ts';
import { integrations } from './integrations.ts';
import { aiHooks, aiStatus } from './ai/index.ts';

const STAT_KEYS = new Set(['sim_started', 'sim_finished', 'sim_skip', 'sim_decision', 'sim_checkpoint', 'branch_created', 'whatif', 'export_ics', 'print', 'explore_opened', 'list_view', 'postcard', 'offline_saved', 'reduced_motion', 'webgl_fallback', 'geolocation_used', 'surprise']);

// ------------------------------------------------------------------ limiti di frequenza
const buckets = new Map<string, number[]>();
function limited(c: Context, key: string, perMinute: number): boolean {
  const ip = c.req.header('x-forwarded-for')?.split(',')[0].trim() || (c.env as any)?.incoming?.socket?.remoteAddress || 'local';
  const k = `${key}:${ip}`;
  const now = Date.now();
  const arr = (buckets.get(k) ?? []).filter((t) => now - t < 60_000);
  if (arr.length >= perMinute) { buckets.set(k, arr); return true; }
  arr.push(now);
  buckets.set(k, arr);
  if (buckets.size > 10000) buckets.clear();
  return false;
}

/** Data nel formato AAAA-MM-GG ed esistente nel calendario (2026-13-45 non lo è). */
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && DateTime.fromISO(s, { zone: TZ }).isValid;
const badDate = (c: Context) => c.json({ error: 'invalid_date', message: 'Data non valida: usare il formato AAAA-MM-GG.' }, 400);

export function createApi(data: DataStore, db: Db) {
  const app = new Hono();

  // limiti solo sull'API: tile, glifi e file statici non sono conteggiati
  app.use('/api/*', async (c, next) => {
    if (limited(c, 'general', config.rateLimit.generalPerMinute)) return c.json({ error: 'rate_limited', message: 'Troppe richieste: riprovate fra un minuto.' }, 429);
    await next();
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('Referrer-Policy', 'no-referrer');
  });

  app.onError((err, c) => {
    console.error('[api]', err);
    return c.json({ error: 'internal', message: 'Errore interno del server.' }, 500);
  });

  // ---------------------------------------------------------------- stato e metadati
  app.get('/api/health', (c) => c.json({
    ok: true, demoMode: config.demoMode, catalogVersion: data.catalogVersion, loadedAt: data.loadedAt, loadMs: data.loadMs,
    transitFeed: data.transit.feedVersion, ai: aiStatus(), weather: config.weather.provider,
  }));

  app.get('/api/meta', (c) => c.json({
    perimeter: { core: data.perimeter.core, perimeter: data.perimeter.perimeter, buffer: data.perimeter.buffer, references: data.perimeter.references, sizeKm: data.perimeter.sizeKm, polygon: data.perimeter.polygon },
    catalogVersion: data.catalogVersion,
    transit: { feedVersion: data.transit.feedVersion, range: data.transit.feedRange, source: data.transit.d.source.name },
    sources: data.sources,
    integrations: integrations(),
    maxPeople: MAX_PEOPLE,
    demoMode: config.demoMode,
    ai: aiStatus(),
    weather: config.weather.provider,
    today: DateTime.now().setZone(TZ).toFormat('yyyy-MM-dd'),
    quickStarts: quickStarts(data),
  }));

  // ---------------------------------------------------------------- catalogo ed esplorazione
  app.get('/api/places', (c) => {
    const qd = c.req.query('date');
    if (qd && !isDate(qd)) return badDate(c);
    const date = qd || DateTime.now().setZone(TZ).toFormat('yyyy-MM-dd');
    const from = c.req.query('from'), to = c.req.query('to');
    if ((from && !DateTime.fromISO(from, { zone: TZ }).isValid) || (to && !DateTime.fromISO(to, { zone: TZ }).isValid)) return badDate(c);
    const f = from ? DateTime.fromISO(from, { zone: TZ }) : null;
    const t = to ? DateTime.fromISO(to, { zone: TZ }) : null;
    const places = [...data.places.values()].map((p) => {
      const pub = p.schedules.find((s) => s.kind === 'public');
      let openDuring: 'open' | 'closed' | 'unknown' = 'unknown';
      if (pub && f && t) {
        const ivs = openIntervals(pub, f, t);
        openDuring = ivs.some((iv) => Math.min(iv.end.toMillis(), t.toMillis()) - Math.max(iv.start.toMillis(), f.toMillis()) >= p.visit.min * 60_000) ? 'open' : 'closed';
      }
      return {
        id: p.id, name: p.name, category: p.category, lon: p.lon, lat: p.lat, entrance: p.entrance, area: p.area, municipality: p.municipality,
        moods: p.moods, tags: p.tags, description: p.description, visit: p.visit, hoursToday: pub ? describeDay(pub, date) : null,
        hoursStatus: pub ? pub.evidence.status : 'unknown', openDuring, plannable: p.plannable, mountain: p.mountain ?? null,
        accessibility: { wheelchair: p.accessibility.wheelchair, stroller: p.accessibility.stroller, stairs: p.accessibility.stairs },
        priceHint: priceHint(p), indoor: p.suitability.indoor, demo: p.demo,
      };
    });
    return c.json({ catalogVersion: data.catalogVersion, date, places });
  });

  app.get('/api/places/:id', (c) => {
    const p = data.place(c.req.param('id'));
    if (!p) return c.json({ error: 'not_found', message: 'Luogo non trovato' }, 404);
    const q = c.req.query('date');
    if (q && !isDate(q)) return badDate(c);
    const date = q || DateTime.now().setZone(TZ).toFormat('yyyy-MM-dd');
    const week = Array.from({ length: 7 }, (_, i) => {
      const d = DateTime.fromISO(date, { zone: TZ }).plus({ days: i }).toFormat('yyyy-MM-dd');
      return { date: d, schedules: p.schedules.map((s) => ({ kind: s.kind, text: describeDay(s, d) })) };
    });
    const from = DateTime.fromISO(date, { zone: TZ }).startOf('day');
    const events = data.occurrences(from, from.plus({ days: 14 })).filter((o) => o.placeId === p.id);
    const sources = [...new Set([...p.sources, ...p.evidence.map((e) => e.sourceId), ...p.schedules.map((s) => s.evidence.sourceId), ...p.prices.map((x) => x.evidence.sourceId)])].map((id) => data.source(id)).filter(Boolean);
    return c.json({ place: p, week, events, sources });
  });

  app.get('/api/explore', (c) => {
    const cls = c.req.query('cls')?.split(',').filter(Boolean);
    const pois = cls?.length ? data.explore.filter((p) => cls.includes(p.cls)) : data.explore;
    return c.json({ source: 'OpenStreetMap (non curato, da verificare)', pois, amenities: data.amenities });
  });

  app.get('/api/events', (c) => {
    const qf = c.req.query('from');
    if (qf && !isDate(qf)) return badDate(c);
    const from = DateTime.fromISO(qf ?? DateTime.now().setZone(TZ).toFormat('yyyy-MM-dd'), { zone: TZ }).startOf('day');
    const qdays = Number(c.req.query('days') ?? 7);
    const days = Number.isFinite(qdays) ? Math.max(0, Math.min(31, Math.floor(qdays))) : 7;
    const occ = data.occurrences(from, from.plus({ days }).endOf('day')).map((o) => {
      const pl = data.place(o.placeId);
      return { ...o, placeName: pl?.name, lon: pl?.entrance.lon ?? pl?.lon, lat: pl?.entrance.lat ?? pl?.lat, category: data.events.get(o.eventId)?.category, description: data.events.get(o.eventId)?.description };
    });
    return c.json({ from: from.toFormat('yyyy-MM-dd'), days, demo: true, notice: 'Calendario dimostrativo: fixture di esempio, non è l\'agenda reale di Lugano.', occurrences: occ });
  });

  app.get('/api/stops', (c) => {
    const byName = new Map<string, any>();
    data.transit.d.stops.forEach((s, i) => {
      const k = s.name;
      const prev = byName.get(k);
      if (!prev) byName.set(k, { id: s.id, idx: i, name: s.name, lon: s.lon, lat: s.lat, modes: [...s.modes] });
      else prev.modes = [...new Set([...prev.modes, ...s.modes])];
    });
    return c.json({ feed: data.transit.feedVersion, stops: [...byName.values()] });
  });

  app.get('/api/search', (c) => {
    const q = (c.req.query('q') ?? '').trim().toLowerCase();
    if (q.length < 2) return c.json({ results: [] });
    const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const nq = norm(q);
    const results: any[] = [];
    for (const p of data.places.values()) if (norm(p.name).includes(nq) || norm(p.area ?? '').includes(nq)) results.push({ kind: 'place', id: p.id, label: p.name, sub: p.area ?? p.municipality.name, lon: p.entrance.lon, lat: p.entrance.lat });
    const seen = new Set<string>();
    for (const s of data.transit.d.stops) if (norm(s.name).includes(nq) && !seen.has(s.name)) { seen.add(s.name); results.push({ kind: 'stop', id: s.id, label: s.name, sub: `Fermata · ${[...s.modes].join(', ')}`, lon: s.lon, lat: s.lat }); }
    let n = 0;
    for (const [label, lon, lat] of data.addresses) { if (n > 12) break; if (norm(label).includes(nq)) { results.push({ kind: 'address', id: `${lon},${lat}`, label, sub: 'Indirizzo (OSM)', lon, lat }); n++; } }
    for (const p of data.explore) if (results.length < 60 && norm(p.name).includes(nq)) results.push({ kind: 'poi', id: p.osm, label: p.name, sub: `OSM · ${p.cls}`, lon: p.lon, lat: p.lat });
    return c.json({ results: results.slice(0, 40) });
  });

  app.get('/api/weather', async (c) => {
    const date = c.req.query('date') ?? DateTime.now().setZone(TZ).toFormat('yyyy-MM-dd');
    return c.json(await weatherFor({ date }, (s, d) => db.setSourceHealth('weather', s, d)));
  });

  // ---------------------------------------------------------------- pianificazione (NDJSON in streaming)
  app.post('/api/plan', async (c) => {
    if (limited(c, 'plan', config.rateLimit.planPerMinute)) return c.json({ error: 'rate_limited', message: 'Troppe pianificazioni in poco tempo: attendete un minuto.' }, 429);
    const body = await c.req.json().catch(() => null);
    if (body && Array.isArray(body.people) && body.people.length > MAX_PEOPLE) {
      return c.json({ error: 'too_many_people', message: `Questa prima versione gestisce gruppi fino a ${MAX_PEOPLE} persone (un personaggio per persona). Per ${body.people.length} persone potete dividere il gruppo in due programmi.` }, 422);
    }
    const parsed = GroupRequest.safeParse(body);
    if (!parsed.success) return c.json({ error: 'invalid_request', message: 'Richiesta non valida', issues: parsed.error.issues.slice(0, 10) }, 400);
    db.count('plan_requested');
    return stream(c, async (s) => {
      const ctrl = new AbortController();
      s.onAbort(() => ctrl.abort());
      const timer = setTimeout(() => ctrl.abort(), config.planner.timeoutMs + 10_000);
      const write = (o: unknown) => s.write(JSON.stringify(o) + '\n');
      try {
        const res = await planAlternatives(parsed.data, {
          data, signal: ctrl.signal,
          weather: (r) => weatherFor(r, (st, d) => db.setSourceHealth('weather', st, d)),
          ai: aiHooks(db),
          progress: (step) => { void write({ type: 'progress', step, at: Date.now() }); },
        });
        db.count(`plan_${res.status}`);
        if (res.status === 'infeasible') for (const r of res.infeasible.reasons) db.count(`infeasible_${r.code}`);
        await write({ type: 'result', ...res, demoMode: config.demoMode });
      } catch (e) {
        const aborted = (e as Error).message === 'ABORTED';
        db.count(aborted ? 'plan_aborted' : 'plan_error');
        if (!aborted) console.error('[plan]', e);
        await write({ type: 'error', message: aborted ? 'Ricerca annullata o troppo lunga.' : 'Errore durante la pianificazione.' });
      } finally {
        clearTimeout(timer);
      }
    });
  });

  app.post('/api/replan', async (c) => {
    if (limited(c, 'plan', config.rateLimit.planPerMinute * 3)) return c.json({ error: 'rate_limited', message: 'Troppe richieste.' }, 429);
    const body = await c.req.json().catch(() => null);
    const dec = Decision.safeParse(body?.decision);
    if (!dec.success || !body?.plan) return c.json({ error: 'invalid_request', message: 'Decisione non valida' }, 400);
    const plan = body.plan as Plan;
    const req = GroupRequest.safeParse(plan.request);
    if (!req.success) return c.json({ error: 'invalid_plan', message: 'Piano non valido' }, 400);
    const t0 = Date.now();
    const r = replan({ ...plan, request: req.data }, dec.data, data);
    // richiesta di ricalcolo; il ramo creato (se l'utente lo applica) è contato dal client
    db.count(dec.data.kind.startsWith('whatif') ? 'whatif_requested' : 'replan_requested');
    return c.json({ ...r, ms: Date.now() - t0 });
  });

  app.post('/api/transit/live-check', async (c) => {
    const b = await c.req.json().catch(() => null);
    if (!b?.from || !b?.to || !b?.departure) return c.json({ error: 'invalid_request' }, 400);
    const r = await ojpTrip(b.from, b.to, b.departure);
    db.setSourceHealth('ojp', r.status, r.message ?? '');
    return c.json(r);
  });

  app.post('/api/planb', async (c) => {
    const body = await c.req.json().catch(() => null);
    const req = GroupRequest.safeParse(body?.plan?.request);
    if (!req.success || !Array.isArray(body?.plan?.stops)) return c.json({ error: 'invalid_request', message: 'Piano non valido' }, 400);
    db.count('planb');
    return c.json(planB({ ...(body.plan as Plan), request: req.data }, data));
  });

  app.post('/api/revalidate', async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body?.plan) return c.json({ error: 'invalid_request' }, 400);
    return c.json(revalidate(body.plan as Plan, data));
  });

  // ---------------------------------------------------------------- salvataggio
  const SaveBody = z.object({ title: z.string().max(140), data: z.record(z.string(), z.unknown()) });
  app.post('/api/plans', async (c) => {
    const b = SaveBody.safeParse(await c.req.json().catch(() => null));
    if (!b.success) return c.json({ error: 'invalid_request' }, 400);
    const size = JSON.stringify(b.data.data).length;
    if (size > 6_000_000) return c.json({ error: 'too_large', message: 'Programma troppo grande per il salvataggio.' }, 413);
    const r = db.savePlan(b.data.data, b.data.title);
    db.count('plan_saved');
    return c.json(r);
  });
  app.put('/api/plans/:id', async (c) => {
    const b = SaveBody.safeParse(await c.req.json().catch(() => null));
    const token = c.req.header('x-edit-token') ?? '';
    if (!b.success) return c.json({ error: 'invalid_request' }, 400);
    const r = db.savePlan(b.data.data, b.data.title, { id: c.req.param('id'), editToken: token });
    if (!r) return c.json({ error: 'forbidden', message: 'Token di modifica non valido' }, 403);
    return c.json(r);
  });
  app.get('/api/plans/:id', (c) => {
    const p = db.getPlan(c.req.param('id'));
    if (!p) return c.json({ error: 'not_found', message: 'Programma non trovato o eliminato' }, 404);
    const token = c.req.header('x-edit-token') ?? '';
    if (!db.checkEdit(p.id, token)) return c.json({ error: 'forbidden', message: 'Serve il link personale di modifica. Per condividere usate un link di condivisione.' }, 403);
    return c.json(p);
  });
  app.delete('/api/plans/:id', (c) => {
    const ok = db.deletePlan(c.req.param('id'), c.req.header('x-edit-token') ?? '');
    return ok ? c.json({ ok: true }) : c.json({ error: 'forbidden' }, 403);
  });
  app.get('/api/plans/:id/shares', (c) => {
    if (!db.checkEdit(c.req.param('id'), c.req.header('x-edit-token') ?? '')) return c.json({ error: 'forbidden' }, 403);
    return c.json({ shares: db.listShares(c.req.param('id')).map((s) => ({ ...s, tally: s.allowVotes ? db.tally(s.token) : null, comments: s.allowVotes ? db.voteComments(s.token).length : 0 })) });
  });

  // ---------------------------------------------------------------- condivisione revocabile e voto
  const ShareBody = z.object({ redaction: z.object({ hideLocations: z.boolean(), hideNames: z.boolean(), hideNeeds: z.boolean(), hideBudget: z.boolean() }).default(DEFAULT_REDACTION), allowVotes: z.boolean().default(false) });
  app.post('/api/plans/:id/share', async (c) => {
    const id = c.req.param('id');
    if (!db.checkEdit(id, c.req.header('x-edit-token') ?? '')) return c.json({ error: 'forbidden' }, 403);
    const b = ShareBody.safeParse(await c.req.json().catch(() => ({})));
    if (!b.success) return c.json({ error: 'invalid_request' }, 400);
    const saved = db.getPlan(id)!;
    const d: any = saved.data;
    const red = b.data.redaction as Redaction;
    const shared = {
      title: saved.title,
      alternatives: (d.alternatives ?? []).map((p: Plan) => redactPlan(p, red)),
      current: d.current ? redactPlan(d.current, red) : null,
      branches: (d.branches ?? []).map((br: any) => ({ ...br, plan: redactPlan(br.plan, red) })),
      savedAt: saved.updatedAt,
    };
    const token = db.createShare(id, red, shared, b.data.allowVotes);
    db.count('plan_shared');
    return c.json({ token, path: `/s/${token}` });
  });
  app.get('/api/share/:token', (c) => {
    const s = db.getShare(c.req.param('token'));
    if (!s || s.revokedAt) return c.json({ error: 'revoked', message: 'Questo link è stato revocato o non esiste.' }, 410);
    const voter = c.req.query('voter');
    return c.json({ ...s.data, allowVotes: s.allowVotes, tally: s.allowVotes ? db.tally(s.token) : null, comments: s.allowVotes ? db.voteComments(s.token) : [], myVote: s.allowVotes && voter ? db.myVote(s.token, voter) : null, redaction: s.redaction });
  });
  app.delete('/api/share/:token', (c) => {
    const s = db.getShare(c.req.param('token'));
    if (!s || !db.checkEdit(s.planId, c.req.header('x-edit-token') ?? '')) return c.json({ error: 'forbidden' }, 403);
    db.revokeShare(s.token);
    db.count('share_revoked');
    return c.json({ ok: true });
  });
  app.post('/api/share/:token/vote', async (c) => {
    const s = db.getShare(c.req.param('token'));
    if (!s || s.revokedAt || !s.allowVotes) return c.json({ error: 'forbidden', message: 'Voto non disponibile' }, 403);
    // nome e commento sono facoltativi, brevi e trattati come testo (mai come istruzioni né HTML)
    const clean = (x: unknown, max: number) => (typeof x === 'string' ? x.replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');
    const b = z.object({ voter: z.string().min(6).max(64), optionId: z.string().max(80), name: z.string().max(200).optional(), comment: z.string().max(1000).optional() }).safeParse(await c.req.json().catch(() => null));
    if (!b.success) return c.json({ error: 'invalid_request' }, 400);
    const valid = new Set((s.data.alternatives ?? []).map((p: Plan) => p.id));
    if (!valid.has(b.data.optionId)) return c.json({ error: 'invalid_option' }, 400);
    if (limited(c, 'vote', 30)) return c.json({ error: 'rate_limited', message: 'Troppi voti in poco tempo.' }, 429);
    db.vote(s.token, b.data.voter, b.data.optionId, clean(b.data.name, 30) || null, clean(b.data.comment, 140) || null);
    db.count('vote');
    return c.json({ tally: db.tally(s.token), comments: db.voteComments(s.token), myVote: db.myVote(s.token, b.data.voter) });
  });

  // ---------------------------------------------------------------- esportazioni
  app.post('/api/export/ics', async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body?.plan) return c.json({ error: 'invalid_request' }, 400);
    db.count('export_ics');
    const ics = planToIcs(body.plan as Plan, { includeRides: !!body.includeRides });
    return new Response(ics, { headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'attachment; filename="lugano-in-anteprima.ics"' } });
  });

  // ---------------------------------------------------------------- segnalazioni e statistiche
  app.post('/api/reports', async (c) => {
    if (limited(c, 'report', 10)) return c.json({ error: 'rate_limited' }, 429);
    const b = z.object({ targetKind: z.enum(['place', 'event', 'stop', 'route', 'other']), targetId: z.string().max(120), field: z.enum(['hours', 'price', 'location', 'accessibility', 'event', 'description', 'transport', 'other']), message: z.string().min(5).max(1500) }).safeParse(await c.req.json().catch(() => null));
    if (!b.success) return c.json({ error: 'invalid_request', message: 'Segnalazione non valida' }, 400);
    const id = db.addReport(b.data);
    db.count('report_submitted');
    return c.json({ id, message: 'Grazie: la segnalazione arriva alla redazione. Non modifica i dati finché non viene verificata.' });
  });
  app.post('/api/stats', async (c) => {
    const b = await c.req.json().catch(() => null);
    const key = typeof b?.key === 'string' ? b.key : '';
    if (!STAT_KEYS.has(key)) return c.json({ error: 'invalid_key' }, 400);
    db.count(key);
    return c.json({ ok: true });
  });

  // ---------------------------------------------------------------- pannello editoriale (protetto)
  const admin = new Hono();
  admin.use('*', async (c, next) => {
    const auth = c.req.header('authorization') ?? '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!token || token !== ensureAdminToken()) return c.json({ error: 'unauthorized', message: 'Token editoriale mancante o errato.' }, 401);
    await next();
  });
  admin.get('/overview', (c) => {
    const places = [...data.places.values()];
    const statusCount = (f: (p: Place) => string) => places.reduce((a: Record<string, number>, p) => { const k = f(p); a[k] = (a[k] ?? 0) + 1; return a; }, {});
    return c.json({
      catalogVersion: data.catalogVersion, baseVersion: data.baseVersion, places: places.length, events: data.events.size, hidden: [...data.hidden],
      hoursStatus: statusCount((p) => p.schedules[0]?.evidence.status ?? 'unknown'),
      priceStatus: statusCount((p) => (p.prices.some((x) => x.status === 'unknown') ? 'unknown' : p.prices.every((x) => x.status === 'known') ? 'known' : 'estimate')),
      accessStatus: statusCount((p) => p.accessibility.evidence.status),
      stale: places.flatMap((p) => p.evidence.filter((e) => data.isStale(e, 'general')).map((e) => ({ id: p.id, field: e.field }))),
      sources: data.sources, sourceHealth: db.sourceHealth(), integrations: integrations(),
      reportsOpen: db.listReports('open').length,
      conflicts: data.conflicts,
    });
  });
  admin.get('/places', (c) => c.json({ places: [...data.places.values()], overrides: db.listOverrides() }));
  admin.put('/places/:id', async (c) => {
    const id = c.req.param('id');
    const base = data.place(id);
    const b = await c.req.json().catch(() => null);
    if (!base || !b) return c.json({ error: 'not_found' }, 404);
    const patch: any = {};
    if (typeof b.description === 'string') patch.description = b.description.slice(0, 1200);
    if (b.hoursOsm != null) {
      if (b.hoursOsm === '') patch.schedules = [];
      else {
        const r = parseOsmOpeningHours(String(b.hoursOsm), { id: `${id}-public`, kind: 'public', evidence: { field: 'hours', sourceId: 'editorial-2026-09', status: b.verified ? 'verified' : 'editorial', observedAt: DateTime.now().toISODate()!, lastCheckedAt: DateTime.now().toISODate()!, url: b.sourceUrl, note: b.note } });
        if (!r.ok) return c.json({ error: 'invalid_hours', message: `Orario non valido: ${r.reason}` }, 400);
        patch.schedules = [r.schedule];
      }
    }
    if (Array.isArray(b.prices)) patch.prices = b.prices;
    if (b.accessibility) patch.accessibility = { ...base.accessibility, ...b.accessibility, evidence: { field: 'accessibility', sourceId: 'editorial-2026-09', status: b.verified ? 'verified' : 'editorial', lastCheckedAt: DateTime.now().toISODate()!, note: b.note } };
    if (b.booking) patch.booking = b.booking;
    if (typeof b.hidden === 'boolean') patch.hidden = b.hidden;
    if (b.plannable) patch.plannable = b.plannable;
    const test = Place.safeParse({ ...base, ...patch });
    if (!patch.hidden && !test.success) return c.json({ error: 'invalid', issues: test.error.issues.slice(0, 5) }, 400);
    const prev = db.listOverrides().find((o) => o.kind === 'place' && o.id === id)?.data ?? {};
    db.setOverride('place', id, { ...prev, ...patch, _baseHash: baseHash(data.basePlace(id)) }, b.note ?? 'modifica editoriale');
    data.applyOverrides(db);
    return c.json({ ok: true, catalogVersion: data.catalogVersion, place: data.place(id) ?? null });
  });
  admin.post('/places/:id/verify', async (c) => {
    const id = c.req.param('id');
    const p = data.place(id);
    const b = await c.req.json().catch(() => ({}));
    if (!p) return c.json({ error: 'not_found' }, 404);
    const today = DateTime.now().toISODate()!;
    const field = String(b.field ?? 'hours');
    const patch: any = {};
    if (field === 'hours') patch.schedules = p.schedules.map((s) => ({ ...s, evidence: { ...s.evidence, status: 'verified', lastCheckedAt: today, url: b.sourceUrl ?? s.evidence.url, note: b.note ?? s.evidence.note } }));
    if (field === 'price') patch.prices = p.prices.map((x) => ({ ...x, status: x.status === 'unknown' ? 'unknown' : 'known', evidence: { ...x.evidence, status: 'verified', lastCheckedAt: today, url: b.sourceUrl } }));
    if (field === 'accessibility') patch.accessibility = { ...p.accessibility, evidence: { ...p.accessibility.evidence, status: 'verified', lastCheckedAt: today, url: b.sourceUrl } };
    const prev = db.listOverrides().find((o) => o.kind === 'place' && o.id === id)?.data ?? {};
    db.setOverride('place', id, { ...prev, ...patch, _baseHash: baseHash(data.basePlace(id)) }, `verifica ${field}`);
    data.applyOverrides(db);
    return c.json({ ok: true, place: data.place(id) });
  });
  admin.delete('/places/:id/override', (c) => { db.deleteOverride('place', c.req.param('id')); data.applyOverrides(db); return c.json({ ok: true, catalogVersion: data.catalogVersion }); });
  admin.get('/events', (c) => c.json({ events: [...data.events.values()] }));
  admin.post('/events/:id/exception', async (c) => {
    const id = c.req.param('id');
    const ev = data.events.get(id);
    const b = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), status: z.enum(['scheduled', 'cancelled', 'postponed', 'sold_out']), note: z.string().max(300).optional() }).safeParse(await c.req.json().catch(() => null));
    if (!ev?.recurrence || !b.success) return c.json({ error: 'invalid_request' }, 400);
    const exceptions = [...ev.recurrence.exceptions.filter((e) => e.date !== b.data.date), ...(b.data.status === 'scheduled' ? [] : [{ date: b.data.date, status: b.data.status, note: b.data.note }])];
    const prev = db.listOverrides().find((o) => o.kind === 'event' && o.id === id)?.data ?? {};
    db.setOverride('event', id, { ...prev, recurrence: { ...ev.recurrence, exceptions } }, `eccezione ${b.data.date} ${b.data.status}`);
    data.applyOverrides(db);
    return c.json({ ok: true, event: data.events.get(id) });
  });
  admin.get('/reports', (c) => c.json({ reports: db.listReports() }));
  admin.post('/reports/:id', async (c) => {
    const b = await c.req.json().catch(() => ({}));
    const ok = db.resolveReport(c.req.param('id'), String(b.status ?? 'resolved'), String(b.resolution ?? ''));
    return c.json({ ok });
  });
  admin.get('/stats', (c) => c.json({ stats: db.stats(Number(c.req.query('days') ?? 30)), ai: db.aiUsage(30), aiTokensToday: db.aiTokensToday(), note: 'Statistiche aggregate: nessun contenuto personale è conservato.' }));
  admin.get('/audit', (c) => c.json({ audit: db.audit(200) }));
  admin.post('/sources/check', async (c) => {
    const out: Record<string, string> = {};
    const w = await weatherFor({ date: DateTime.now().setZone(TZ).toFormat('yyyy-MM-dd') }, (s, d) => db.setSourceHealth('weather', s, d));
    out.weather = w?.status ?? 'disattivato';
    db.setSourceHealth('gtfs-ch', data.transit.covers(DateTime.now().setZone(TZ).toFormat('yyyy-MM-dd')) ? 'ok' : 'expired', `feed ${data.transit.feedVersion} valido ${data.transit.feedRange.start}–${data.transit.feedRange.end}`);
    db.setSourceHealth('catalog', 'ok', `${data.catalogVersion}, ${data.places.size} luoghi`);
    db.setSourceHealth('ai', aiConfigured() ? 'configured' : 'not_configured', aiStatus().label);
    return c.json({ ok: true, out, health: db.sourceHealth() });
  });
  app.route('/api/admin', admin);

  return app;
}

/** Punti di partenza rapidi risolti dai dati (fermate GTFS e luoghi del catalogo), mai scritti a mano. */
function quickStarts(data: DataStore) {
  const out: { kind: 'stop' | 'place'; label: string; lon: number; lat: number; stopId?: string; placeId?: string }[] = [];
  const station = data.transit.d.stops.find((s) => s.name === 'Lugano' && s.modes.includes('train'));
  if (station) out.push({ kind: 'stop', label: 'Stazione FFS di Lugano', lon: station.lon, lat: station.lat, stopId: station.id });
  const pr = data.place('piazza-riforma');
  if (pr) out.push({ kind: 'place', label: pr.name, lon: pr.entrance.lon, lat: pr.entrance.lat, placeId: pr.id });
  for (const name of ['Lugano Centrale (lago)', 'Paradiso (lago)', 'Cassarate, Lanchetta']) {
    const s = data.transit.d.stops.find((x) => x.name === name);
    if (s) out.push({ kind: 'stop', label: s.name, lon: s.lon, lat: s.lat, stopId: s.id });
  }
  return out;
}

function priceHint(p: Place): string {
  if (p.prices.every((x) => x.unit === 'free' || (x.max ?? -1) === 0)) return 'gratuito';
  if (p.prices.some((x) => x.status === 'unknown')) return 'prezzo sconosciuto';
  const a = p.prices.filter((x) => x.audience !== 'child' && !x.optional);
  if (!a.length) return 'prezzo sconosciuto';
  const min = Math.min(...a.map((x) => x.min ?? 0)), max = Math.max(...a.map((x) => x.max ?? 0));
  const verified = a.every((x) => x.evidence.status === 'verified');
  return `CHF ${min === max ? min : `${min}–${max}`} a persona${verified ? ' (tariffa ufficiale)' : ' (stima)'}`;
}

void checkVisit;
