import { tx, getLocale } from '../locale.ts';
import { safeUrl } from '../safe-url.ts';
import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../store.ts';
import { STATUS } from '../i18n.ts';
import { fmtRange } from '../../shared/pricing.ts';

export function Badge({ kind = 'neutral', children, title }: { kind?: 'neutral' | 'ok' | 'warn' | 'bad' | 'demo' | 'info' | 'ai'; children: ReactNode; title?: string }) {
  return <span className={`badge badge-${kind}`} title={tx(title)}>{tx(children)}</span>;
}

export function EvidenceBadge({ status }: { status?: string }) {
  const s = status ?? 'unknown';
  const kind = s === 'verified' || s === 'official_import' ? 'ok' : s === 'demo' ? 'demo' : s === 'unknown' ? 'bad' : s === 'estimate' ? 'info' : 'warn';
  return <Badge kind={kind as any} title={tx("Stato della verifica del dato")}>{tx(STATUS[s] ?? s)}</Badge>;
}

/** Link alla fonte ufficiale di un dato verificato, con la data di consultazione. */
export function SourceLink({ evidence }: { evidence?: { url?: string; lastCheckedAt?: string } }) {
  if (!evidence?.url) return null;
  let host = evidence.url;
  try { host = new URL(evidence.url).hostname.replace(/^www\d?\./, ''); } catch { /* url non valido: si mostra com'è */ }
  const when = evidence.lastCheckedAt ? new Date(`${evidence.lastCheckedAt.slice(0, 10)}T12:00:00Z`).toLocaleDateString(getLocale(), { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : null;
  return <span className="source-link"> · <a href={safeUrl(evidence.url)} target="_blank" rel="noopener noreferrer">{tx(host)}</a>{tx(when ? `, consultato il ${when}` : '')}</span>;
}

/** Chiusure straordinarie future (giorni consecutivi raggruppati). */
export function closureRanges(exceptions: { date: string; closed?: boolean; note?: string }[], today: string): { from: string; to: string; note?: string }[] {
  const days = exceptions.filter((e) => e.closed && e.note && e.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const out: { from: string; to: string; note?: string }[] = [];
  for (const d of days) {
    const last = out[out.length - 1];
    const next = last ? new Date(Date.parse(`${last.to}T12:00:00Z`) + 86400_000).toISOString().slice(0, 10) : '';
    if (last && next === d.date && last.note === d.note) last.to = d.date;
    else out.push({ from: d.date, to: d.date, note: d.note });
  }
  return out;
}

export function Cost({ min, max, unknown }: { min: number | null; max: number | null; unknown?: number }) {
  return <span className="cost">{tx(fmtRange(min, max))}{unknown ? <span className="muted"> + {tx(`${unknown} costi sconosciuti`)}</span> : null}</span>;
}

export function Chip({ on, onClick, children, icon, disabled, title }: { on: boolean; onClick: () => void; children: ReactNode; icon?: string; disabled?: boolean; title?: string }) {
  return (
    <button type="button" className={`chip ${on ? 'on' : ''}`} aria-pressed={on} onClick={onClick} disabled={disabled} title={tx(title)}>
      {icon ? <span className="chip-icon" aria-hidden>{tx(icon)}</span> : null}{tx(children)}
    </button>
  );
}

export function Section({ title, children, right, id }: { title: string; children: ReactNode; right?: ReactNode; id?: string }) {
  return (
    <section className="section" aria-labelledby={id}>
      <div className="section-head"><h3 id={id}>{tx(title)}</h3>{tx(right)}</div>
      {tx(children)}
    </section>
  );
}

export function Modal({ title, onClose, children, wide, labelledBy }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean; labelledBy?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  // il focus iniziale e il ripristino avvengono una volta sola, anche se il genitore
  // passa una nuova funzione onClose a ogni rendering
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const onClose = () => closeRef.current();
    const prev = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && ref.current) {
        const f = [...ref.current.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((x) => !x.hasAttribute('disabled'));
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      // se l'elemento di partenza non esiste più (es. un menu chiuso), si torna al suo pulsante di apertura
      if (prev && prev.isConnected && prev !== document.body) prev.focus();
      else document.querySelector<HTMLElement>('[data-focus-return]')?.focus();
    };
  }, []);
  const hid = labelledBy ?? `m-${title.replace(/\W+/g, '-')}`;
  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) closeRef.current(); }}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={hid} ref={ref}>
        <div className="modal-head"><h2 id={hid}>{tx(title)}</h2><button className="icon-btn" onClick={onClose} aria-label={tx("Chiudi")}>✕</button></div>
        <div className="modal-body">{tx(children)}</div>
      </div>
    </div>,
    document.body,
  );
}

export function Toast() {
  const toast = useApp((s) => s.toast);
  const set = useApp((s) => s.set);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => set({ toast: null }), toast.kind === 'error' ? 7000 : 4500);
    return () => clearTimeout(id);
  }, [toast, set]);
  if (!toast) return null;
  return <div className={`toast toast-${toast.kind}`} role={toast.kind === 'error' ? 'alert' : 'status'} onClick={() => set({ toast: null })}>{tx(toast.text)}</div>;
}

export function Spinner({ label }: { label?: string }) {
  return <span className="spinner" role="status" aria-label={tx(label ?? 'Caricamento')}><span /></span>;
}

export function Field({ label, children, hint, htmlFor }: { label: string; children: ReactNode; hint?: string; htmlFor?: string }) {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>{tx(label)}</label>
      {tx(children)}
      {hint ? <div className="hint">{tx(hint)}</div> : null}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="empty"><strong>{tx(title)}</strong>{children ? <div>{tx(children)}</div> : null}</div>;
}

export function copy(text: string) {
  try { void navigator.clipboard.writeText(text); useApp.getState().notify('Copiato negli appunti', 'ok'); }
  catch { useApp.getState().notify('Copia non disponibile: selezionate il testo manualmente.', 'error'); }
}

export function download(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
