/**
 * Adattatore Open Journey Planner 2.0 (opentransportdata.swiss).
 * Implementato secondo lo schema OJP 2.0 (TripRequest) ma NON verificato live:
 * richiede una chiave personale (OJP_API_KEY). Usato solo per il controllo
 * «verifica live» di una tratta; il pianificatore usa l'orario GTFS importato.
 */
import { XMLParser } from 'fast-xml-parser';
import { config } from '../config.ts';

export interface OjpTrip { departure: string; arrival: string; legs: { mode: string; line?: string; from: string; to: string; dep: string; arr: string }[] }

export function buildTripRequest(from: { lon: number; lat: number; label: string }, to: { lon: number; lat: number; label: string }, departureIso: string, results = 3): string {
  const now = new Date().toISOString();
  const place = (p: { lon: number; lat: number; label: string }) => `<PlaceRef><GeoPosition><siri:Longitude>${p.lon.toFixed(6)}</siri:Longitude><siri:Latitude>${p.lat.toFixed(6)}</siri:Latitude></GeoPosition><Name><Text>${escapeXml(p.label)}</Text></Name></PlaceRef>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<OJP xmlns="http://www.vdv.de/ojp" xmlns:siri="http://www.siri.org.uk/siri" version="2.0">
  <OJPRequest>
    <siri:ServiceRequest>
      <siri:RequestTimestamp>${now}</siri:RequestTimestamp>
      <siri:RequestorRef>${escapeXml(config.transitLive.requestorRef)}</siri:RequestorRef>
      <OJPTripRequest>
        <siri:RequestTimestamp>${now}</siri:RequestTimestamp>
        <Origin>${place(from)}<DepArrTime>${departureIso}</DepArrTime></Origin>
        <Destination>${place(to)}</Destination>
        <Params><NumberOfResults>${results}</NumberOfResults><IncludeIntermediateStops>false</IncludeIntermediateStops><UseRealtimeData>explanatory</UseRealtimeData></Params>
      </OJPTripRequest>
    </siri:ServiceRequest>
  </OJPRequest>
</OJP>`;
}

function escapeXml(s: string) { return s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]!)); }

export function parseTripResponse(xml: string): OjpTrip[] {
  const parser = new XMLParser({ ignoreAttributes: true, removeNSPrefix: true });
  const doc = parser.parse(xml);
  const delivery = doc?.OJP?.OJPResponse?.ServiceDelivery?.OJPTripDelivery;
  const results = [delivery?.TripResult].flat().filter(Boolean);
  const text = (x: any) => (typeof x === 'string' ? x : x?.Text ?? '');
  return results.map((r: any) => {
    const trip = r.Trip;
    const legs = [trip?.Leg].flat().filter(Boolean).map((l: any) => {
      if (l.TimedLeg) {
        const b = l.TimedLeg.LegBoard, a = l.TimedLeg.LegAlight, s = l.TimedLeg.Service;
        return { mode: s?.Mode?.PtMode ?? 'pt', line: text(s?.PublishedServiceName), from: text(b?.StopPointName), to: text(a?.StopPointName), dep: b?.ServiceDeparture?.EstimatedTime ?? b?.ServiceDeparture?.TimetabledTime, arr: a?.ServiceArrival?.EstimatedTime ?? a?.ServiceArrival?.TimetabledTime };
      }
      const t = l.TransferLeg ?? l.ContinuousLeg;
      return { mode: 'walk', from: text(t?.LegStart?.Name), to: text(t?.LegEnd?.Name), dep: t?.TimeWindowStart ?? '', arr: t?.TimeWindowEnd ?? '' };
    });
    return { departure: trip?.StartTime, arrival: trip?.EndTime, legs };
  });
}

export async function ojpTrip(from: { lon: number; lat: number; label: string }, to: { lon: number; lat: number; label: string }, departureIso: string): Promise<{ status: 'not_configured' | 'ok' | 'error'; trips?: OjpTrip[]; message?: string }> {
  if (config.transitLive.provider !== 'ojp' || !config.transitLive.ojpToken) return { status: 'not_configured', message: 'OJP non configurato (OJP_API_KEY mancante).' };
  try {
    const res = await fetch(config.transitLive.ojpUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/xml', Authorization: `Bearer ${config.transitLive.ojpToken}` },
      body: buildTripRequest(from, to, departureIso),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { status: 'error', message: `OJP ${res.status}` };
    return { status: 'ok', trips: parseTripResponse(await res.text()) };
  } catch (e) {
    return { status: 'error', message: (e as Error).message };
  }
}
