import { readFileSync } from 'node:fs';
import { TransitNetwork } from '../../src/server/routing/transit.ts';
import { DateTime } from 'luxon';
const tn = new TransitNetwork(JSON.parse(readFileSync('data/build/transit.json', 'utf8')));
for (const date of ['2026-10-02', '2026-10-03', '2026-11-15']) {
  tn.d.patterns.forEach((p, pi) => {
    const r = tn.routeById.get(p.route)!;
    if (r.mode !== 'funicular') return;
    const base = TransitNetwork.serviceBase(date);
    const deps = tn.departuresFrom(pi, 0, base, base + 26 * 3600_000);
    const names = p.stops.map((s) => tn.d.stops[s].name);
    console.log(date, r.short, names[0], '→', names[names.length - 1], deps.length, deps.slice(0, 3).map((d) => DateTime.fromMillis(d.dep).setZone('Europe/Zurich').toFormat('HH:mm')).join(','), '…', deps.slice(-2).map((d) => DateTime.fromMillis(d.dep).setZone('Europe/Zurich').toFormat('HH:mm')).join(','));
  });
}
