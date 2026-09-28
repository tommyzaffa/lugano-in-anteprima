/**
 * Caricamento dei dati costruiti (catalogo, grafi, orari) e applicazione delle
 * modifiche editoriali salvate nel database. Il catalogo pubblicato è sempre
 * il risultato validato di file + modifiche.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { DateTime } from 'luxon';
import { Place, CatalogEvent, Source, type EventOccurrence, type Evidence } from '../shared/types.ts';
import { expandEvent } from '../shared/calendar.ts';
import { Graph } from './routing/graph.ts';
import { TransitNetwork } from './routing/transit.ts';
import { Router } from './routing/router.ts';
import type { Db } from './db.ts';
import { createHash } from 'node:crypto';

/** Impronta stabile del dato di base di un luogo (per rilevare conflitti con le modifiche editoriali). */
export function baseHash(p: unknown): string { return createHash('sha1').update(JSON.stringify(p)).digest('hex').slice(0, 12); }

/**
 * Origine degli eventi: «live» = calendario ufficiale importato (data/build/events-live.json),
 * «demo» = fixture dimostrative del catalogo, «auto» = live se disponibile, altrimenti demo.
 * EVENTS_SOURCE imposta il valore predefinito (i test unitari usano le fixture).
 */
export type EventsMode = 'auto' | 'live' | 'demo';
export interface EventsSource { kind: 'live' | 'demo'; name: string; url?: string; fetchedAt?: string; windowTo?: string }

export interface ExplorePoi { osm: string; cls: string; name: string; lon: number; lat: number; openingHours: string | null; website: string | null; wheelchair: string | null; cuisine: string | null }

export class DataStore {
  readonly dir: string;
  perimeter: any;
  sources: Source[] = [];
  private basePlaces: Place[] = [];
  conflicts: { kind: string; id: string; note: string }[] = [];
  private baseEvents: CatalogEvent[] = [];
  places = new Map<string, Place>();
  events = new Map<string, CatalogEvent>();
  hidden = new Set<string>();
  catalogVersion = '';
  baseVersion = '';
  explore: ExplorePoi[] = [];
  stopAccess: { name: string; modes: string[]; wheelchair: string; evidence: Evidence }[] = [];
  amenities: any[] = [];
  addresses: [string, number, number][] = [];
  router!: Router;
  transit!: TransitNetwork;
  loadedAt = '';
  loadMs = 0;
  eventsSource: EventsSource = { kind: 'demo', name: 'Fixture dimostrative' };
  private eventsMode: EventsMode;

  constructor(dir = 'data', opts: { events?: EventsMode } = {}) {
    this.dir = dir;
    this.eventsMode = opts.events ?? (process.env.EVENTS_SOURCE as EventsMode | undefined) ?? 'auto';
  }

  load(db?: Db) {
    const t0 = Date.now();
    const read = (f: string) => JSON.parse(readFileSync(join(this.dir, f), 'utf8'));
    this.perimeter = read('geo/perimeter.json');
    const cat = read('build/catalog.json');
    this.baseVersion = cat.version;
    this.sources = cat.sources;
    this.basePlaces = cat.places.map((p: unknown) => Place.parse(p));
    this.baseEvents = cat.events.map((e: unknown) => CatalogEvent.parse(e));
    this.eventsSource = { kind: 'demo', name: 'Fixture dimostrative' };
    const liveFile = join(this.dir, 'build/events-live.json');
    if (this.eventsMode !== 'demo' && existsSync(liveFile)) {
      const live = read('build/events-live.json');
      if (live.events?.length) {
        // eventi reali: sostituiscono le fixture; le sedi nuove entrano come luoghi «solo tramite evento»
        this.basePlaces.push(...live.venues.map((v: unknown) => Place.parse(v)));
        this.baseEvents = live.events.map((e: unknown) => CatalogEvent.parse(e));
        this.sources = [...this.sources.filter((s) => s.id !== live.source.id), Source.parse({
          id: live.source.id, name: live.source.name, kind: 'official_site', url: live.source.url, license: live.source.license, reuse: 'restricted',
          freshnessHours: { events: 48 }, acquiredAt: live.source.fetchedAt, note: `Calendario importato il ${live.source.fetchedAt.slice(0, 10)}, eventi fino al ${live.source.windowTo}. Ogni evento rimanda alla scheda ufficiale.`,
        })];
        this.eventsSource = { kind: 'live', name: live.source.name, url: live.source.url, fetchedAt: live.source.fetchedAt, windowTo: live.source.windowTo };
      }
    }
    if (this.eventsMode === 'live' && this.eventsSource.kind !== 'live') throw new Error('Eventi reali richiesti ma data/build/events-live.json non è disponibile');
    const ex = read('build/explore.json');
    this.explore = ex.pois;
    this.amenities = ex.amenities;
    this.addresses = existsSync(join(this.dir, 'build/addresses.json')) ? read('build/addresses.json') : [];
    const walk = new Graph(read('build/graph-walk.json'));
    this.transit = new TransitNetwork(read('build/transit.json'));
    this.router = new Router(walk, this.transit);
    // fermate non accessibili in sedia a rotelle (dato con fonte nel catalogo)
    this.stopAccess = cat.stopAccess ?? [];
    this.router.wheelchairBlocked = new Set(this.transit.d.stops.map((s, i) => [s, i] as const)
      .filter(([s]) => this.stopAccess.some((a) => a.wheelchair === 'no' && a.name === s.name && a.modes.some((m) => s.modes.includes(m as any))))
      .map(([, i]) => i));
    this.applyOverrides(db);
    this.loadedAt = new Date().toISOString();
    this.loadMs = Date.now() - t0;
  }

  /** Riapplica le modifiche editoriali (dopo ogni salvataggio dal pannello). */
  applyOverrides(db?: Db) {
    this.places = new Map(this.basePlaces.map((p) => [p.id, structuredClone(p)]));
    this.events = new Map(this.baseEvents.map((e) => [e.id, structuredClone(e)]));
    this.hidden.clear();
    this.conflicts = [];
    let n = 0;
    for (const o of db?.listOverrides() ?? []) {
      if (o.kind === 'place') {
        const base = this.places.get(o.id);
        if (!base) { this.conflicts.push({ kind: 'place', id: o.id, note: 'Modifica editoriale su un luogo non più presente nel catalogo di base.' }); continue; }
        if (o.data._baseHash && o.data._baseHash !== baseHash(this.basePlaces.find((p) => p.id === o.id))) this.conflicts.push({ kind: 'place', id: o.id, note: 'Il dato di base è cambiato dopo la modifica editoriale: verificare quale versione tenere.' });
        if (o.data.hidden) { this.hidden.add(o.id); n++; continue; }
        const { _baseHash, ...patch } = o.data;
        void _baseHash;
        const merged = Place.safeParse({ ...base, ...patch, id: base.id });
        if (merged.success) { this.places.set(o.id, merged.data); n++; }
        else this.conflicts.push({ kind: 'place', id: o.id, note: 'Modifica editoriale non più valida rispetto allo schema: ignorata.' });
      } else if (o.kind === 'event') {
        const base = this.events.get(o.id);
        if (!base) continue;
        if (o.data.hidden) { this.events.delete(o.id); n++; continue; }
        const merged = CatalogEvent.safeParse({ ...base, ...o.data, id: base.id });
        if (merged.success) { this.events.set(o.id, merged.data); n++; }
      }
    }
    for (const id of this.hidden) this.places.delete(id);
    this.catalogVersion = n ? `${this.baseVersion}+ed${n}` : this.baseVersion;
  }

  place(id: string): Place | undefined { return this.places.get(id); }
  basePlace(id: string): Place | undefined { return this.basePlaces.find((p) => p.id === id); }

  occurrences(from: DateTime, to: DateTime): EventOccurrence[] {
    const out: EventOccurrence[] = [];
    for (const ev of this.events.values()) {
      if (!this.places.has(ev.placeId)) continue;
      out.push(...expandEvent(ev, from, to));
    }
    return out.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  }

  source(id: string): Source | undefined { return this.sources.find((s) => s.id === id); }

  /** Un'evidenza è scaduta secondo la politica della sua fonte? */
  isStale(e: Evidence, kind: 'hours' | 'prices' | 'events' | 'transport' | 'general', now = Date.now()): boolean {
    const src = this.source(e.sourceId);
    const hours = src?.freshnessHours?.[kind] ?? src?.freshnessHours?.general;
    if (!hours || !e.lastCheckedAt) return false;
    return now - Date.parse(e.lastCheckedAt) > hours * 3600_000;
  }
}
