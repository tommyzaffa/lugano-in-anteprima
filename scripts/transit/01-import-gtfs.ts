/**
 * Import dell'orario ufficiale svizzero (GTFS statico, opentransportdata.swiss)
 * filtrato sulle fermate dell'area buffer.
 *
 * Input:  data/raw/gtfs/gtfs_fp2026.zip (download: vedi docs/FONTI.md)
 * Output: data/build/transit-raw.json (orari compatti, senza geometrie)
 *
 * Nota: è un orario pianificato (statico), non real time. Il feed ha una
 * versione e un periodo di validità che vengono conservati come evidenza.
 */
import yauzl from 'yauzl';
import { createInterface } from 'node:readline';
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import type { Readable } from 'node:stream';

const ZIP = process.argv[2] ?? 'data/raw/gtfs/gtfs_fp2026.zip';
const perimeter = JSON.parse(readFileSync('data/geo/perimeter.json', 'utf8'));
const B = perimeter.buffer;

function openEntry(name: string): Promise<Readable> {
  return new Promise((resolve, reject) => {
    yauzl.open(ZIP, { lazyEntries: true, autoClose: false }, (err, zip) => {
      if (err || !zip) return reject(err);
      zip.on('entry', (entry) => {
        if (entry.fileName === name) {
          zip.openReadStream(entry, (e, s) => (e || !s ? reject(e) : resolve(s)));
        } else zip.readEntry();
      });
      zip.on('end', () => reject(new Error('entry non trovata ' + name)));
      zip.readEntry();
    });
  });
}

/** Parser CSV minimale per i file GTFS (campi quotati, virgole solo come separatori o dentro virgolette). */
function parseLine(line: string): string[] {
  const out: string[] = [];
  let i = 0;
  const n = line.length;
  while (i <= n) {
    if (line[i] === '"') {
      let j = i + 1, s = '';
      while (j < n) {
        if (line[j] === '"') {
          if (line[j + 1] === '"') { s += '"'; j += 2; continue; }
          break;
        }
        s += line[j++];
      }
      out.push(s);
      i = j + 2; // salta virgola
    } else {
      let j = line.indexOf(',', i);
      if (j < 0) j = n;
      out.push(line.slice(i, j));
      i = j + 1;
    }
    if (i > n) break;
  }
  return out;
}

async function eachRow(name: string, fn: (row: string[], idx: Record<string, number>) => void) {
  const stream = await openEntry(name);
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  let idx: Record<string, number> | null = null;
  let count = 0;
  for await (const raw of rl) {
    const line = idx ? raw : raw.replace(/^﻿/, '');
    if (!line) continue;
    const row = parseLine(line);
    if (!idx) { idx = Object.fromEntries(row.map((h, i) => [h, i])); continue; }
    fn(row, idx);
    if (++count % 5_000_000 === 0) console.log(`    ${name}: ${count / 1e6}M righe`);
  }
  return count;
}

function toSec(t: string): number {
  const [h, m, s] = t.split(':').map(Number);
  return h * 3600 + m * 60 + (s || 0);
}

async function main() {
  const t0 = Date.now();
  console.log('→ feed_info');
  let feedInfo: Record<string, string> = {};
  await eachRow('feed_info.txt', (r, i) => { feedInfo = Object.fromEntries(Object.entries(i).map(([k, v]) => [k, r[v]])); });

  console.log('→ stops');
  const stops = new Map<string, { id: string; name: string; lat: number; lon: number; parent: string; platform: string; didok: string }>();
  await eachRow('stops.txt', (r, i) => {
    const lat = Number(r[i.stop_lat]), lon = Number(r[i.stop_lon]);
    if (lat < B.south || lat > B.north || lon < B.west || lon > B.east) return;
    stops.set(r[i.stop_id], { id: r[i.stop_id], name: r[i.stop_name], lat, lon, parent: r[i.parent_station] ?? '', platform: r[i.platform_code] ?? '', didok: r[i.didok] ?? '' });
  });
  console.log(`  fermate nell'area: ${stops.size}`);

  console.log('→ stop_times (file grande, streaming)');
  const tripStops = new Map<string, [number, string, number, number, number, number][]>(); // seq, stop, arr, dep, pickup, dropoff
  await eachRow('stop_times.txt', (r, i) => {
    const sid = r[i.stop_id];
    if (!stops.has(sid)) return;
    const tid = r[i.trip_id];
    let arr = tripStops.get(tid);
    if (!arr) tripStops.set(tid, (arr = []));
    arr.push([Number(r[i.stop_sequence]), sid, toSec(r[i.arrival_time]), toSec(r[i.departure_time]), Number(r[i.pickup_type] || 0), Number(r[i.drop_off_type] || 0)]);
  });
  for (const [tid, arr] of tripStops) if (arr.length < 2) tripStops.delete(tid);
  console.log(`  corse con ≥2 fermate nell'area: ${tripStops.size}`);

  console.log('→ trips');
  const trips = new Map<string, { id: string; route: string; service: string; headsign: string; shortName: string; dir: string }>();
  await eachRow('trips.txt', (r, i) => {
    const id = r[i.trip_id];
    if (!tripStops.has(id)) return;
    trips.set(id, { id, route: r[i.route_id], service: r[i.service_id], headsign: r[i.trip_headsign], shortName: r[i.trip_short_name], dir: r[i.direction_id] });
  });

  console.log('→ routes / agency');
  const routeIds = new Set([...trips.values()].map((t) => t.route));
  const routes = new Map<string, any>();
  await eachRow('routes.txt', (r, i) => {
    if (!routeIds.has(r[i.route_id])) return;
    routes.set(r[i.route_id], { id: r[i.route_id], agency: r[i.agency_id], short: r[i.route_short_name], long: r[i.route_long_name], desc: r[i.route_desc], type: Number(r[i.route_type]) });
  });
  const agencyIds = new Set([...routes.values()].map((r) => r.agency));
  const agencies: Record<string, any> = {};
  await eachRow('agency.txt', (r, i) => { if (agencyIds.has(r[i.agency_id])) agencies[r[i.agency_id]] = { id: r[i.agency_id], name: r[i.agency_name], url: r[i.agency_url], tz: r[i.agency_timezone] }; });

  console.log('→ calendar / calendar_dates');
  const serviceIds = new Set([...trips.values()].map((t) => t.service));
  const services: Record<string, { days: number[]; start: string; end: string; add: string[]; remove: string[] }> = {};
  await eachRow('calendar.txt', (r, i) => {
    const id = r[i.service_id];
    if (!serviceIds.has(id)) return;
    services[id] = {
      days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((d) => Number(r[i[d]])),
      start: r[i.start_date], end: r[i.end_date], add: [], remove: [],
    };
  });
  await eachRow('calendar_dates.txt', (r, i) => {
    const id = r[i.service_id];
    if (!serviceIds.has(id)) return;
    const s = (services[id] ??= { days: [0, 0, 0, 0, 0, 0, 0], start: '', end: '', add: [], remove: [] });
    (r[i.exception_type] === '1' ? s.add : s.remove).push(r[i.date]);
  });

  console.log('→ frequencies');
  const frequencies: Record<string, { start: number; end: number; headway: number; exact: number }[]> = {};
  await eachRow('frequencies.txt', (r, i) => {
    const id = r[i.trip_id];
    if (!trips.has(id)) return;
    (frequencies[id] ??= []).push({ start: toSec(r[i.start_time]), end: toSec(r[i.end_time]), headway: Number(r[i.headway_secs]), exact: Number(r[i.exact_times] || 0) });
  });

  console.log('→ transfers (solo fra fermate dell\'area, senza vincoli di corsa)');
  const transfers: { from: string; to: string; min: number }[] = [];
  await eachRow('transfers.txt', (r, i) => {
    const f = r[i.from_stop_id], t = r[i.to_stop_id];
    if (!stops.has(f) || !stops.has(t)) return;
    if (r[i.from_trip_id] || r[i.to_trip_id] || r[i.from_route_id] || r[i.to_route_id]) return;
    transfers.push({ from: f, to: t, min: Number(r[i.min_transfer_time] || 0) });
  });

  // Solo le fermate effettivamente servite + i loro genitori.
  const usedStops = new Set<string>();
  for (const arr of tripStops.values()) for (const s of arr) usedStops.add(s[1]);
  const stopList = [...stops.values()].filter((s) => usedStops.has(s.id));
  const stopIndex = new Map(stopList.map((s, k) => [s.id, k]));

  const tripList = [...trips.values()].map((t) => {
    const st = tripStops.get(t.id)!.sort((a, b) => a[0] - b[0]);
    return {
      id: t.id, route: t.route, service: t.service, headsign: t.headsign, shortName: t.shortName, dir: t.dir,
      stops: st.map((s) => stopIndex.get(s[1])!),
      arr: st.map((s) => s[2]),
      dep: st.map((s) => s[3]),
      pickup: st.some((s) => s[4]) ? st.map((s) => s[4]) : undefined,
      dropoff: st.some((s) => s[5]) ? st.map((s) => s[5]) : undefined,
      freq: frequencies[t.id],
    };
  });

  const typeCount: Record<number, number> = {};
  for (const r of routes.values()) typeCount[r.type] = (typeCount[r.type] ?? 0) + 1;
  const zipStat = statSync(ZIP);
  const out = {
    source: {
      name: 'Orario ufficiale svizzero GTFS (opentransportdata.swiss)',
      url: `https://data.opentransportdata.swiss/en/dataset/${process.env.GTFS_DATASET ?? 'timetable-2026-gtfs2020'}`,
      license: 'Termini d\'uso opentransportdata.swiss (riutilizzo consentito con indicazione della fonte)',
      feedVersion: feedInfo.feed_version, feedStart: feedInfo.feed_start_date, feedEnd: feedInfo.feed_end_date,
      publisher: feedInfo.feed_publisher_name,
      archive: ZIP.split('/').pop(), archiveBytes: zipStat.size, archiveDate: zipStat.mtime.toISOString(),
      importedAt: new Date().toISOString(),
      kind: 'static-timetable',
      note: 'Orario pianificato. Non include ritardi, soppressioni o perturbazioni in tempo reale.',
    },
    bbox: B,
    agencies,
    routes: [...routes.values()],
    stops: stopList,
    services,
    trips: tripList,
    transfers,
  };
  writeFileSync('data/build/transit-raw.json', JSON.stringify(out));
  console.log(`Fatto in ${((Date.now() - t0) / 1000).toFixed(0)} s: ${stopList.length} fermate, ${routes.size} linee, ${tripList.length} corse, ${Object.keys(services).length} calendari`);
  console.log('Tipi di linea:', typeCount);
}

main().catch((e) => { console.error(e); process.exit(1); });
