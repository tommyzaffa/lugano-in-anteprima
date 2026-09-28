import { useEffect, useMemo, useState } from 'react';
import { useApp, makePerson, defaultDraft, type Draft } from '../store.ts';
import { MOODS, MOOD_ICON, OCCASIONS, AVOID, PACE, AGE_BANDS } from '../i18n.ts';
import { Chip, Field, Badge } from './common.tsx';
import LocationPicker from './LocationPicker.tsx';
import { avatarSvg, CLOTHES, TONES, HATS, ACCESSORIES, HAIRS } from '../map/avatars.ts';
import { get } from '../api.ts';
import { runPlanning } from './planning-actions.ts';
import type { Person } from '../../shared/types.ts';

const STEPS = ['Chi siete', 'Quando e dove', 'Cosa vi piace', 'Budget e ritmo', 'Esigenze', 'Riepilogo'];
const INTERESTS = ['arte', 'storia', 'natura', 'lago', 'vista', 'musica', 'cucina', 'vino', 'bambini', 'sport', 'architettura', 'letteratura', 'foto'];

export default function Wizard() {
  const draft = useApp((s) => s.draft);
  const meta = useApp((s) => s.meta);
  const step = useApp((s) => s.wizardStep);
  const set = useApp((s) => s.set);
  useEffect(() => { if (!draft && meta) useApp.setState({ draft: defaultDraft(meta.today) }); }, [draft, meta]);
  if (!draft) return null;
  const go = (n: number) => { set({ wizardStep: Math.max(0, Math.min(STEPS.length - 1, n)) }); document.getElementById('panel')?.scrollTo({ top: 0 }); };
  return (
    <div className="wizard">
      <nav className="steps" aria-label="Passaggi del modulo">
        {STEPS.map((s, i) => (
          <button key={s} className={`step ${i === step ? 'current' : ''} ${i < step ? 'done' : ''}`} onClick={() => go(i)} aria-current={i === step ? 'step' : undefined}>
            <span className="step-n">{i + 1}</span><span className="step-l">{s}</span>
          </button>
        ))}
      </nav>
      <h2 className="wizard-title">{STEPS[step]}</h2>
      {step === 0 && <StepGroup />}
      {step === 1 && <StepWhen />}
      {step === 2 && <StepLikes />}
      {step === 3 && <StepBudget />}
      {step === 4 && <StepNeeds />}
      {step === 5 && <StepReview />}
      <div className="wizard-nav">
        {step > 0 ? <button className="btn-ghost" onClick={() => go(step - 1)}>Indietro</button> : <button className="btn-ghost" onClick={() => set({ view: 'home' })}>Annulla</button>}
        {step < STEPS.length - 1 ? (
          <div className="wizard-nav-right">
            {step >= 1 ? <button className="btn-ghost" onClick={() => go(STEPS.length - 1)}>Salta al riepilogo</button> : null}
            <button className="btn" onClick={() => go(step + 1)}>Avanti</button>
          </div>
        ) : (
          <div className="wizard-nav-right">
            <button className="btn-ghost" onClick={() => runPlanning(true)} title="Una combinazione a sorpresa entro i vostri vincoli">Sorprendimi</button>
            <button className="btn primary" onClick={() => runPlanning(false)}>Proponi programmi</button>
          </div>
        )}
      </div>
    </div>
  );
}

function useDraft(): [Draft, (f: (d: Draft) => Draft) => void] {
  const draft = useApp((s) => s.draft)!;
  const setDraft = useApp((s) => s.setDraft);
  return [draft, setDraft];
}

function StepGroup() {
  const [d, setD] = useDraft();
  const max = useApp((s) => s.meta?.maxPeople ?? 12);
  const [editing, setEditing] = useState<string | null>(null);
  const [overflow, setOverflow] = useState(false);
  const setCount = (n: number) => {
    if (n > max) { setOverflow(true); return; }
    setOverflow(false);
    setD((x) => {
      const people = [...x.people];
      while (people.length < n) people.push(makePerson(people.length));
      while (people.length > n) people.pop();
      return { ...x, people };
    });
  };
  const upd = (id: string, p: Partial<Person>) => setD((x) => ({ ...x, people: x.people.map((q) => (q.id === id ? { ...q, ...p } : q)) }));
  return (
    <div>
      <Field label="Quante persone?" hint={`Da 1 a ${max}: ogni persona avrà il suo personaggio sulla mappa.`} htmlFor="ppl">
        <div className="stepper">
          <button type="button" onClick={() => setCount(d.people.length - 1)} disabled={d.people.length <= 1} aria-label="Una persona in meno">−</button>
          <input id="ppl" type="number" min={1} max={max + 5} value={d.people.length} onChange={(e) => setCount(Math.max(1, Number(e.target.value) || 1))} />
          <button type="button" onClick={() => setCount(d.people.length + 1)} aria-label="Una persona in più">+</button>
        </div>
      </Field>
      {overflow ? <div className="notice warn" role="alert">Questa prima versione gestisce gruppi fino a {max} persone, un personaggio per ciascuna. Per gruppi più numerosi potete preparare due programmi paralleli (per esempio {Math.ceil((max + 1) / 2)} + {Math.floor((max + 1) / 2)}).</div> : null}
      <div className="people">
        {d.people.map((p, i) => (
          <div key={p.id} className="person">
            <button type="button" className="person-avatar" onClick={() => setEditing(editing === p.id ? null : p.id)} aria-label={`Personalizza ${p.name}`} dangerouslySetInnerHTML={{ __html: avatarSvg(p, 46) }} />
            <div className="person-main">
              <input aria-label={`Nome persona ${i + 1}`} value={p.name} maxLength={24} onChange={(e) => upd(p.id, { name: e.target.value || `Persona ${i + 1}` })} />
              <div className="seg">
                <button type="button" className={p.kind === 'adult' ? 'on' : ''} onClick={() => upd(p.id, { kind: 'adult', ageBand: undefined })}>Adulto</button>
                <button type="button" className={p.kind === 'child' ? 'on' : ''} onClick={() => upd(p.id, { kind: 'child', ageBand: p.ageBand ?? '6-11' })}>Bambino</button>
              </div>
              {p.kind === 'child' ? (
                <select aria-label="Fascia d'età" value={p.ageBand ?? '6-11'} onChange={(e) => upd(p.id, { ageBand: e.target.value as any })}>
                  {AGE_BANDS.map((b) => <option key={b} value={b}>{b} anni</option>)}
                </select>
              ) : null}
            </div>
            {editing === p.id ? <AvatarEditor p={p} onChange={(av) => upd(p.id, { avatar: { ...p.avatar, ...av } })} onInterests={(it) => upd(p.id, { interests: it })} /> : null}
          </div>
        ))}
      </div>
      <p className="hint">L'età serve solo per prezzi e compatibilità (per esempio età minime). Le differenze fra personaggi derivano dalle vostre scelte, non da età o genere.</p>
      <Field label="Occasione">
        <div className="chips">{Object.entries(OCCASIONS).map(([k, v]) => <Chip key={k} on={d.occasion === k} onClick={() => setD((x) => ({ ...x, occasion: k as any }))}>{v}</Chip>)}</div>
      </Field>
    </div>
  );
}

function AvatarEditor({ p, onChange, onInterests }: { p: Person; onChange: (a: Partial<Person['avatar']>) => void; onInterests: (i: string[]) => void }) {
  return (
    <div className="avatar-editor">
      <div className="ae-row"><span>Abiti</span>{CLOTHES.map((c) => <button key={c} type="button" className={`swatch ${p.avatar.color === c ? 'on' : ''}`} style={{ background: c }} onClick={() => onChange({ color: c })} aria-label={`Colore ${c}`} />)}</div>
      <div className="ae-row"><span>Dettagli</span>{CLOTHES.map((c) => <button key={c} type="button" className={`swatch ${p.avatar.accent === c ? 'on' : ''}`} style={{ background: c }} onClick={() => onChange({ accent: c })} aria-label={`Colore accessori ${c}`} />)}</div>
      <div className="ae-row"><span>Tono</span>{TONES.map((c) => <button key={c} type="button" className={`swatch ${p.avatar.tone === c ? 'on' : ''}`} style={{ background: c }} onClick={() => onChange({ tone: c })} aria-label={`Tono ${c}`} />)}</div>
      <div className="ae-row"><span>Cappello</span><select value={p.avatar.hat} onChange={(e) => onChange({ hat: e.target.value as any })}>{HATS.map((h) => <option key={h} value={h}>{({ none: 'nessuno', cap: 'berretto', beret: 'basco', sunhat: 'cappello di paglia', beanie: 'cuffia' } as any)[h]}</option>)}</select></div>
      <div className="ae-row"><span>Accessorio</span><select value={p.avatar.accessory} onChange={(e) => onChange({ accessory: e.target.value as any })}>{ACCESSORIES.map((h) => <option key={h} value={h}>{({ none: 'nessuno', backpack: 'zaino', camera: 'macchina fotografica', scarf: 'sciarpa', umbrella: 'ombrello', balloon: 'palloncino' } as any)[h]}</option>)}</select></div>
      <div className="ae-row"><span>Capelli</span><select value={p.avatar.hair} onChange={(e) => onChange({ hair: e.target.value as any })}>{HAIRS.map((h) => <option key={h} value={h}>{({ short: 'corti', long: 'lunghi', curly: 'ricci', bun: 'raccolti', none: 'nessuno' } as any)[h]}</option>)}</select></div>
      <div className="ae-row wrap"><span>Interessi (facoltativi)</span><div className="chips">{INTERESTS.map((it) => <Chip key={it} on={p.interests.includes(it)} onClick={() => onInterests(p.interests.includes(it) ? p.interests.filter((x) => x !== it) : [...p.interests, it])}>{it}</Chip>)}</div></div>
    </div>
  );
}

function StepWhen() {
  const [d, setD] = useDraft();
  const meta = useApp((s) => s.meta);
  const crosses = d.endTime <= d.startTime;
  const outOfFeed = meta && (d.date.replace(/-/g, '') < meta.transit.range.start || d.date.replace(/-/g, '') > meta.transit.range.end);
  return (
    <div>
      <div className="grid3">
        <Field label="Data" htmlFor="date"><input id="date" type="date" value={d.date} min={meta?.today} onChange={(e) => setD((x) => ({ ...x, date: e.target.value }))} /></Field>
        <Field label="Partenza" htmlFor="st"><input id="st" type="time" value={d.startTime} onChange={(e) => setD((x) => ({ ...x, startTime: e.target.value }))} /></Field>
        <Field label="Fine" htmlFor="et"><input id="et" type="time" value={d.endTime} onChange={(e) => setD((x) => ({ ...x, endTime: e.target.value }))} /></Field>
      </div>
      {crosses ? <div className="notice">La fine è il giorno successivo, alle {d.endTime}.</div> : null}
      {outOfFeed ? <div className="notice warn">La data è fuori dal periodo dell'orario ufficiale importato ({meta!.transit.range.start}–{meta!.transit.range.end}): i mezzi pubblici non saranno calcolabili.</div> : null}
      <Field label="Da dove partite?" htmlFor="start-loc">
        <LocationPicker id="start-loc" value={d.start} onChange={(l) => setD((x) => ({ ...x, start: l }))} />
      </Field>
      <Field label="Dove volete terminare?">
        <div className="chips">
          {([['same', 'Stesso punto'], ['station', 'Stazione'], ['accommodation', 'Alloggio'], ['custom', 'Altro punto'], ['free', 'Punto libero']] as const).map(([k, v]) => (
            <Chip key={k} on={d.end.mode === k} onClick={() => setD((x) => ({ ...x, end: { mode: k, location: k === 'station' ? { ...(meta?.quickStarts?.[0] ?? x.start), kind: 'stop' } : k === 'same' || k === 'free' ? undefined : x.end.location } }))}>{v}</Chip>
          ))}
        </div>
      </Field>
      {d.end.mode === 'accommodation' || d.end.mode === 'custom' ? (
        <Field label={d.end.mode === 'accommodation' ? 'Alloggio (non verrà mai condiviso)' : 'Punto di arrivo'} htmlFor="end-loc">
          <LocationPicker id="end-loc" value={d.end.location} onChange={(l) => setD((x) => ({ ...x, end: { ...x.end, location: { ...l, sensitive: d.end.mode === 'accommodation' || l.sensitive } } }))} />
        </Field>
      ) : null}
      {d.end.mode === 'free' ? <p className="hint">Con punto libero il programma termina all'ultima tappa: il rientro non viene verificato.</p> : null}
    </div>
  );
}

function StepLikes() {
  const [d, setD] = useDraft();
  const toggle = <K extends 'moods' | 'avoid'>(k: K, v: string) => setD((x) => ({ ...x, [k]: (x[k] as string[]).includes(v) ? (x[k] as string[]).filter((y) => y !== v) : [...(x[k] as string[]), v] }));
  return (
    <div>
      <Field label="Atmosfera" hint="Scegliete quelle che vi descrivono, anche più d'una.">
        <div className="chips">{Object.entries(MOODS).map(([k, v]) => <Chip key={k} icon={MOOD_ICON[k]} on={d.moods.includes(k as any)} onClick={() => toggle('moods', k)}>{v}</Chip>)}</div>
      </Field>
      <Field label="Cosa evitare">
        <div className="chips">{Object.entries(AVOID).map(([k, v]) => <Chip key={k} on={d.avoid.includes(k as any)} onClick={() => toggle('avoid', k)} title={k === 'already_done' ? 'Esclude i luoghi segnati come «Già visitato» nelle schede' : undefined}>{v}</Chip>)}</div>
      </Field>
      <Field label="Dentro o fuori?">
        <div className="seg">
          {([['any', 'Indifferente'], ['outdoor', 'All\'aperto'], ['indoor', 'Al coperto']] as const).map(([k, v]) => <button type="button" key={k} className={d.environment === k ? 'on' : ''} onClick={() => setD((x) => ({ ...x, environment: k }))}>{v}</button>)}
        </div>
      </Field>
      <PlacesMulti label="Tappe da non perdere (facoltative)" value={d.mustSee} labels={d.mustSeeLabels} onChange={(v) => setD((x) => ({ ...x, mustSee: v }))} hint="Diventano vincoli rigidi: se non sono compatibili, il sistema spiega perché." />
      <PlacesMulti label="Luoghi già visti o da escludere" value={d.exclude} onChange={(v) => setD((x) => ({ ...x, exclude: v }))} />
    </div>
  );
}

function PlacesMulti({ label, value, onChange, hint, labels }: { label: string; value: string[]; onChange: (v: string[]) => void; hint?: string; labels?: Record<string, string> }) {
  const [all, setAll] = useState<{ id: string; name: string; category: string }[]>([]);
  const [q, setQ] = useState('');
  useEffect(() => { get<{ places: any[] }>('/api/places').then((r) => setAll(r.places)).catch(() => {}); }, []);
  const matches = useMemo(() => (q.length >= 2 ? all.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()) && !value.includes(p.id)).slice(0, 8) : []), [q, all, value]);
  return (
    <Field label={label} hint={hint}>
      <div className="chips">{value.map((id) => <Chip key={id} on onClick={() => onChange(value.filter((x) => x !== id))} title="Rimuovi">{all.find((p) => p.id === id)?.name ?? labels?.[id] ?? id} ✕</Chip>)}</div>
      <input type="search" placeholder="Cerca nel catalogo…" value={q} onChange={(e) => setQ(e.target.value)} aria-label={label} />
      {matches.length ? <ul className="loc-results inline">{matches.map((m) => <li key={m.id}><button type="button" onClick={() => { onChange([...value, m.id]); setQ(''); }}><strong>{m.name}</strong></button></li>)}</ul> : null}
    </Field>
  );
}

function StepBudget() {
  const [d, setD] = useDraft();
  return (
    <div>
      <Field label="Budget (CHF)" hint="Lasciate vuoto se non avete un tetto. I costi sconosciuti non vengono mai contati come zero." htmlFor="bud">
        <div className="row">
          <input id="bud" type="number" min={0} step={5} placeholder="es. 50" value={d.budget.amount ?? ''} onChange={(e) => setD((x) => ({ ...x, budget: { ...x.budget, amount: e.target.value === '' ? undefined : Math.max(0, Number(e.target.value)) } }))} />
          <div className="seg">
            <button type="button" className={d.budget.per === 'person' ? 'on' : ''} onClick={() => setD((x) => ({ ...x, budget: { ...x.budget, per: 'person' } }))}>a persona</button>
            <button type="button" className={d.budget.per === 'group' ? 'on' : ''} onClick={() => setD((x) => ({ ...x, budget: { ...x.budget, per: 'group' } }))}>in totale</button>
          </div>
        </div>
        <label className="check"><input type="checkbox" checked={d.budget.strict} onChange={(e) => setD((x) => ({ ...x, budget: { ...x.budget, strict: e.target.checked } }))} /> Limite rigido (non superabile)</label>
      </Field>
      <Field label="Ritmo">
        <div className="seg">{Object.entries(PACE).map(([k, v]) => <button type="button" key={k} className={d.pace === k ? 'on' : ''} onClick={() => setD((x) => ({ ...x, pace: k as any }))}>{v}</button>)}</div>
      </Field>
      <details className="advanced">
        <summary>Limiti di cammino e dislivello</summary>
        <div className="grid2">
          <Field label="Cammino massimo (km)" htmlFor="mw"><input id="mw" type="number" min={0.5} step={0.5} value={d.maxWalkKm ?? ''} placeholder="nessun limite" onChange={(e) => setD((x) => ({ ...x, maxWalkKm: e.target.value === '' ? undefined : Number(e.target.value) }))} /></Field>
          <Field label="Salita massima (m)" htmlFor="ma"><input id="ma" type="number" min={0} step={25} value={d.maxAscentM ?? ''} placeholder="nessun limite" onChange={(e) => setD((x) => ({ ...x, maxAscentM: e.target.value === '' ? undefined : Number(e.target.value) }))} /></Field>
        </div>
      </details>
      <Field label="Trasporti" hint="A piedi sempre. Solo modalità realmente supportate dall'orario ufficiale.">
        <div className="chips">
          {([['bus', 'Bus'], ['train', 'Treno'], ['boat', 'Battello'], ['funicular', 'Funicolare']] as const).map(([k, v]) => <Chip key={k} on={d.transport[k]} onClick={() => setD((x) => ({ ...x, transport: { ...x.transport, [k]: !x.transport[k] } }))}>{v}</Chip>)}
        </div>
      </Field>
      <Field label="Abbonamenti o titoli di viaggio" hint="Li segnaliamo nei costi, ma non applichiamo sconti non verificati.">
        <div className="chips">
          {([['ga', 'AG / GA'], ['half_fare', 'Metà prezzo'], ['arcobaleno', 'Arcobaleno'], ['ticino_ticket', 'Ticino Ticket'], ['lugano_card', 'Lugano Card']] as const).map(([k, v]) => <Chip key={k} on={d.passes.includes(k)} onClick={() => setD((x) => ({ ...x, passes: x.passes.includes(k) ? x.passes.filter((y) => y !== k) : [...x.passes, k] }))}>{v}</Chip>)}
        </div>
      </Field>
    </div>
  );
}

function StepNeeds() {
  const [d, setD] = useDraft();
  const [lock, setLock] = useState<{ placeId: string; start: string; end: string }>({ placeId: '', start: '19:30', end: '21:00' });
  const [places, setPlaces] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => { get<{ places: any[] }>('/api/places').then((r) => setPlaces(r.places)).catch(() => {}); }, []);
  const mob = (k: keyof Draft['mobility']) => setD((x) => ({ ...x, mobility: { ...x.mobility, [k]: !x.mobility[k] } }));
  return (
    <div>
      <p className="hint">Tutto facoltativo. Queste informazioni non vengono condivise nei link, salvo vostra scelta.</p>
      <Field label="Mobilità">
        <div className="chips">
          <Chip on={d.mobility.stroller} onClick={() => mob('stroller')}>Passeggino</Chip>
          <Chip on={d.mobility.wheelchair} onClick={() => mob('wheelchair')}>Sedia a rotelle</Chip>
          <Chip on={d.mobility.avoidStairs} onClick={() => mob('avoidStairs')}>Evitare scale</Chip>
          <Chip on={d.mobility.frequentBreaks} onClick={() => mob('frequentBreaks')}>Pause frequenti</Chip>
        </div>
      </Field>
      <Field label="Alimentazione" hint="Le indicazioni dei locali non sono verificate.">
        <div className="chips">
          {([['vegetarian', 'Vegetariano'], ['vegan', 'Vegano'], ['gluten_free', 'Senza glutine'], ['lactose_free', 'Senza lattosio']] as const).map(([k, v]) => <Chip key={k} on={d.diet.includes(k)} onClick={() => setD((x) => ({ ...x, diet: x.diet.includes(k) ? x.diet.filter((y) => y !== k) : [...x.diet, k] }))}>{v}</Chip>)}
        </div>
      </Field>
      <Field label="Se piove">
        <div className="seg">
          {([['low', 'Meglio al coperto'], ['medium', 'Qualche goccia va bene'], ['high', 'Non ci ferma']] as const).map(([k, v]) => <button type="button" key={k} className={d.rainTolerance === k ? 'on' : ''} onClick={() => setD((x) => ({ ...x, rainTolerance: k }))}>{v}</button>)}
        </div>
      </Field>
      <Field label="Orari già bloccati (prenotazioni)" hint="Per esempio una cena prenotata: resterà fissa anche quando cambiate il resto.">
        {d.locked.map((l, i) => <div key={i} className="locked-row">🔒 {places.find((p) => p.id === l.placeId)?.name ?? l.placeId} {l.start}–{l.end} <button type="button" className="link" onClick={() => setD((x) => ({ ...x, locked: x.locked.filter((_, j) => j !== i), mustSee: x.mustSee.filter((m) => m !== l.placeId) }))}>rimuovi</button></div>)}
        <div className="row wrap">
          <select value={lock.placeId} onChange={(e) => setLock({ ...lock, placeId: e.target.value })} aria-label="Luogo prenotato">
            <option value="">Scegli il luogo…</option>
            {places.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input type="time" value={lock.start} onChange={(e) => setLock({ ...lock, start: e.target.value })} aria-label="Dalle" />
          <input type="time" value={lock.end} onChange={(e) => setLock({ ...lock, end: e.target.value })} aria-label="Alle" />
          <button type="button" className="btn-ghost" disabled={!lock.placeId} onClick={() => setD((x) => ({ ...x, locked: [...x.locked, { ...lock }], mustSee: [...new Set([...x.mustSee, lock.placeId])] }))}>Aggiungi</button>
        </div>
      </Field>
      <Field label="C'è altro che vuoi dirci?" htmlFor="free" hint="Scrivete liberamente. Se qualcosa contraddice il modulo ve lo chiederemo, senza cambiare nulla di nascosto.">
        <textarea id="free" rows={3} maxLength={1000} value={d.freeText ?? ''} onChange={(e) => setD((x) => ({ ...x, freeText: e.target.value }))} placeholder="Es. «vorremmo vedere il tramonto e finire con un gelato; niente salite»" />
      </Field>
    </div>
  );
}

function StepReview() {
  const [d] = useDraft();
  const meta = useApp((s) => s.meta);
  const set = useApp((s) => s.set);
  const kids = d.people.filter((p) => p.kind === 'child').length;
  const rows: [string, string, number][] = [
    ['Gruppo', `${d.people.length} person${d.people.length > 1 ? 'e' : 'a'}${kids ? ` (${kids} bambin${kids > 1 ? 'i' : 'o'})` : ''} · ${OCCASIONS[d.occasion]}`, 0],
    ['Quando', `${d.date} · ${d.startTime}–${d.endTime}${d.endTime <= d.startTime ? ' (+1)' : ''}`, 1],
    ['Partenza', d.start.label, 1],
    ['Arrivo', d.end.mode === 'same' ? 'Stesso punto' : d.end.mode === 'free' ? 'Punto libero' : d.end.location?.label ?? '—', 1],
    ['Atmosfera', d.moods.map((m) => MOODS[m]).join(', ') || 'libera', 2],
    ['Da evitare', d.avoid.map((a) => AVOID[a]).join(', ') || 'nulla', 2],
    ['Budget', d.budget.amount != null ? `CHF ${d.budget.amount} ${d.budget.per === 'person' ? 'a persona' : 'in totale'}${d.budget.strict ? ', rigido' : ''}` : 'nessun tetto', 3],
    ['Ritmo', `${PACE[d.pace]}${d.maxWalkKm ? ` · max ${d.maxWalkKm} km` : ''}`, 3],
    ['Esigenze', [d.mobility.stroller && 'passeggino', d.mobility.wheelchair && 'sedia a rotelle', d.mobility.avoidStairs && 'niente scale', d.mobility.frequentBreaks && 'pause'].filter(Boolean).join(', ') || '—', 4],
  ];
  return (
    <div>
      <div className="review-avatars">{d.people.map((p) => <span key={p.id} title={p.name} dangerouslySetInnerHTML={{ __html: avatarSvg(p, 40) }} />)}</div>
      <dl className="review">
        {rows.map(([k, v, s]) => <div key={k}><dt>{k}</dt><dd>{v} <button className="link" onClick={() => set({ wizardStep: s })}>modifica</button></dd></div>)}
      </dl>
      {d.freeText ? <div className="notice">«{d.freeText}»</div> : null}
      <p className="hint">{meta?.ai.configured ? `Le proposte useranno ${meta.ai.label}, sempre validate dal motore di pianificazione.` : <>Le proposte arrivano dal <strong>pianificatore deterministico</strong> (nessun modello AI configurato). <Badge kind="demo">demo</Badge></>}</p>
    </div>
  );
}
