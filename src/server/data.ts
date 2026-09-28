/**
 * Caricamento dei dati costruiti (catalogo, grafi, orari) e applicazione delle
 * modifiche editoriali salvate nel database. Il catalogo pubblicato è sempre
 * il risultato validato di file + modifiche.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { DateTime } from 'luxon';
import { Place, CatalogEvent, type Source, type EventOccurrence, type Evidence } from '../shared/types.ts';
import { expandEvent } from '../shared/calendar.ts';
import { Graph } from './routing/graph.ts';
import { TransitNetwork } from './routing/transit.ts';
import { Router } from './routing/router.ts';
import type { Db } from './db.ts';

export interface ExplorePoi { osm: string; cls: string; name: string; lon: number; lat: number; openingHours: string | null; website: string | null; wheelchair: string | null; cuisine: string | null }

export class DataStore {
  readonly dir: string;
  perimeter: any;
  sources: Source[] = [];
  private basePlaces: Place[] = [];
  private baseEvents: CatalogEvent[] = [];
  places = new Map<string, Place>();
  events = new Map<string, CatalogEvent>();
  hidden = new Set<string>();
  catalogVersion = '';
  baseVersion = '';
  explore: ExplorePoi[] = [];
  amenities: any[] = [];
  addresses: [string, number, number][] = [];
  router!: Router;
  transit!: TransitNetwork;
  loadedAt = '';
  loadMs = 0;

  constructor(dir = 'data') { this.dir = dir; }

  load(db?: Db) {
    const t0 = Date.now();
    const read = (f: string) => JSON.parse(readFileSync(join(this.dir, f), 'utf8'));
    this.perimeter = read('geo/perimeter.json');
    const cat = read('build/catalog.json');
    this.baseVersion = cat.version;
    this.sources = cat.sources;
    this.basePlaces = cat.places.map((p: unknown) => Place.parse(p));
    this.baseEvents = cat.events.map((e: unknown) => CatalogEvent.parse(e));
    const ex = read('build/explore.json');
    this.explore = ex.pois;
    this.amenities = ex.amenities;
    this.addresses = existsSync(join(this.dir, 'build/addresses.json')) ? read('build/addresses.json') : [];
    const walk = new Graph(read('build/graph-walk.json'));
    this.transit = new TransitNetwork(read('build/transit.json'));
    this.router = new Router(walk, this.transit);
    this.applyOverrides(db);
    this.loadedAt = new Date().toISOString();
    this.loadMs = Date.now() - t0;
  }

  /** Riapplica le modifiche editoriali (dopo ogni salvataggio dal pannello). */
  applyOverrides(db?: Db) {
    this.places = new Map(this.basePlaces.map((p) => [p.id, structuredClone(p)]));
    this.events = new Map(this.baseEvents.map((e) => [e.id, structuredClone(e)]));
    this.hidden.clear();
    let n = 0;
    for (const o of db?.listOverrides() ?? []) {
      if (o.kind === 'place') {
        const base = this.places.get(o.id);
        if (!base) continue;
        if (o.data.hidden) { this.hidden.add(o.id); n++; continue; }
        const merged = Place.safeParse({ ...base, ...o.data, id: base.id });
        if (merged.success) { this.places.set(o.id, merged.data); n++; }
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
