/**
 * Percorso «AI live» con un fornitore simulato: l'AI propone, il motore valida.
 * Riferimenti inesistenti, battute di personaggi non presenti e momenti inventati vengono scartati.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import type { z } from 'zod';
import { DataStore } from '../src/server/data.ts';
import { planAlternatives } from '../src/server/planner/index.ts';
import { createAiHooks, setCatalogNames } from '../src/server/ai/index.ts';
import type { AiProvider } from '../src/server/ai/provider.ts';
import { GroupRequest } from '../src/shared/types.ts';

const av = { color: '#c0392b', accent: '#fff', hat: 'none', accessory: 'none', hair: 'short', tone: '#f0cfa8' };
let data: DataStore;
beforeAll(() => { data = new DataStore(); data.load(); setCatalogNames([...data.places.values()].map((p) => ({ id: p.id, name: p.name }))); });

function fakeProvider(calls: string[]): AiProvider {
  return {
    name: 'fake', model: 'fake-model',
    async structured<T extends z.ZodType>(_system: string, user: string, schema: T, meta: { purpose: string }) {
      calls.push(meta.purpose);
      let out: unknown;
      if (meta.purpose === 'interpret') out = { moods: ['views'], avoid: [], mentionedPlaceIds: ['monte-bre', 'luogo-inventato'], indoor: null, cheap: false, understood: ['panorama dal Monte Brè'] };
      if (meta.purpose === 'propose') out = { proposals: [
        { theme: 'panorami', placeKeys: ['monte-bre', 'osteria-funicolare', 'bre-paese'], rationale: 'vista e pranzo in quota' },
        { theme: 'lago', placeKeys: ['ristorante-inventato', 'gandria'], rationale: 'riferimento non valido' },
      ] };
      if (meta.purpose === 'narrate') {
        const ids = [...user.matchAll(/"momentId":"([^"]+)"/g)].map((m) => m[1]);
        out = { lines: [
          { momentId: ids[0], speaker: 'Ada', text: 'Che vista!' },
          { momentId: ids[1] ?? ids[0], speaker: 'Personaggio inventato', text: 'Non dovrei esserci' },
          { momentId: 'stop:inventato', speaker: 'Ada', text: 'Momento inesistente' },
        ] };
      }
      const parsed = schema.safeParse(out);
      return parsed.success ? parsed.data : null;
    },
  };
}

describe('AI con output validato', () => {
  it('le proposte AI con identificativi inesistenti sono scartate; il piano resta verificato dal motore', async () => {
    const calls: string[] = [];
    const req = GroupRequest.parse({
      people: [{ id: 'a', name: 'Ada', kind: 'adult', avatar: av, interests: [] }, { id: 'b', name: 'Bruno', kind: 'adult', avatar: av, interests: [] }],
      date: '2026-10-03', startTime: '10:00', endTime: '17:30', start: { kind: 'stop', label: 'Stazione', lon: 8.946849, lat: 46.005499 }, end: { mode: 'same' },
      occasion: 'date', moods: [], budget: { per: 'person', strict: false }, freeText: 'ci piacerebbe salire sul Monte Brè per il panorama',
    });
    const r = await planAlternatives(req, { data, ai: createAiHooks(fakeProvider(calls)) });
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(calls).toContain('interpret');
    expect(calls).toContain('propose');
    expect(r.plannerSource).toBe('ai-live');
    expect(r.notices.join(' ')).toMatch(/non validi/);
    for (const p of r.alternatives) {
      for (const s of p.stops) expect(data.place(s.placeId)).toBeTruthy();
      expect(p.feasibility).not.toBe('invalid');
      for (const l of p.narrative.lines) expect(['Ada', 'Bruno']).toContain(l.speaker);
    }
    expect(r.alternatives.some((p) => p.stops.some((s) => s.placeId === 'monte-bre'))).toBe(true);
    expect(r.understood.join(' ')).toContain('AI:');
  });
});
