/**
 * API HTTP (Hono, database in memoria): salvataggio con token personale,
 * condivisione con oscuramento, voto con nome e commento ripuliti, revoca,
 * pannello editoriale protetto, validazione degli input.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { DataStore } from '../src/server/data.ts';
import { openDb } from '../src/server/db.ts';
import { createApi } from '../src/server/api.ts';
import { ensureAdminToken, config } from '../src/server/config.ts';
import { planAlternatives } from '../src/server/planner/index.ts';
import { GroupRequest, type Plan } from '../src/shared/types.ts';

const av = { color: '#c0392b', accent: '#fff', hat: 'none', accessory: 'none', hair: 'short', tone: '#f0cfa8' };
let app: ReturnType<typeof createApi>;
let alts: Plan[];
beforeAll(async () => {
  // funzione disattivata di default: qui si verifica il comportamento quando viene riattivata
  config.sharing = true;
  const data = new DataStore(); data.load();
  app = createApi(data, openDb(':memory:'));
  const r = await planAlternatives(GroupRequest.parse({
    date: '2026-10-03', start: { kind: 'address', label: 'Via Privata 1 (casa di Anna)', lon: 8.9512, lat: 46.0038 }, end: { mode: 'same' },
    occasion: 'friends', budget: { per: 'person', strict: false }, startTime: '10:00', endTime: '17:00', moods: ['cultural'],
    people: [{ id: 'a', name: 'Anna', kind: 'adult', avatar: av, interests: [] }, { id: 'b', name: 'Bruno', kind: 'adult', avatar: av, interests: [] }],
    mobility: { stroller: false, wheelchair: false, avoidStairs: false, frequentBreaks: true },
  }), { data });
  if (r.status !== 'ok') throw new Error(r.status);
  alts = r.alternatives;
});

const json = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
  app.request(path, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined });

describe('salvataggio e condivisione', () => {
  it('disattivati di default: l\'API rifiuta salvataggi, programmi e link condivisi', async () => {
    config.sharing = false;
    try {
      expect((await json('POST', '/api/plans', { title: 'x', data: {} })).status).toBe(404);
      expect((await app.request('/api/plans/abc')).status).toBe(404);
      expect((await app.request('/api/share/abc')).status).toBe(404);
      expect((await (await app.request('/api/meta')).json()).features).toEqual({ sharing: false });
    } finally { config.sharing = true; }
  });
  it('link condiviso oscurato, voto con commento ripulito, revoca', async () => {
    const saved = await (await json('POST', '/api/plans', { title: 'Sabato', data: { alternatives: alts, current: alts[0], branches: [] } })).json();
    expect(saved.id).toBeTruthy();
    expect(saved.editToken).toBeTruthy();
    // senza token di modifica non si condivide
    expect((await json('POST', `/api/plans/${saved.id}/share`, { allowVotes: true })).status).toBe(403);
    const share = await (await json('POST', `/api/plans/${saved.id}/share`, { allowVotes: true, redaction: { hideLocations: true, hideNames: true, hideNeeds: true, hideBudget: false } }, { 'x-edit-token': saved.editToken })).json();
    const view = await (await app.request(`/api/share/${share.token}`)).json();
    const text = JSON.stringify(view);
    expect(text).not.toContain('casa di Anna');
    expect(text).not.toContain('Via Privata');
    expect(text).not.toContain('Bruno');
    // anche nei piani annidati delle decisioni: nessuna richiesta conserva le coordinate della partenza privata
    const starts: any[] = [];
    const walk = (o: any) => { if (o && typeof o === 'object') { if (o.request?.start) starts.push(o.request.start); for (const v of Object.values(o)) walk(v); } };
    walk(view);
    expect(starts.length).toBeGreaterThan(1);
    for (const st of starts) { expect(st.lon).toBe(0); expect(st.lat).toBe(0); }
    // voto: opzione inesistente rifiutata; nome e commento ripuliti e troncati
    expect((await json('POST', `/api/share/${share.token}/vote`, { voter: 'voter-123456', optionId: 'inesistente' })).status).toBe(400);
    const v = await (await json('POST', `/api/share/${share.token}/vote`, { voter: 'voter-123456', optionId: alts[0].id, name: '<b>Sara</b>', comment: `ok <script>x</script> ${'a'.repeat(300)}` })).json();
    expect(v.tally[alts[0].id]).toBe(1);
    expect(v.comments[0].comment.length).toBeLessThanOrEqual(140);
    expect(v.comments[0].comment).not.toMatch(/[<>]/);
    expect(v.comments[0].name).not.toMatch(/[<>]/);
    expect(JSON.stringify(v)).not.toContain('voter-123456');
    // cambiare voto non raddoppia il conteggio
    const v2 = await (await json('POST', `/api/share/${share.token}/vote`, { voter: 'voter-123456', optionId: alts[1]?.id ?? alts[0].id })).json();
    expect(Object.values(v2.tally as Record<string, number>).reduce((a, b) => a + b, 0)).toBe(1);
    // il proprietario vede il riepilogo dei voti
    const list = await (await app.request(`/api/plans/${saved.id}/shares`, { headers: { 'x-edit-token': saved.editToken } })).json();
    expect(list.shares[0].tally).toBeTruthy();
    // revoca: il link non è più accessibile
    expect((await app.request(`/api/share/${share.token}`, { method: 'DELETE', headers: { 'x-edit-token': 'sbagliato' } })).status).toBe(403);
    expect((await app.request(`/api/share/${share.token}`, { method: 'DELETE', headers: { 'x-edit-token': saved.editToken } })).status).toBe(200);
    expect((await app.request(`/api/share/${share.token}`)).status).toBe(410);
  });
});

describe('pannello editoriale e input', () => {
  it('senza token corretto il pannello è inaccessibile', async () => {
    expect((await app.request('/api/admin/overview')).status).toBe(401);
    expect((await app.request('/api/admin/overview', { headers: { Authorization: 'Bearer sbagliato' } })).status).toBe(401);
    const ok = await app.request('/api/admin/overview', { headers: { Authorization: `Bearer ${ensureAdminToken()}` } });
    expect(ok.status).toBe(200);
    expect((await ok.json()).conflicts).toEqual([]);
  });
  it('date non valide e richieste malformate sono rifiutate con un messaggio', async () => {
    expect((await app.request('/api/places/lac?date=2026-13-45')).status).toBe(400);
    expect((await app.request('/api/events?from=2026-02-30')).status).toBe(400);
    expect((await app.request('/api/events?days=abc')).status).toBe(200);
    expect((await json('POST', '/api/replan', { plan: {}, decision: { kind: 'boh' } })).status).toBe(400);
    expect((await json('POST', '/api/planb', { plan: { stops: 'x' } })).status).toBe(400);
  });
});
