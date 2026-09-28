import { useEffect, useState } from 'react';
import { useApp } from '../store.ts';
import { send, get, track, ApiError } from '../api.ts';
import { Modal, copy } from './common.tsx';
import { DEFAULT_REDACTION, type Redaction } from '../../shared/export.ts';

export async function savePlan(): Promise<{ id: string; token: string } | null> {
  const app = useApp.getState();
  const plan = app.plan();
  if (!plan) return null;
  const data = { alternatives: app.result?.alternatives ?? [plan], branches: app.branches, currentBranch: app.currentBranch, current: plan, savedAt: new Date().toISOString() };
  try {
    let ref = app.savedRef;
    if (ref) {
      await send('PUT', `/api/plans/${ref.id}`, { title: plan.title, data }, { headers: { 'x-edit-token': ref.token } });
    } else {
      const r = await send<{ id: string; editToken: string }>('POST', '/api/plans', { title: plan.title, data });
      ref = { id: r.id, token: r.editToken };
      const saved = [{ id: r.id, token: r.editToken, title: plan.title, date: plan.request.date, savedAt: new Date().toISOString() }, ...app.saved.filter((s) => s.id !== r.id)];
      app.set({ saved, savedRef: ref });
    }
    // copia leggibile anche senza rete (riepilogo offline, senza garanzie live)
    try { localStorage.setItem(`lia.offline.${ref.id}`, JSON.stringify({ plan, savedAt: new Date().toISOString() })); track('offline_saved'); } catch { /* archiviazione piena */ }
    app.notify('Programma salvato. Il link personale permette di riaprirlo e modificarlo.', 'ok');
    history.replaceState(null, '', `/p/${ref.id}#k=${ref.token}`);
    return ref;
  } catch (e) {
    app.notify(e instanceof ApiError ? e.message : 'Salvataggio non riuscito.', 'error');
    return null;
  }
}

export function SaveShareButtons() {
  const [share, setShare] = useState(false);
  const set = useApp((s) => s.set);
  return (
    <div className="save-share">
      <button className="btn-ghost" onClick={() => void savePlan()}>Salva</button>
      <button className="btn-ghost" onClick={() => setShare(true)}>Condividi</button>
      <button className="btn-ghost" onClick={() => set({ view: 'summary' })}>Riepilogo pratico</button>
      {share ? <ShareDialog onClose={() => setShare(false)} /> : null}
    </div>
  );
}

export function ShareDialog({ onClose }: { onClose: () => void }) {
  const [red, setRed] = useState<Redaction>(DEFAULT_REDACTION);
  const [votes, setVotes] = useState(true);
  const [link, setLink] = useState<string | null>(null);
  const [shares, setShares] = useState<{ token: string; createdAt: string; revokedAt: string | null; allowVotes: boolean }[]>([]);
  const savedRef = useApp((s) => s.savedRef);
  const load = async (ref = savedRef) => { if (ref) try { setShares((await get<any>(`/api/plans/${ref.id}/shares`, { headers: { 'x-edit-token': ref.token } })).shares); } catch { /* */ } };
  useEffect(() => { void load(); }, [savedRef]);
  const create = async () => {
    const ref = savedRef ?? (await savePlan());
    if (!ref) return;
    const r = await send<{ token: string; path: string }>('POST', `/api/plans/${ref.id}/share`, { redaction: red, allowVotes: votes }, { headers: { 'x-edit-token': ref.token } });
    setLink(`${location.origin}${r.path}`);
    void load(ref);
  };
  const revoke = async (token: string) => {
    if (!savedRef) return;
    await send('DELETE', `/api/share/${token}`, null, { headers: { 'x-edit-token': savedRef.token } });
    useApp.getState().notify('Link revocato: non è più accessibile.', 'ok');
    void load();
  };
  const opt = (k: keyof Redaction, label: string) => <label className="check"><input type="checkbox" checked={red[k]} onChange={(e) => setRed({ ...red, [k]: e.target.checked })} /> {label}</label>;
  return (
    <Modal title="Condividi il programma" onClose={onClose}>
      <p className="hint">Chi riceve il link vede le proposte senza account. Potete togliere i dettagli personali e revocare il link in ogni momento.</p>
      {opt('hideLocations', 'Nascondi partenza, alloggio e posizione')}
      {opt('hideNeeds', 'Nascondi esigenze personali, alimentazione e testo libero')}
      {opt('hideNames', 'Nascondi i nomi dei personaggi')}
      {opt('hideBudget', 'Nascondi il budget')}
      <label className="check"><input type="checkbox" checked={votes} onChange={(e) => setVotes(e.target.checked)} /> Permetti agli amici di votare l'alternativa preferita</label>
      <div className="row"><button className="btn primary" onClick={() => void create()}>Crea link</button></div>
      {link ? <div className="share-link"><input readOnly value={link} aria-label="Link di condivisione" onFocus={(e) => e.target.select()} /><button className="btn-ghost" onClick={() => copy(link)}>Copia</button></div> : null}
      {shares.length ? (
        <>
          <h4>Link esistenti</h4>
          <ul className="share-list">{shares.map((s) => <li key={s.token}><code>/s/{s.token.slice(0, 6)}…</code> {new Date(s.createdAt).toLocaleString('it-CH')} {s.revokedAt ? <span className="muted">revocato</span> : <button className="link" onClick={() => void revoke(s.token)}>revoca</button>}</li>)}</ul>
        </>
      ) : null}
    </Modal>
  );
}
