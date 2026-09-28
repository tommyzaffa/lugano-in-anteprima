import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../store.ts';
import { STATUS } from '../i18n.ts';
import { fmtRange } from '../../shared/pricing.ts';

export function Badge({ kind = 'neutral', children, title }: { kind?: 'neutral' | 'ok' | 'warn' | 'bad' | 'demo' | 'info' | 'ai'; children: ReactNode; title?: string }) {
  return <span className={`badge badge-${kind}`} title={title}>{children}</span>;
}

export function EvidenceBadge({ status }: { status?: string }) {
  const s = status ?? 'unknown';
  const kind = s === 'verified' || s === 'official_import' ? 'ok' : s === 'demo' ? 'demo' : s === 'unknown' ? 'bad' : s === 'estimate' ? 'info' : 'warn';
  return <Badge kind={kind as any} title="Stato della verifica del dato">{STATUS[s] ?? s}</Badge>;
}

export function Cost({ min, max, unknown }: { min: number | null; max: number | null; unknown?: number }) {
  return <span className="cost">{fmtRange(min, max)}{unknown ? <span className="muted"> + {unknown} sconosciut{unknown > 1 ? 'i' : 'o'}</span> : null}</span>;
}

export function Chip({ on, onClick, children, icon, disabled, title }: { on: boolean; onClick: () => void; children: ReactNode; icon?: string; disabled?: boolean; title?: string }) {
  return (
    <button type="button" className={`chip ${on ? 'on' : ''}`} aria-pressed={on} onClick={onClick} disabled={disabled} title={title}>
      {icon ? <span className="chip-icon" aria-hidden>{icon}</span> : null}{children}
    </button>
  );
}

export function Section({ title, children, right, id }: { title: string; children: ReactNode; right?: ReactNode; id?: string }) {
  return (
    <section className="section" aria-labelledby={id}>
      <div className="section-head"><h3 id={id}>{title}</h3>{right}</div>
      {children}
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
        <div className="modal-head"><h2 id={hid}>{title}</h2><button className="icon-btn" onClick={onClose} aria-label="Chiudi">✕</button></div>
        <div className="modal-body">{children}</div>
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
  return <div className={`toast toast-${toast.kind}`} role={toast.kind === 'error' ? 'alert' : 'status'} onClick={() => set({ toast: null })}>{toast.text}</div>;
}

export function Spinner({ label }: { label?: string }) {
  return <span className="spinner" role="status" aria-label={label ?? 'Caricamento'}><span /></span>;
}

export function Field({ label, children, hint, htmlFor }: { label: string; children: ReactNode; hint?: string; htmlFor?: string }) {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {hint ? <div className="hint">{hint}</div> : null}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="empty"><strong>{title}</strong>{children ? <div>{children}</div> : null}</div>;
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
