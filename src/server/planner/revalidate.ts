/**
 * Rivalidazione di un programma salvato quando viene riaperto per l'uso reale
 * (§7.3): confronta lo snapshot con i dati attuali (orari, prezzi, eventi, corse)
 * senza riscrivere il piano. Durante un replay si usa invece lo snapshot originale.
 */
import { DateTime } from 'luxon';
import type { Plan } from '../../shared/types.ts';
import { TZ } from '../../shared/types.ts';
import { checkVisit } from '../../shared/calendar.ts';
import { hhmm, todayZurich } from '../../shared/time.ts';
import type { DataStore } from '../data.ts';

export interface RevalidationItem { severity: 'info' | 'warning' | 'blocking'; stopId?: string; message: string }
export interface Revalidation { checkedAt: string; catalogVersion: string; snapshotVersion: string; expired: boolean; items: RevalidationItem[]; status: 'unchanged' | 'changed' | 'blocking' }

export function revalidate(plan: Plan, data: DataStore): Revalidation {
  const items: RevalidationItem[] = [];
  const date = plan.request.date;
  const expired = date < todayZurich();
  if (expired) items.push({ severity: 'blocking', message: `La data del programma (${date}) è passata: il programma resta consultabile come ricordo, non per l'uso reale.` });
  if (!data.transit.covers(date)) {
    const ref = data.transit.referenceDate(date);
    items.push(ref
      ? { severity: 'warning', message: `L'orario ufficiale dei mezzi per questa data non è ancora importato: le corse sono stimate dall'orario del ${ref}. Verificatele prima di partire.` }
      : { severity: 'blocking', message: 'La data è fuori dal periodo dell\'orario ufficiale importato.' });
  }
  if (plan.snapshot.catalogVersion !== data.catalogVersion) items.push({ severity: 'info', message: `Catalogo aggiornato dopo il salvataggio (${plan.snapshot.catalogVersion} → ${data.catalogVersion}).` });
  const feedNow = `${data.transit.feedVersion}`;
  if (!plan.snapshot.transitFeed.startsWith(feedNow)) items.push({ severity: 'warning', message: `Orario dei trasporti aggiornato (${plan.snapshot.transitFeed} → ${feedNow}): verificare le corse.` });
  for (const s of plan.stops) {
    if (s.kind === 'pause') continue;
    const p = data.place(s.placeId);
    if (!p) { items.push({ severity: 'blocking', stopId: s.id, message: `${s.name} non è più nel catalogo.` }); continue; }
    const old = plan.snapshot.places[s.placeId];
    const sched = p.schedules.find((x) => x.kind === 'public');
    if (JSON.stringify(old?.schedules ?? []) !== JSON.stringify(p.schedules)) items.push({ severity: 'warning', stopId: s.id, message: `Orari di ${s.name} modificati dopo il salvataggio.` });
    if (JSON.stringify(old?.prices ?? []) !== JSON.stringify(p.prices)) items.push({ severity: 'info', stopId: s.id, message: `Prezzi di ${s.name} aggiornati.` });
    if (s.kind !== 'event' && sched) {
      const chk = checkVisit(sched, DateTime.fromISO(s.start, { zone: TZ }), s.stayMin);
      if (!chk.ok) items.push({ severity: 'blocking', stopId: s.id, message: `${s.name}: ${chk.message} (dati attuali).` });
    }
    for (const e of p.evidence) if (data.isStale(e, e.field === 'hours' ? 'hours' : e.field === 'price' ? 'prices' : 'general')) items.push({ severity: 'info', stopId: s.id, message: `${s.name}: dato «${e.field}» oltre la scadenza prevista dalla fonte (ultimo controllo ${e.lastCheckedAt ?? 'n.d.'}).` });
    if (s.kind === 'event' && s.eventId) {
      const occ = data.occurrences(DateTime.fromISO(s.start).minus({ hours: 2 }), DateTime.fromISO(s.start).plus({ hours: 2 })).find((o) => o.eventId === s.eventId);
      if (!occ) items.push({ severity: 'blocking', stopId: s.id, message: `${s.name}: evento non più in calendario.` });
      else if (occ.status !== 'scheduled') items.push({ severity: 'blocking', stopId: s.id, message: `${s.name}: ${occ.status === 'cancelled' ? 'annullato' : occ.status === 'sold_out' ? 'esaurito' : 'rinviato'}${occ.note ? ` (${occ.note})` : ''}.` });
      else if (occ.start !== s.occurrenceStart) items.push({ severity: 'warning', stopId: s.id, message: `${s.name}: orario cambiato (${hhmm(s.occurrenceStart ?? s.start)} → ${hhmm(occ.start)}).` });
    }
  }
  // corse: esiste ancora la stessa corsa alla stessa ora?
  const tripIds = new Set(data.transit.d.trips.map((t) => t.id));
  for (const t of plan.trips) for (const l of t.legs) {
    if (!l.transit) continue;
    if (!tripIds.has(l.transit[0].tripId)) items.push({ severity: 'warning', message: `${l.transit[0].routeShort} delle ${hhmm(l.departure)}: corsa non trovata nell'orario attuale, verificare.` });
  }
  items.push({ severity: 'info', message: 'Nessun dato in tempo reale (ritardi, soppressioni) è integrato: controllare l\'orario il giorno stesso.' });
  const status = items.some((i) => i.severity === 'blocking') ? 'blocking' : items.some((i) => i.severity === 'warning') ? 'changed' : 'unchanged';
  return { checkedAt: new Date().toISOString(), catalogVersion: data.catalogVersion, snapshotVersion: plan.snapshot.catalogVersion, expired, items, status };
}
