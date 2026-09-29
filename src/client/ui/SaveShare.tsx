import { tx, getLocale } from '../locale.ts';
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
    app.notify(app.meta?.hosting?.ephemeralStorage
      ? 'Programma salvato. In questa demo pubblica i salvataggi possono sparire quando il server si riavvia: tenete anche il riepilogo (Copia testo, calendario o stampa).'
      : 'Programma salvato. Il link personale permette di riaprirlo e modificarlo.', 'ok');
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
  const sharing = useApp((s) => !!s.meta?.features?.sharing);
  return (
    <div className="save-share">
      {sharing ? <button className="btn-ghost" onClick={() => void savePlan()}>{tx("Salva")}</button> : null}
      {sharing ? <button className="btn-ghost" onClick={() => setShare(true)}>{tx("Condividi")}</button> : null}
      <button className="btn-ghost" onClick={() => set({ view: 'summary' })}>{tx("Riepilogo pratico")}</button>
      {share ? <ShareDialog onClose={() => setShare(false)} /> : null}
    </div>
  );
}

export function ShareDialog({ onClose }: { onClose: () => void }) {
  const [red, setRed] = useState<Redaction>(DEFAULT_REDACTION);
  const [votes, setVotes] = useState(true);
  const [link, setLink] = useState<string | null>(null);
  const [shares, setShares] = useState<{ token: string; createdAt: string; revokedAt: string | null; allowVotes: boolean; tally?: Record<string, number> | null; comments?: number }[]>([]);
  const savedRef = useApp((s) => s.savedRef);
  const ephemeral = useApp((s) => s.meta?.hosting?.ephemeralStorage);
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
  const opt = (k: keyof Redaction, label: string) => <label className="check"><input type="checkbox" checked={red[k]} onChange={(e) => setRed({ ...red, [k]: e.target.checked })} /> {tx(label)}</label>;
  return (
    <Modal title={tx("Condividi il programma")} onClose={onClose}>
      <p className="hint">{tx("Chi riceve il link vede le proposte senza account. Potete togliere i dettagli personali e revocare il link in ogni momento.")}</p>
      {ephemeral ? <div className="notice warn">{tx("Demo pubblica: i link condivisi valgono finché il server non si riavvia (ad esempio dopo un periodo di inattività o un aggiornamento).")}</div> : null}
      {tx(opt('hideLocations', 'Nascondi partenza, alloggio e posizione'))}
      {tx(opt('hideNeeds', 'Nascondi esigenze personali, alimentazione e testo libero'))}
      {tx(opt('hideNames', 'Nascondi i nomi dei personaggi'))}
      {tx(opt('hideBudget', 'Nascondi il budget'))}
      <label className="check"><input type="checkbox" checked={votes} onChange={(e) => setVotes(e.target.checked)} />{tx(" Permetti agli amici di votare l'alternativa preferita")}</label>
      <div className="row"><button className="btn primary" onClick={() => void create()}>{tx("Crea link")}</button></div>
      {link ? <div className="share-link"><input readOnly value={link} aria-label={tx("Link di condivisione")} onFocus={(e) => e.target.select()} /><button className="btn-ghost" onClick={() => copy(link)}>{tx("Copia")}</button></div> : null}
      {tx(shares.length ? (
        <>
          <h4>{tx("Link esistenti")}</h4>
          <ul className="share-list">{shares.map((s) => <li key={s.token}><code>{tx("/s/")}{tx(s.token.slice(0, 6))}…</code> {tx(new Date(s.createdAt).toLocaleString(getLocale()))} {s.tally && Object.keys(s.tally).length ? <span className="muted">{tx(" · voti: ")}{tx(Object.values(s.tally as Record<string, number>).reduce((a, b) => a + b, 0))}{tx(s.comments ? `, commenti: ${s.comments}` : '')}</span> : null} {s.revokedAt ? <span className="muted">{tx("revocato")}</span> : <button className="link" onClick={() => void revoke(s.token)}>{tx("revoca")}</button>}</li>)}</ul>
        </>
      ) : null)}
    </Modal>
  );
}
