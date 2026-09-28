import { useEffect, useMemo, useState } from 'react';
import { useApp, makePerson, defaultDraft, type Draft } from '../store.ts';
import { MOODS, MOOD_ICON, AVOID, PACE, AGE_BANDS } from '../i18n.ts';
import { Chip } from './common.tsx';
import LocationPicker from './LocationPicker.tsx';
import { avatarSvg, PAWN_COLORS } from '../map/avatars.ts';
import { get } from '../api.ts';
import { runPlanning } from './planning-actions.ts';
import { nextDay } from './Home.tsx';
import type { Person } from '../../shared/types.ts';

const STEPS = ['Chi siete', 'Quando e da dove', 'Cosa vi va'];
const OCCASION_CHIPS: [string, string][] = [['friends', 'Amici'], ['date', 'In coppia'], ['family', 'Famiglia'], ['guests', 'Ospiti'], ['birthday', 'Compleanno'], ['leisure', 'Tempo libero']];
const SLOTS: [string, string, string][] = [['Mattina', '09:00', '13:00'], ['Pomeriggio', '13:30', '19:00'], ['Sera', '18:30', '23:30'], ['Giornata', '10:00', '18:00']];
const BUDGETS: [string, number | undefined][] = [['Qualsiasi', undefined], ['≤ 20', 20], ['≤ 50', 50], ['≤ 100', 100], ['≤ 150', 150]];

export default function Wizard() {
  const draft = useApp((s) => s.draft);
  const meta = useApp((s) => s.meta);
  const step = Math.min(useApp((s) => s.wizardStep), STEPS.length - 1);
  const set = useApp((s) => s.set);
  useEffect(() => { if (!draft && meta) useApp.setState({ draft: defaultDraft(meta.today) }); }, [draft, meta]);
  if (!draft) return null;
  const go = (n: number) => { set({ wizardStep: Math.max(0, Math.min(STEPS.length - 1, n)) }); document.querySelector('.panel-body')?.scrollTo({ top: 0 }); };
  return (
    <div className="wizard">
      <div className="wz-progress" aria-label="Passaggi">
        {STEPS.map((s, i) => <button key={s} className={i === step ? 'current' : i < step ? 'done' : ''} onClick={() => go(i)} aria-label={`${i + 1}. ${s}`} aria-current={i === step ? 'step' : undefined} />)}
      </div>
      <div className="wz-head"><h2 className="wizard-title">{STEPS[step]}</h2><span className="wz-step">{step + 1} di {STEPS.length}</span></div>
      <div>
        {step === 0 && <StepGroup />}
        {step === 1 && <StepWhen />}
        {step === 2 && <StepLikes />}
      </div>
      <div className="wz-foot">
        {step > 0 ? <button className="btn-ghost" onClick={() => go(step - 1)}>Indietro</button> : <button className="btn-ghost" onClick={() => set({ view: 'home' })}>Annulla</button>}
        {step < STEPS.length - 1
          ? <button className="btn primary" onClick={() => go(step + 1)}>Avanti</button>
          : <>
              <button className="icon-btn" onClick={() => runPlanning(true)} title="Sorprendimi: una combinazione a sorpresa entro i vostri vincoli" aria-label="Sorprendimi">🎲</button>
              <button className="btn primary" onClick={() => runPlanning(false)}>Mostrami le proposte</button>
            </>}
      </div>
    </div>
  );
}

function useDraft(): [Draft, (f: (d: Draft) => Draft) => void] {
  const draft = useApp((s) => s.draft)!;
  const setDraft = useApp((s) => s.setDraft);
  return [draft, setDraft];
}

// ------------------------------------------------------------------ 1. chi siete
function StepGroup() {
  const [d, setD] = useDraft();
  const max = useApp((s) => s.meta?.maxPeople ?? 12);
  const [editing, setEditing] = useState<string | null>(null);
  const [overflow, setOverflow] = useState(false);
  const upd = (id: string, p: Partial<Person>) => setD((x) => ({ ...x, people: x.people.map((q) => (q.id === id ? { ...q, ...p } : q)) }));
  const add = () => {
    if (d.people.length >= max) { setOverflow(true); return; }
    // colore non ancora usato, se c'è
    const used = new Set(d.people.map((p) => p.avatar.color));
    const p = makePerson(d.people.length);
    const color = PAWN_COLORS.find((c) => !used.has(c)) ?? p.avatar.color;
    setD((x) => ({ ...x, people: [...x.people, { ...p, avatar: { ...p.avatar, color } }] }));
  };
  const remove = (id: string) => { setOverflow(false); setD((x) => ({ ...x, people: x.people.filter((p) => p.id !== id) })); };
  return (
    <div>
      <p className="hint">Una pedina per persona: toccatela per cambiarle colore.</p>
      <div className="pawns">
        {d.people.map((p, i) => (
          <div key={p.id} className={`pawn-card ${editing === p.id ? 'editing' : ''}`}>
            {d.people.length > 1 ? <button type="button" className="pawn-remove" onClick={() => remove(p.id)} aria-label={`Togli ${p.name}`}>✕</button> : null}
            <button type="button" className="pawn-btn" onClick={() => setEditing(editing === p.id ? null : p.id)} aria-label={`Colore di ${p.name}`} aria-expanded={editing === p.id} dangerouslySetInnerHTML={{ __html: avatarSvg(p, 56) }} />
            {editing === p.id ? (
              <div className="swatches">{PAWN_COLORS.map((c) => <button key={c} type="button" className={`swatch ${p.avatar.color === c ? 'on' : ''}`} style={{ background: c }} onClick={() => { upd(p.id, { avatar: { ...p.avatar, color: c } }); setEditing(null); }} aria-label={`Colore ${c}`} />)}</div>
            ) : null}
            <input aria-label={`Nome persona ${i + 1}`} value={p.name} maxLength={16} onChange={(e) => upd(p.id, { name: e.target.value })} onBlur={(e) => { if (!e.target.value.trim()) upd(p.id, { name: p.kind === 'child' ? `Bimbo ${i + 1}` : `Persona ${i + 1}` }); }} />
            <button type="button" className={`pawn-kid ${p.kind === 'child' ? 'on' : ''}`} aria-pressed={p.kind === 'child'} onClick={() => upd(p.id, p.kind === 'child' ? { kind: 'adult', ageBand: undefined } : { kind: 'child', ageBand: p.ageBand ?? '6-11' })}>{p.kind === 'child' ? 'bambino' : 'adulto'}</button>
            {p.kind === 'child' ? (
              <select aria-label={`Età di ${p.name}`} value={p.ageBand ?? '6-11'} onChange={(e) => upd(p.id, { ageBand: e.target.value as any })} style={{ minHeight: 32, padding: '.15rem .4rem', fontSize: '.8rem' }}>
                {AGE_BANDS.map((b) => <option key={b} value={b}>{b} anni</option>)}
              </select>
            ) : null}
          </div>
        ))}
        <button type="button" className="pawn-add" onClick={add} aria-label="Aggiungi una persona"><span>+</span>Aggiungi</button>
      </div>
      {overflow ? <div className="notice warn" role="alert">Per ora gruppi fino a {max} persone. Con più persone potete preparare due programmi paralleli.</div> : null}
      <div className="field">
        <span className="label">Occasione</span>
        <div className="chips">{OCCASION_CHIPS.map(([k, v]) => <Chip key={k} on={d.occasion === k} onClick={() => setD((x) => ({ ...x, occasion: k as any }))}>{v}</Chip>)}</div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ 2. quando e da dove
function StepWhen() {
  const [d, setD] = useDraft();
  const meta = useApp((s) => s.meta);
  const today = meta?.today ?? new Date().toISOString().slice(0, 10);
  const days = useMemo(() => {
    const out: [string, string][] = [[today, 'Oggi'], [nextDay(today), 'Domani']];
    // prossimo sabato e domenica, se non sono già oggi o domani
    for (let i = 2; i < 8; i++) {
      const x = nextDay(today, i);
      const wd = new Date(`${x}T12:00:00Z`).getUTCDay();
      if (wd === 6) out.push([x, 'Sabato']);
      if (wd === 0 && out.length < 4) out.push([x, 'Domenica']);
    }
    return out.slice(0, 4);
  }, [today]);
  const [otherDate, setOtherDate] = useState(!days.some(([x]) => x === d.date));
  const outOfFeed = meta && (d.date.replace(/-/g, '') < meta.transit.range.start || d.date.replace(/-/g, '') > meta.transit.range.end);
  return (
    <div>
      <div className="field">
        <span className="label">Giorno</span>
        <div className="chips day-chips">
          {days.map(([x, l]) => <Chip key={x} on={!otherDate && d.date === x} onClick={() => { setOtherDate(false); setD((y) => ({ ...y, date: x })); }}>{l}<small>{shortDate(x)}</small></Chip>)}
          <Chip on={otherDate} onClick={() => setOtherDate(true)}>Altra data</Chip>
        </div>
        {otherDate ? <input type="date" aria-label="Data" value={d.date} min={today} onChange={(e) => e.target.value && setD((x) => ({ ...x, date: e.target.value }))} /> : null}
        {outOfFeed ? <p className="hint">Per questa data gli orari dei mezzi sono stimati: da ricontrollare prima di partire.</p> : null}
      </div>
      <div className="field">
        <span className="label">Orario</span>
        <div className="chips">{SLOTS.map(([l, a, b]) => <Chip key={l} on={d.startTime === a && d.endTime === b} onClick={() => setD((x) => ({ ...x, startTime: a, endTime: b }))}>{l}</Chip>)}</div>
        <div className="time-row">
          <span className="muted">dalle</span><input type="time" aria-label="Ora di partenza" value={d.startTime} onChange={(e) => e.target.value && setD((x) => ({ ...x, startTime: e.target.value }))} />
          <span className="muted">alle</span><input type="time" aria-label="Ora di fine" value={d.endTime} onChange={(e) => e.target.value && setD((x) => ({ ...x, endTime: e.target.value }))} />
        </div>
        {d.endTime <= d.startTime ? <p className="hint">Fine il giorno dopo, alle {d.endTime}.</p> : null}
      </div>
      <div className="field">
        <label htmlFor="start-loc">Da dove partite?</label>
        <LocationPicker id="start-loc" value={d.start} onChange={(l) => setD((x) => ({ ...x, start: l }))} />
      </div>
      <details className="more" open={d.end.mode !== 'same'}>
        <summary>Finire altrove <span className="muted">· {d.end.mode === 'same' ? 'stesso punto' : d.end.mode === 'free' ? 'punto libero' : d.end.mode === 'station' ? 'stazione' : d.end.location?.label ?? 'da scegliere'}</span></summary>
        <div className="chips">
          {([['same', 'Stesso punto'], ['station', 'Stazione'], ['accommodation', 'Alloggio'], ['custom', 'Altro punto'], ['free', 'Nessun rientro']] as const).map(([k, v]) => (
            <Chip key={k} on={d.end.mode === k} onClick={() => setD((x) => ({ ...x, end: { mode: k, location: k === 'station' ? { ...(meta?.quickStarts?.[0] ?? x.start), kind: 'stop' } : k === 'same' || k === 'free' ? undefined : x.end.location } }))}>{v}</Chip>
          ))}
        </div>
        {d.end.mode === 'accommodation' || d.end.mode === 'custom' ? (
          <LocationPicker id="end-loc" value={d.end.location} onChange={(l) => setD((x) => ({ ...x, end: { ...x.end, location: { ...l, sensitive: d.end.mode === 'accommodation' || l.sensitive } } }))} />
        ) : null}
      </details>
    </div>
  );
}

// ------------------------------------------------------------------ 3. cosa vi va
function StepLikes() {
  const [d, setD] = useDraft();
  const toggle = <K extends 'moods' | 'avoid'>(k: K, v: string) => setD((x) => ({ ...x, [k]: (x[k] as string[]).includes(v) ? (x[k] as string[]).filter((y) => y !== v) : [...(x[k] as string[]), v] }));
  const mob = (k: keyof Draft['mobility']) => setD((x) => ({ ...x, mobility: { ...x.mobility, [k]: !x.mobility[k] } }));
  const extras = [d.pace !== 'balanced', d.environment !== 'any', Object.values(d.mobility).some(Boolean), d.avoid.length > 0, d.diet.length > 0, d.rainTolerance !== 'medium', d.locked.length > 0, d.exclude.length > 0, !!d.maxWalkKm].filter(Boolean).length;
  return (
    <div>
      <MustSeeChips />
      <div className="tiles" role="group" aria-label="Atmosfera">
        {Object.entries(MOODS).map(([k, v]) => (
          <button key={k} type="button" className={`tile ${d.moods.includes(k as any) ? 'on' : ''}`} aria-pressed={d.moods.includes(k as any)} onClick={() => toggle('moods', k)}><span className="ti" aria-hidden>{MOOD_ICON[k]}</span>{v.replace('Avventura leggera', 'Avventura')}</button>
        ))}
      </div>
      <div className="field">
        <span className="label">Budget a persona (CHF)</span>
        <div className="chips">{BUDGETS.map(([l, v]) => <Chip key={l} on={d.budget.amount === v && (v === undefined || d.budget.per === 'person')} onClick={() => setD((x) => ({ ...x, budget: { ...x.budget, amount: v, per: 'person' } }))}>{l}</Chip>)}</div>
      </div>
      <div className="field">
        <label htmlFor="free">Qualcos'altro?</label>
        <textarea id="free" rows={2} maxLength={1000} value={d.freeText ?? ''} onChange={(e) => setD((x) => ({ ...x, freeText: e.target.value }))} placeholder="es. «vorremmo vedere il tramonto e finire con un gelato»" />
      </div>
      <details className="more">
        <summary>Esigenze e preferenze {extras ? <span className="muted">· {extras} attive</span> : null}</summary>
        <div className="field">
          <span className="label">Ritmo</span>
          <div className="seg">{Object.entries(PACE).map(([k, v]) => <button type="button" key={k} className={d.pace === k ? 'on' : ''} onClick={() => setD((x) => ({ ...x, pace: k as any }))}>{v}</button>)}</div>
        </div>
        <div className="field">
          <span className="label">Mobilità</span>
          <div className="chips">
            <Chip on={d.mobility.stroller} onClick={() => mob('stroller')}>Passeggino</Chip>
            <Chip on={d.mobility.wheelchair} onClick={() => mob('wheelchair')}>Sedia a rotelle</Chip>
            <Chip on={d.mobility.avoidStairs} onClick={() => mob('avoidStairs')}>Niente scale</Chip>
            <Chip on={d.mobility.frequentBreaks} onClick={() => mob('frequentBreaks')}>Pause frequenti</Chip>
          </div>
        </div>
        <div className="field">
          <span className="label">Dentro o fuori</span>
          <div className="seg">{([['any', 'Indifferente'], ['outdoor', 'All\'aperto'], ['indoor', 'Al coperto']] as const).map(([k, v]) => <button type="button" key={k} className={d.environment === k ? 'on' : ''} onClick={() => setD((x) => ({ ...x, environment: k }))}>{v}</button>)}</div>
        </div>
        <div className="field">
          <span className="label">Se piove</span>
          <div className="seg">{([['low', 'Al coperto'], ['medium', 'Qualche goccia ok'], ['high', 'Non ci ferma']] as const).map(([k, v]) => <button type="button" key={k} className={d.rainTolerance === k ? 'on' : ''} onClick={() => setD((x) => ({ ...x, rainTolerance: k }))}>{v}</button>)}</div>
        </div>
        <div className="field">
          <span className="label">Da evitare</span>
          <div className="chips">{Object.entries(AVOID).map(([k, v]) => <Chip key={k} on={d.avoid.includes(k as any)} onClick={() => toggle('avoid', k)}>{v}</Chip>)}</div>
        </div>
        <div className="field">
          <span className="label">Alimentazione</span>
          <div className="chips">{([['vegetarian', 'Vegetariano'], ['vegan', 'Vegano'], ['gluten_free', 'Senza glutine'], ['lactose_free', 'Senza lattosio']] as const).map(([k, v]) => <Chip key={k} on={d.diet.includes(k)} onClick={() => setD((x) => ({ ...x, diet: x.diet.includes(k) ? x.diet.filter((y) => y !== k) : [...x.diet, k] }))}>{v}</Chip>)}</div>
        </div>
        <div className="field">
          <span className="label">Mezzi</span>
          <div className="chips">{([['bus', 'Bus'], ['train', 'Treno'], ['boat', 'Battello'], ['funicular', 'Funicolare']] as const).map(([k, v]) => <Chip key={k} on={d.transport[k]} onClick={() => setD((x) => ({ ...x, transport: { ...x.transport, [k]: !x.transport[k] } }))}>{v}</Chip>)}</div>
        </div>
        <div className="field">
          <label htmlFor="mw">Cammino massimo (km)</label>
          <input id="mw" type="number" min={0.5} step={0.5} value={d.maxWalkKm ?? ''} placeholder="nessun limite" onChange={(e) => setD((x) => ({ ...x, maxWalkKm: e.target.value === '' ? undefined : Number(e.target.value) }))} style={{ maxWidth: 160 }} />
        </div>
        <PlacesMulti label="Da non perdere" value={d.mustSee} labels={d.mustSeeLabels} onChange={(v) => setD((x) => ({ ...x, mustSee: v }))} />
        <PlacesMulti label="Da escludere" value={d.exclude} onChange={(v) => setD((x) => ({ ...x, exclude: v }))} />
        <LockedSlots />
      </details>
    </div>
  );
}

/** Tappe obbligatorie già scelte (per esempio un evento dal calendario): sempre in vista. */
function MustSeeChips() {
  const [d, setD] = useDraft();
  const labels = d.mustSeeLabels ?? {};
  const ev = d.mustSee.filter((m) => labels[m]);
  if (!ev.length) return null;
  return (
    <div className="notice info">
      <strong>Da non perdere:</strong>{' '}
      {ev.map((m) => <Chip key={m} on onClick={() => setD((x) => ({ ...x, mustSee: x.mustSee.filter((y) => y !== m) }))} title="Togli">{labels[m]} ✕</Chip>)}
    </div>
  );
}

function PlacesMulti({ label, value, onChange, labels }: { label: string; value: string[]; onChange: (v: string[]) => void; labels?: Record<string, string> }) {
  const [all, setAll] = useState<{ id: string; name: string; category: string }[]>([]);
  const [q, setQ] = useState('');
  useEffect(() => { get<{ places: any[] }>('/api/places').then((r) => setAll(r.places)).catch(() => {}); }, []);
  const matches = useMemo(() => (q.length >= 2 ? all.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()) && !value.includes(p.id)).slice(0, 8) : []), [q, all, value]);
  return (
    <div className="field">
      <span className="label">{label}</span>
      {value.length ? <div className="chips">{value.map((id) => <Chip key={id} on onClick={() => onChange(value.filter((x) => x !== id))} title="Togli">{all.find((p) => p.id === id)?.name ?? labels?.[id] ?? id} ✕</Chip>)}</div> : null}
      <input type="search" placeholder="Cerca un luogo…" value={q} onChange={(e) => setQ(e.target.value)} aria-label={label} />
      {matches.length ? <ul className="loc-results inline">{matches.map((m) => <li key={m.id}><button type="button" onClick={() => { onChange([...value, m.id]); setQ(''); }}><strong>{m.name}</strong></button></li>)}</ul> : null}
    </div>
  );
}

function LockedSlots() {
  const [d, setD] = useDraft();
  const [lock, setLock] = useState<{ placeId: string; start: string; end: string }>({ placeId: '', start: '19:30', end: '21:00' });
  const [places, setPlaces] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => { get<{ places: any[] }>('/api/places').then((r) => setPlaces(r.places)).catch(() => {}); }, []);
  return (
    <div className="field">
      <span className="label">Prenotazioni già fatte</span>
      {d.locked.map((l, i) => <div key={i} className="locked-row">🔒 {places.find((p) => p.id === l.placeId)?.name ?? l.placeId} {l.start}–{l.end} <button type="button" className="link" onClick={() => setD((x) => ({ ...x, locked: x.locked.filter((_, j) => j !== i), mustSee: x.mustSee.filter((m) => m !== l.placeId) }))}>togli</button></div>)}
      <div className="row wrap">
        <select value={lock.placeId} onChange={(e) => setLock({ ...lock, placeId: e.target.value })} aria-label="Luogo prenotato" style={{ flex: '1 1 100%' }}>
          <option value="">Scegli il luogo…</option>
          {places.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <input type="time" value={lock.start} onChange={(e) => setLock({ ...lock, start: e.target.value })} aria-label="Dalle" style={{ width: 'auto', flex: 1 }} />
        <input type="time" value={lock.end} onChange={(e) => setLock({ ...lock, end: e.target.value })} aria-label="Alle" style={{ width: 'auto', flex: 1 }} />
        <button type="button" className="btn-ghost" disabled={!lock.placeId} onClick={() => setD((x) => ({ ...x, locked: [...x.locked, { ...lock }], mustSee: [...new Set([...x.mustSee, lock.placeId])] }))}>Aggiungi</button>
      </div>
    </div>
  );
}

function shortDate(x: string) {
  const dt = new Date(`${x}T12:00:00Z`);
  return ` ${dt.getUTCDate()}/${dt.getUTCMonth() + 1}`;
}
