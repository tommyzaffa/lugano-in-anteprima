/**
 * Modelli dati minimi (§14 del brief) con schemi runtime (zod).
 * Identificativi stabili collegano tutte le entità; ogni riferimento
 * restituito dall'AI viene validato contro il catalogo.
 */
import { z } from 'zod';

export const TZ = 'Europe/Zurich' as const;
export const MAX_PEOPLE = 12;

// ---------------------------------------------------------------- provenienza
export const VerificationStatus = z.enum([
  'verified',        // controllato da redazione su fonte ufficiale, con data
  'official_import', // import da dataset ufficiale (es. orario GTFS)
  'editorial',       // curato dalla redazione, da riverificare
  'osm',             // da OpenStreetMap, da verificare
  'estimate',        // stima calcolata o indicativa
  'demo',            // fixture dimostrativa
  'unknown',         // informazione mancante
]);
export type VerificationStatus = z.infer<typeof VerificationStatus>;

export const Evidence = z.object({
  field: z.string(),
  sourceId: z.string(),
  status: VerificationStatus,
  observedAt: z.string().optional(), // data ISO di osservazione/acquisizione
  lastCheckedAt: z.string().optional(),
  validUntil: z.string().optional(),
  url: z.string().optional(),
  note: z.string().optional(),
});
export type Evidence = z.infer<typeof Evidence>;

export const Source = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(['osm', 'gtfs', 'official_site', 'editorial', 'demo', 'weather', 'ai', 'user_report', 'computed', 'terrain']),
  url: z.string().optional(),
  license: z.string().optional(),
  reuse: z.enum(['open', 'restricted', 'unknown', 'internal']),
  /** ore dopo le quali il dato va considerato scaduto, per tipo di informazione */
  freshnessHours: z.object({
    hours: z.number().optional(),
    prices: z.number().optional(),
    events: z.number().optional(),
    transport: z.number().optional(),
    general: z.number().optional(),
  }).default({}),
  acquiredAt: z.string().optional(),
  note: z.string().optional(),
});
export type Source = z.infer<typeof Source>;

// ---------------------------------------------------------------- orari
const HHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'formato HH:mm');
const MMDD = z.string().regex(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, 'formato MM-DD');
const YMD = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'formato YYYY-MM-DD');

export const OpeningRule = z.object({
  /** giorni ISO: 1 = lunedì … 7 = domenica */
  days: z.array(z.number().int().min(1).max(7)).min(1),
  from: HHMM,
  /** se to <= from l'intervallo termina il giorno successivo */
  to: HHMM,
  lastEntry: HHMM.optional(),
  seasonFrom: MMDD.optional(),
  seasonTo: MMDD.optional(),
  validFrom: YMD.optional(),
  validTo: YMD.optional(),
});
export type OpeningRule = z.infer<typeof OpeningRule>;

export const OpeningException = z.object({
  date: YMD,
  closed: z.boolean().optional(),
  intervals: z.array(z.object({ from: HHMM, to: HHMM, lastEntry: HHMM.optional() })).optional(),
  note: z.string().optional(),
});

export const ScheduleKind = z.enum(['public', 'kitchen', 'ticket_office', 'facility', 'service', 'bar']);
export const OpeningSchedule = z.object({
  id: z.string(),
  kind: ScheduleKind,
  label: z.string().optional(),
  tz: z.literal(TZ).default(TZ),
  alwaysOpen: z.boolean().optional(),
  rules: z.array(OpeningRule).default([]),
  holidays: z.enum(['closed', 'as_sunday', 'regular', 'unknown']).default('unknown'),
  exceptions: z.array(OpeningException).default([]),
  /** stringa OSM opening_hours originale, conservata come evidenza */
  osmOpeningHours: z.string().optional(),
  evidence: Evidence,
});
export type OpeningSchedule = z.infer<typeof OpeningSchedule>;

// ---------------------------------------------------------------- prezzi
export const PriceEstimate = z.object({
  id: z.string(),
  label: z.string(),
  currency: z.literal('CHF').default('CHF'),
  min: z.number().nonnegative().optional(),
  max: z.number().nonnegative().optional(),
  unit: z.enum(['person', 'group', 'free']),
  audience: z.enum(['all', 'adult', 'child', 'senior', 'student']).default('all'),
  childAgeMax: z.number().optional(),
  childFree: z.boolean().optional(),
  status: z.enum(['known', 'estimate', 'unknown']),
  optional: z.boolean().optional(),
  /** componente essenziale per l'attività (es. biglietto d'ingresso) */
  essential: z.boolean().default(true),
  validFrom: YMD.optional(),
  validTo: YMD.optional(),
  note: z.string().optional(),
  evidence: Evidence,
});
export type PriceEstimate = z.infer<typeof PriceEstimate>;

// ---------------------------------------------------------------- luoghi
export const Mood = z.enum(['chill', 'lively', 'romantic', 'cultural', 'nature', 'views', 'food', 'adventure']);
export type Mood = z.infer<typeof Mood>;
export const Occasion = z.enum(['friends', 'date', 'family', 'sightseeing', 'birthday', 'guests', 'leisure', 'custom']);
export type Occasion = z.infer<typeof Occasion>;

export const PlaceCategory = z.enum([
  'park', 'museum', 'culture', 'viewpoint', 'walk', 'lido', 'lift', 'restaurant', 'cafe', 'bar', 'nightlife',
  'market', 'show', 'workshop', 'seasonal', 'church', 'village', 'hike', 'playground', 'gelato', 'summit', 'attraction',
]);
export type PlaceCategory = z.infer<typeof PlaceCategory>;

export const Tristate = z.enum(['yes', 'limited', 'no', 'unknown']);

export const Place = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  category: PlaceCategory,
  osm: z.string().optional(),
  lon: z.number(),
  lat: z.number(),
  entrance: z.object({ lon: z.number(), lat: z.number(), source: z.enum(['osm_entrance', 'osm_feature', 'editorial', 'transit_stop']), note: z.string().optional() }),
  municipality: z.object({ name: z.string(), country: z.enum(['CH', 'IT', '?']) }),
  area: z.string().optional(),
  description: z.string(),
  tags: z.array(z.string()).default([]),
  moods: z.array(Mood).default([]),
  visit: z.object({ min: z.number(), typical: z.number(), max: z.number() }),
  schedules: z.array(OpeningSchedule).default([]),
  prices: z.array(PriceEstimate).default([]),
  booking: z.object({ required: z.enum(['yes', 'no', 'recommended', 'unknown']), url: z.string().optional(), note: z.string().optional() }),
  links: z.object({ website: z.string().optional(), phone: z.string().optional() }).default({}),
  accessibility: z.object({
    wheelchair: Tristate, stroller: Tristate, stairs: z.enum(['none', 'some', 'many', 'unknown']), note: z.string().optional(), evidence: Evidence,
  }),
  suitability: z.object({
    occasions: z.array(Occasion).default([]),
    minAge: z.number().optional(),
    weather: z.enum(['any', 'dry', 'indoor']).default('any'),
    indoor: z.boolean().default(false),
    /** caratteristica abituale documentata/curata — non è affluenza reale */
    habitualAtmosphere: z.enum(['usually_lively', 'usually_quiet', 'varies', 'unknown']).default('unknown'),
    noise: z.enum(['quiet', 'moderate', 'loud', 'unknown']).default('unknown'),
    alcohol: z.enum(['none', 'available', 'central']).default('none'),
  }),
  mountain: z.object({
    kind: z.enum(['summit', 'village', 'hike']),
    elevation: z.number().optional(),
    access: z.array(z.string()),
    returnNote: z.string().optional(),
    conditionsVerified: z.boolean().default(false),
  }).optional(),
  /** attività che richiede meal slot */
  meal: z.enum(['lunch', 'dinner', 'any', 'snack']).optional(),
  /** passeggiata-attività: si entra qui e si esce presso un altro luogo del catalogo */
  walkTo: z.string().optional(),
  /** 'events': pianificabile solo tramite un evento in programma */
  plannable: z.enum(['yes', 'events', 'no']).default('yes'),
  diet: z.array(z.string()).default([]),
  nearestStops: z.array(z.object({ id: z.string(), name: z.string(), distanceM: z.number(), modes: z.array(z.string()) })).default([]),
  sponsored: z.boolean().default(false),
  demo: z.boolean().default(false),
  evidence: z.array(Evidence).default([]),
  sources: z.array(z.string()).default([]),
  lastEditorialCheck: z.string().optional(),
});
export type Place = z.infer<typeof Place>;

// ---------------------------------------------------------------- eventi
export const EventStatus = z.enum(['scheduled', 'cancelled', 'postponed', 'sold_out']);
export const CatalogEvent = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string(),
  placeId: z.string(),
  description: z.string(),
  category: z.enum(['concert', 'market', 'show', 'festival', 'workshop', 'tour', 'sport', 'exhibition', 'cinema', 'party']),
  tags: z.array(z.string()).default([]),
  moods: z.array(Mood).default([]),
  prices: z.array(PriceEstimate).default([]),
  booking: z.object({ required: z.enum(['yes', 'no', 'recommended', 'unknown']), url: z.string().optional() }),
  recurrence: z.object({
    freq: z.literal('weekly'),
    byDay: z.array(z.number().int().min(1).max(7)).min(1),
    from: HHMM,
    to: HHMM.optional(),
    validFrom: YMD,
    validTo: YMD,
    exceptions: z.array(z.object({ date: YMD, status: EventStatus, note: z.string().optional(), movedTo: z.string().optional() })).default([]),
  }).optional(),
  sessions: z.array(z.object({
    id: z.string(),
    start: z.string(), // ISO con offset
    end: z.string().optional(),
    timeUncertain: z.boolean().optional(),
    status: EventStatus.default('scheduled'),
    label: z.string().optional(),
  })).default([]),
  suitability: z.object({ occasions: z.array(Occasion).default([]), minAge: z.number().optional(), indoor: z.boolean().default(false), noise: z.enum(['quiet', 'moderate', 'loud', 'unknown']).default('unknown'), alcohol: z.enum(['none', 'available', 'central']).default('none') }).default({ occasions: [], indoor: false, noise: 'unknown', alcohol: 'none' }),
  demo: z.boolean().default(false),
  evidence: z.array(Evidence).default([]),
});
export type CatalogEvent = z.infer<typeof CatalogEvent>;

export interface EventOccurrence {
  eventId: string;
  sessionId: string;
  placeId: string;
  title: string;
  start: string; // ISO con offset Europe/Zurich
  end: string | null;
  timeCertain: boolean;
  status: z.infer<typeof EventStatus>;
  origin: 'recurrence' | 'session';
  demo: boolean;
  note?: string;
}

// ---------------------------------------------------------------- richiesta
export const AvatarStyle = z.object({
  color: z.string(),
  accent: z.string(),
  hat: z.enum(['none', 'cap', 'beret', 'sunhat', 'beanie']).default('none'),
  accessory: z.enum(['none', 'backpack', 'camera', 'scarf', 'umbrella', 'balloon']).default('none'),
  hair: z.enum(['short', 'long', 'curly', 'bun', 'none']).default('short'),
  /** tono del volto scelto liberamente (palette stilizzata) */
  tone: z.string().default('#f0cfa8'),
});
export const Person = z.object({
  id: z.string(),
  name: z.string().max(24),
  kind: z.enum(['adult', 'child']),
  ageBand: z.enum(['0-5', '6-11', '12-15', '16-17', '18-25', '26-64', '65+']).optional(),
  avatar: AvatarStyle,
  interests: z.array(z.string()).default([]),
});
export type Person = z.infer<typeof Person>;

export const Location = z.object({
  kind: z.enum(['place', 'stop', 'point', 'address', 'geolocation']),
  label: z.string(),
  lon: z.number(),
  lat: z.number(),
  placeId: z.string().optional(),
  stopId: z.string().optional(),
  sensitive: z.boolean().optional(), // alloggio/posizione privata: non condividere
});
export type Location = z.infer<typeof Location>;

export const Avoid = z.enum(['nightclub', 'noisy', 'alcohol', 'climbs', 'expensive', 'crowds', 'already_done', 'boats', 'heights']);
export const Transport = z.object({ walk: z.literal(true).default(true), bus: z.boolean().default(true), train: z.boolean().default(true), boat: z.boolean().default(true), funicular: z.boolean().default(true) });

export const GroupRequest = z.object({
  people: z.array(Person).min(1).max(MAX_PEOPLE),
  date: YMD,
  startTime: HHMM,
  endTime: HHMM,
  start: Location,
  end: z.object({ mode: z.enum(['same', 'accommodation', 'station', 'custom', 'free']), location: Location.optional() }),
  occasion: Occasion,
  moods: z.array(Mood).default([]),
  budget: z.object({ amount: z.number().nonnegative().optional(), per: z.enum(['person', 'group']).default('person'), strict: z.boolean().default(false) }),
  pace: z.enum(['relaxed', 'balanced', 'intense']).default('balanced'),
  maxWalkKm: z.number().positive().optional(),
  maxAscentM: z.number().nonnegative().optional(),
  transport: Transport.default({ walk: true, bus: true, train: true, boat: true, funicular: true }),
  avoid: z.array(Avoid).default([]),
  mobility: z.object({ stroller: z.boolean().default(false), wheelchair: z.boolean().default(false), avoidStairs: z.boolean().default(false), frequentBreaks: z.boolean().default(false) }).default({ stroller: false, wheelchair: false, avoidStairs: false, frequentBreaks: false }),
  diet: z.array(z.enum(['vegetarian', 'vegan', 'gluten_free', 'lactose_free', 'halal', 'kosher'])).default([]),
  environment: z.enum(['indoor', 'outdoor', 'any']).default('any'),
  rainTolerance: z.enum(['low', 'medium', 'high']).default('medium'),
  mustSee: z.array(z.string()).default([]),
  locked: z.array(z.object({ placeId: z.string().optional(), eventId: z.string().optional(), start: HHMM, end: HHMM, note: z.string().optional() })).default([]),
  passes: z.array(z.enum(['ga', 'half_fare', 'arcobaleno', 'ticino_ticket', 'lugano_card'])).default([]),
  exclude: z.array(z.string()).default([]),
  freeText: z.string().max(1000).optional(),
  /** risoluzioni esplicite dell'utente a contraddizioni col testo libero */
  resolutions: z.record(z.string(), z.string()).default({}),
  locale: z.enum(['it', 'en', 'de']).default('it'),
  surprise: z.boolean().default(false),
});
export type GroupRequest = z.infer<typeof GroupRequest>;

// ---------------------------------------------------------------- piano
export type LegMode = 'walk' | 'hike' | 'bus' | 'train' | 'funicular' | 'boat' | 'cable_car' | 'wait';
export type Freshness = 'static_timetable' | 'computed' | 'demo' | 'realtime' | 'estimate';

export interface LegPoint { label: string; lon: number; lat: number; placeId?: string; stopId?: string }
export interface TransitInfo {
  routeShort: string;
  routeLong?: string;
  agency: string;
  headsign: string;
  tripId: string;
  frequencyBased: boolean;
  stops: { name: string; time: string; lon: number; lat: number }[];
  mode: 'bus' | 'train' | 'funicular' | 'boat' | 'cable_car';
}
export interface RouteLeg {
  id: string;
  mode: LegMode;
  from: LegPoint;
  to: LegPoint;
  departure: string; // ISO
  arrival: string;   // ISO
  durationMin: number;
  distanceM: number;
  ascentM?: number;
  descentM?: number;
  geometry: [number, number][];
  /** tratti della geometria (per disegnare a piedi/mezzo diversi) */
  parts?: { mode: LegMode; from: number; to: number }[];
  flags: { stairs: boolean; trail: boolean; unpaved: boolean; noSidewalkInfo: boolean; steep: boolean; strollerOk: 'yes' | 'no' | 'unknown' };
  transit?: TransitInfo[];
  streets?: string[];
  source: { id: string; label: string; freshness: Freshness; feedVersion?: string };
  cost?: CostLine[];
  notes: string[];
}

export interface CostLine {
  id: string;
  label: string;
  /** CHF totali per il gruppo */
  min: number | null;
  max: number | null;
  status: 'known' | 'estimate' | 'unknown';
  essential: boolean;
  perPerson?: boolean;
  note?: string;
  evidenceStatus?: VerificationStatus;
  /** istante in cui la spesa matura nella simulazione (non è un addebito reale) */
  at: string;
}

export interface CheckResult { id: string; label: string; status: 'ok' | 'uncertain' | 'violated'; detail: string }

/** Spostamento fra due tappe: una o più tratte a modalità singola, contigue nel tempo. */
export interface Trip {
  id: string;
  /** -1 = partenza del gruppo */
  fromStop: number;
  /** indice della tappa di arrivo; = stops.length per il rientro */
  toStop: number;
  from: LegPoint;
  to: LegPoint;
  departure: string;
  arrival: string;
  legs: RouteLeg[];
  summary: { mainMode: LegMode; durationMin: number; walkM: number; ascentM: number; descentM: number; rides: number; label: string };
  cost: CostLine[];
  notes: string[];
  /** alternative considerate (per spiegare la scelta) */
  alternatives?: { mode: string; durationMin: number; walkM: number }[];
}

export interface PlanStop {
  id: string;
  kind: 'place' | 'event' | 'pause';
  placeId: string;
  eventId?: string;
  occurrenceStart?: string;
  name: string;
  arrival: string;
  start: string;
  end: string;
  departure: string;
  stayMin: number;
  locked: boolean;
  mandatory: boolean;
  cost: CostLine[];
  checks: CheckResult[];
  reasons: string[];
  lon: number;
  lat: number;
  /** punto di uscita se diverso dall'ingresso (passeggiate-attività) */
  exit?: LegPoint;
  /** percorso svolto durante l'attività (passeggiate) */
  activityPath?: { coords: [number, number][]; lengthM: number; upM: number; downM: number; mode: LegMode };
  category: string;
  /** stato dei dati del luogo al momento del calcolo */
  dataQuality: 'verified' | 'osm' | 'editorial' | 'estimate' | 'unknown' | 'demo';
}

export interface DecisionOption {
  id: string;
  label: string;
  detail: string;
  /** piano completo se si sceglie questa opzione; null = si prosegue col piano attuale */
  plan: Plan | null;
  valid: boolean;
  reason?: string;
  diff?: PlanDiff;
}
export interface DecisionPoint {
  id: string;
  /** indice della tappa al termine della quale si decide */
  afterStop: number;
  at: string;
  prompt: string;
  mandatory: boolean;
  options: DecisionOption[];
  chosen?: string;
}

export interface Totals {
  startsAt: string;
  endsAt: string;
  durationMin: number;
  walkM: number;
  ascentM: number;
  descentM: number;
  transitRides: number;
  cost: { min: number; max: number; perPersonMin: number; perPersonMax: number; unknownEssential: number; unknownOptional: number; status: 'within' | 'over' | 'unverifiable' | 'no_budget' };
}

export interface NarrativeLine { at: string; speaker: string; text: string; stopId?: string }

export interface Plan {
  id: string;
  version: number;
  branchId: string;
  parentPlanId?: string;
  createdAt: string;
  title: string;
  theme: string;
  summary: string;
  request: GroupRequest;
  stops: PlanStop[];
  /** trips[i] porta a stops[i]; l'ultimo porta al punto finale */
  trips: Trip[];
  end: LegPoint;
  totals: Totals;
  checks: CheckResult[];
  feasibility: 'valid' | 'uncertain' | 'invalid';
  tradeoffs: string[];
  missing: string[];
  whyThis: string[];
  decisions: DecisionPoint[];
  narrative: { lines: NarrativeLine[]; source: 'ai' | 'deterministic' };
  plannerSource: 'ai-live' | 'deterministic';
  aiNote?: string;
  snapshot: DataSnapshot;
  hypothetical?: string[];
}

export interface DataSnapshot {
  catalogVersion: string;
  transitFeed: string;
  computedAt: string;
  weather?: WeatherSnapshot | null;
  places: Record<string, { name: string; schedules: OpeningSchedule[]; prices: PriceEstimate[]; evidence: Evidence[] }>;
  demo: boolean;
}

export interface WeatherSnapshot {
  source: string;
  status: 'live' | 'demo' | 'unavailable' | 'out_of_horizon';
  fetchedAt: string;
  horizonDays: number;
  hours: { time: string; tempC: number | null; precipMm: number | null; precipProb: number | null; code: number | null }[];
  summary?: string;
  note?: string;
}

// ---------------------------------------------------------------- decisioni e rami
export const DecisionKind = z.enum([
  'extend', 'skip', 'replace', 'reduce_budget', 'less_walking', 'add_pause', 'indoor', 'change_return', 'lock',
  'whatif_missed_bus', 'whatif_rain', 'whatif_unavailable', 'whatif_stay_30', 'choice',
]);
export type DecisionKind = z.infer<typeof DecisionKind>;
export const Decision = z.object({
  kind: DecisionKind,
  atTime: z.string(),
  stopId: z.string().optional(),
  minutes: z.number().optional(),
  placeId: z.string().optional(),
  budget: z.number().optional(),
  endTime: z.string().optional(),
  endLocation: Location.optional(),
  decisionId: z.string().optional(),
  optionId: z.string().optional(),
  hypothetical: z.boolean().default(false),
});
export type Decision = z.infer<typeof Decision>;

export interface Branch {
  id: string;
  parentId: string | null;
  label: string;
  decision: Decision | null;
  forkTime: string | null;
  plan: Plan;
  createdAt: string;
}

export interface PlanDiff {
  endTimeDeltaMin: number;
  costDeltaMin: number;
  costDeltaMax: number;
  walkDeltaM: number;
  ascentDeltaM: number;
  added: string[];
  removed: string[];
  moved: { name: string; fromTime: string; toTime: string }[];
  returnChange?: string;
  lostConnections: string[];
  notes: string[];
}

export interface InfeasibleResult {
  reasons: { code: string; message: string }[];
  suggestions: { id: string; label: string; patch: Partial<GroupRequest> }[];
}

export interface Contradiction {
  id: string;
  field: 'budget' | 'endTime' | 'startTime' | 'people' | 'avoid' | 'moods' | 'mobility';
  structured: string;
  fromText: string;
  message: string;
  options: { id: string; label: string }[];
}
