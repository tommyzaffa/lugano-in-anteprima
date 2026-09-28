/**
 * Interpretazione deterministica del testo libero («C'è altro che vuoi dirci?»).
 * Estrae preferenze morbide e rileva contraddizioni con i campi strutturati.
 * Non riscrive mai di nascosto budget, orari o gruppo: le contraddizioni vengono
 * restituite all'interfaccia che chiede di risolvere solo quelle.
 * Il testo è un dato dell'utente, non un'istruzione per il sistema.
 */
import type { GroupRequest, Contradiction, Mood } from '../../shared/types.ts';

export interface TextHints {
  moods: Mood[];
  avoid: string[];
  indoor: boolean | null;
  cheap: boolean;
  diet: string[];
  mentionedPlaces: string[];
  budgetFromText?: { amount: number; per: 'person' | 'group' };
  endFromText?: string;
  startFromText?: string;
  peopleFromText?: number;
  kidsMentioned: boolean;
  strollerMentioned: boolean;
  wheelchairMentioned: boolean;
  noStairsMentioned: boolean;
  understood: string[];
}

const MOOD_WORDS: [RegExp, Mood][] = [
  [/romantic|anniversari|tramont|lume di candela|san valentino/i, 'romantic'],
  [/tramont|panoram|vista|belvedere|in alto|vetta/i, 'views'],
  [/museo|musei|arte|mostra|cultur|storia|architettur|teatro|concerto/i, 'cultural'],
  [/natura|bosco|verde|sentier|escursion|passeggiata nel|camminata|lago/i, 'nature'],
  [/mangiar|cena|pranzo|aperitiv|gelato|grotto|cucina|degust|ristorant|vino/i, 'food'],
  [/avventur|adrenalin|sport|salita|scalata|esplorar/i, 'adventure'],
  [/tranquill|rilass|chill|calm|pigr|slow|con calma/i, 'chill'],
  [/vivac|movimentat|festa|gente|serata|ballare|musica dal vivo|animat/i, 'lively'],
];

function num(s: string): number { return Number(s.replace(',', '.')); }
function hhmm(h: string, m?: string): string { return `${String(Number(h)).padStart(2, '0')}:${(m ?? '00').padStart(2, '0')}`; }

export function parseFreeText(text: string | undefined, placeNames: { id: string; name: string; aliases?: string[] }[]): TextHints {
  const h: TextHints = { moods: [], avoid: [], indoor: null, cheap: false, diet: [], mentionedPlaces: [], kidsMentioned: false, strollerMentioned: false, wheelchairMentioned: false, noStairsMentioned: false, understood: [] };
  if (!text) return h;
  const t = text.toLowerCase();
  for (const [re, m] of MOOD_WORDS) if (re.test(t) && !h.moods.includes(m)) h.moods.push(m);
  if (/(niente|senza|no|evit\w*)\s+(alcol|alcool|bere)|astemi|non beviamo/.test(t)) h.avoid.push('alcohol');
  if (/(niente|senza|no|evit\w*)\s+(discotec|disco\b|club)/.test(t)) h.avoid.push('nightclub');
  if (/(niente|senza|no|evit\w*)\s+(rumor|casin|confusion|folla|ressa)|posti tranquilli/.test(t)) { h.avoid.push('noisy'); h.avoid.push('crowds'); }
  if (/(niente|senza|no|evit\w*|odi\w*)\s+(salit|scal|dislivell)|non (?:riesco|possiamo) (?:a )?(?:fare )?(?:le )?scale/.test(t)) { h.avoid.push('climbs'); h.noStairsMentioned = true; }
  if (/(niente|senza|no|evit\w*)\s+(battell|barca)|mal di mare/.test(t)) h.avoid.push('boats');
  if (/vertigin|paura dell'altezza/.test(t)) h.avoid.push('heights');
  if (/pioggia|piove|al coperto|dentro|indoor/.test(t)) h.indoor = true;
  if (/all'aperto|fuori|aria aperta|outdoor/.test(t) && h.indoor == null) h.indoor = false;
  if (/economic|spendere poco|low cost|gratis|gratuit|risparmi|budget (?:ridotto|basso)/.test(t)) h.cheap = true;
  if (/vegetarian/.test(t)) h.diet.push('vegetarian');
  if (/vegan/.test(t)) h.diet.push('vegan');
  if (/celiac|senza glutine|gluten/.test(t)) h.diet.push('gluten_free');
  if (/bambin|figli|bimb|piccol[io]\b|ragazzini/.test(t)) h.kidsMentioned = true;
  if (/passeggin|carrozzin/.test(t)) h.strollerMentioned = true;
  if (/sedia a rotelle|carrozzina per disabil|disabilit|deambulazion/.test(t)) h.wheelchairMentioned = true;

  // budget: "massimo 40 franchi a testa", "budget 120 in tutto", "chf 50 a persona"
  const b = t.match(/(?:budget|massimo|max|non più di|spendere|entro)\s*(?:di\s*)?(?:chf|fr\.?|franchi)?\s*(\d+(?:[.,]\d+)?)\s*(?:chf|fr\.?|franchi)?\s*(a testa|a persona|per persona|ciascuno|in tutto|in totale|complessiv\w*|per il gruppo)?/);
  if (b) {
    const per = b[2] && /tutto|totale|complessiv|gruppo/.test(b[2]) ? 'group' : b[2] ? 'person' : 'person';
    h.budgetFromText = { amount: num(b[1]), per };
  }
  const end = t.match(/(?:entro|fino alle|rientr\w* (?:per|alle|entro)|a casa (?:per|alle|entro)|finire alle|termin\w* alle)\s*(?:le\s*)?(\d{1,2})(?:[:.](\d{2}))?/);
  if (end && Number(end[1]) <= 24) h.endFromText = hhmm(end[1] === '24' ? '0' : end[1], end[2]);
  const start = t.match(/(?:partiamo|partenza|dalle|inizi\w*|a partire dalle)\s*(?:alle\s*)?(\d{1,2})(?:[:.](\d{2}))?/);
  if (start && Number(start[1]) < 24) h.startFromText = hhmm(start[1], start[2]);
  const ppl = t.match(/siamo (?:in )?(\d{1,2})\b|(\d{1,2}) persone|gruppo di (\d{1,2})/);
  if (ppl) h.peopleFromText = Number(ppl[1] ?? ppl[2] ?? ppl[3]);
  for (const p of placeNames) {
    const names = [p.name, ...(p.aliases ?? [])].map((n) => n.toLowerCase().replace(/\s*\(.*?\)\s*/g, '').trim()).filter((n) => n.length >= 4);
    if (names.some((n) => t.includes(n))) h.mentionedPlaces.push(p.id);
  }
  if (h.moods.length) h.understood.push(`Atmosfera: ${h.moods.join(', ')}`);
  if (h.avoid.length) h.understood.push(`Da evitare: ${[...new Set(h.avoid)].join(', ')}`);
  if (h.mentionedPlaces.length) h.understood.push(`Luoghi citati: ${h.mentionedPlaces.length}`);
  if (h.indoor) h.understood.push('Preferenza per attività al coperto');
  if (h.cheap) h.understood.push('Attenzione alla spesa');
  if (h.diet.length) h.understood.push(`Alimentazione: ${h.diet.join(', ')} (le informazioni sui locali non sono verificate)`);
  h.avoid = [...new Set(h.avoid)];
  return h;
}

/** Contraddizioni fra testo e campi strutturati. Ciascuna va risolta esplicitamente. */
export function findContradictions(req: GroupRequest, h: TextHints): Contradiction[] {
  const out: Contradiction[] = [];
  const keep = { id: 'keep_form', label: 'Tieni il valore del modulo' };
  if (h.budgetFromText) {
    const b = req.budget;
    const same = b.amount != null && Math.abs(b.amount - h.budgetFromText.amount) < 0.01 && b.per === h.budgetFromText.per;
    if (b.amount != null && !same) {
      out.push({
        id: 'budget', field: 'budget',
        structured: `CHF ${b.amount} ${b.per === 'person' ? 'a persona' : 'in totale'}`,
        fromText: `CHF ${h.budgetFromText.amount} ${h.budgetFromText.per === 'person' ? 'a persona' : 'in totale'}`,
        message: 'Il budget scritto nel testo è diverso da quello del modulo.',
        options: [keep, { id: 'use_text', label: 'Usa il valore del testo' }],
      });
    }
  }
  if (h.endFromText && h.endFromText !== req.endTime) {
    out.push({ id: 'endTime', field: 'endTime', structured: req.endTime, fromText: h.endFromText, message: "L'orario di fine nel testo è diverso da quello del modulo.", options: [keep, { id: 'use_text', label: "Usa l'orario del testo" }] });
  }
  if (h.startFromText && h.startFromText !== req.startTime) {
    out.push({ id: 'startTime', field: 'startTime', structured: req.startTime, fromText: h.startFromText, message: "L'orario di partenza nel testo è diverso da quello del modulo.", options: [keep, { id: 'use_text', label: "Usa l'orario del testo" }] });
  }
  if (h.peopleFromText && h.peopleFromText !== req.people.length) {
    out.push({ id: 'people', field: 'people', structured: `${req.people.length} persone`, fromText: `${h.peopleFromText} persone`, message: 'Il numero di persone nel testo è diverso da quello del modulo.', options: [keep, { id: 'edit_group', label: 'Torno a modificare il gruppo' }] });
  }
  if (h.kidsMentioned && !req.people.some((p) => p.kind === 'child')) {
    out.push({ id: 'kids', field: 'people', structured: 'nessun bambino nel gruppo', fromText: 'il testo cita bambini', message: 'Il testo parla di bambini ma il gruppo è composto solo da adulti.', options: [keep, { id: 'edit_group', label: 'Torno a modificare il gruppo' }] });
  }
  if (h.strollerMentioned && !req.mobility.stroller) {
    out.push({ id: 'stroller', field: 'mobility', structured: 'passeggino non indicato', fromText: 'il testo cita un passeggino', message: 'Il testo cita un passeggino ma l\'opzione non è attiva.', options: [keep, { id: 'use_text', label: 'Attiva «con passeggino»' }] });
  }
  if (h.wheelchairMentioned && !req.mobility.wheelchair) {
    out.push({ id: 'wheelchair', field: 'mobility', structured: 'sedia a rotelle non indicata', fromText: 'il testo cita esigenze di mobilità', message: 'Il testo cita esigenze di mobilità non indicate nel modulo.', options: [keep, { id: 'use_text', label: 'Attiva «sedia a rotelle»' }] });
  }
  if (h.avoid.includes('nightclub') && req.moods.includes('lively') && req.avoid.length === 0) {
    // non è una contraddizione: vivace ma senza discoteca è una combinazione valida
  }
  return out.filter((c) => !req.resolutions[c.id]);
}

/** Applica le risoluzioni scelte esplicitamente dall'utente. */
export function applyResolutions(req: GroupRequest, h: TextHints): GroupRequest {
  const r = structuredClone(req);
  for (const [id, choice] of Object.entries(req.resolutions)) {
    if (choice !== 'use_text') continue;
    if (id === 'budget' && h.budgetFromText) r.budget = { ...r.budget, amount: h.budgetFromText.amount, per: h.budgetFromText.per };
    if (id === 'endTime' && h.endFromText) r.endTime = h.endFromText;
    if (id === 'startTime' && h.startFromText) r.startTime = h.startFromText;
    if (id === 'stroller') r.mobility.stroller = true;
    if (id === 'wheelchair') r.mobility.wheelchair = true;
  }
  return r;
}
