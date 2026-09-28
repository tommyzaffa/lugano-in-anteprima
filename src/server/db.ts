/**
 * Persistenza leggera su SQLite (modulo node:sqlite integrato in Node 24).
 * Per la versione pubblica è prevista una base relazionale con estensione
 * geografica (vedi docs/ARCHITETTURA.md); qui niente infrastruttura sproporzionata.
 * Nessun contenuto personale viene conservato nelle statistiche.
 */
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes } from 'node:crypto';

export type Db = ReturnType<typeof openDb>;

export function openDb(path: string) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS saved_plans (
      id TEXT PRIMARY KEY, edit_token TEXT NOT NULL, title TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, data TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS shares (
      token TEXT PRIMARY KEY, plan_id TEXT NOT NULL, created_at TEXT NOT NULL, revoked_at TEXT,
      redaction TEXT NOT NULL, data TEXT NOT NULL, allow_votes INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS votes (
      share_token TEXT NOT NULL, voter TEXT NOT NULL, option_id TEXT NOT NULL, created_at TEXT NOT NULL,
      PRIMARY KEY (share_token, voter)
    );
    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY, created_at TEXT NOT NULL, target_kind TEXT NOT NULL, target_id TEXT NOT NULL,
      field TEXT NOT NULL, message TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', resolution TEXT
    );
    CREATE TABLE IF NOT EXISTS overrides (
      kind TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL, note TEXT,
      PRIMARY KEY (kind, id)
    );
    CREATE TABLE IF NOT EXISTS audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, action TEXT NOT NULL, target TEXT NOT NULL, detail TEXT
    );
    CREATE TABLE IF NOT EXISTS stats (
      day TEXT NOT NULL, key TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, key)
    );
    CREATE TABLE IF NOT EXISTS ai_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, provider TEXT NOT NULL, model TEXT NOT NULL, purpose TEXT NOT NULL,
      input_tokens INTEGER, output_tokens INTEGER, latency_ms INTEGER, status TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS source_health (
      source_id TEXT PRIMARY KEY, checked_at TEXT NOT NULL, status TEXT NOT NULL, detail TEXT
    );
  `);
  const now = () => new Date().toISOString();
  const day = () => now().slice(0, 10);
  const id = (n = 12) => randomBytes(n).toString('base64url');

  return {
    raw: db,
    // ------------------------------------------------ piani salvati
    savePlan(data: unknown, title: string, existing?: { id: string; editToken: string }) {
      if (existing) {
        const row = db.prepare('SELECT edit_token, version FROM saved_plans WHERE id = ?').get(existing.id) as any;
        if (!row || row.edit_token !== existing.editToken) return null;
        db.prepare('UPDATE saved_plans SET data = ?, title = ?, updated_at = ?, version = version + 1 WHERE id = ?').run(JSON.stringify(data), title, now(), existing.id);
        return { id: existing.id, editToken: existing.editToken, version: row.version + 1 };
      }
      const pid = id(9), token = id(18);
      db.prepare('INSERT INTO saved_plans (id, edit_token, title, created_at, updated_at, data) VALUES (?, ?, ?, ?, ?, ?)').run(pid, token, title, now(), now(), JSON.stringify(data));
      return { id: pid, editToken: token, version: 1 };
    },
    getPlan(pid: string) {
      const row = db.prepare('SELECT id, title, created_at, updated_at, data, version FROM saved_plans WHERE id = ?').get(pid) as any;
      return row ? { id: row.id, title: row.title, createdAt: row.created_at, updatedAt: row.updated_at, version: row.version, data: JSON.parse(row.data) } : null;
    },
    deletePlan(pid: string, editToken: string) {
      const r = db.prepare('DELETE FROM saved_plans WHERE id = ? AND edit_token = ?').run(pid, editToken);
      if (r.changes) db.prepare("UPDATE shares SET revoked_at = ? WHERE plan_id = ? AND revoked_at IS NULL").run(now(), pid);
      return r.changes > 0;
    },
    checkEdit(pid: string, editToken: string) {
      const row = db.prepare('SELECT edit_token FROM saved_plans WHERE id = ?').get(pid) as any;
      return !!row && row.edit_token === editToken;
    },
    // ------------------------------------------------ condivisione revocabile
    createShare(planId: string, redaction: unknown, data: unknown, allowVotes: boolean) {
      const token = id(12);
      db.prepare('INSERT INTO shares (token, plan_id, created_at, redaction, data, allow_votes) VALUES (?, ?, ?, ?, ?, ?)').run(token, planId, now(), JSON.stringify(redaction), JSON.stringify(data), allowVotes ? 1 : 0);
      return token;
    },
    getShare(token: string) {
      const row = db.prepare('SELECT * FROM shares WHERE token = ?').get(token) as any;
      if (!row) return null;
      return { token: row.token, planId: row.plan_id, createdAt: row.created_at, revokedAt: row.revoked_at, redaction: JSON.parse(row.redaction), data: JSON.parse(row.data), allowVotes: !!row.allow_votes };
    },
    listShares(planId: string) {
      return (db.prepare('SELECT token, created_at, revoked_at, allow_votes FROM shares WHERE plan_id = ? ORDER BY created_at DESC').all(planId) as any[]).map((r) => ({ token: r.token, createdAt: r.created_at, revokedAt: r.revoked_at, allowVotes: !!r.allow_votes }));
    },
    revokeShare(token: string) {
      return db.prepare('UPDATE shares SET revoked_at = ? WHERE token = ? AND revoked_at IS NULL').run(now(), token).changes > 0;
    },
    vote(token: string, voter: string, optionId: string) {
      db.prepare('INSERT INTO votes (share_token, voter, option_id, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(share_token, voter) DO UPDATE SET option_id = excluded.option_id, created_at = excluded.created_at').run(token, voter, optionId, now());
    },
    tally(token: string) {
      return Object.fromEntries((db.prepare('SELECT option_id, COUNT(*) AS n FROM votes WHERE share_token = ? GROUP BY option_id').all(token) as any[]).map((r) => [r.option_id, r.n]));
    },
    // ------------------------------------------------ segnalazioni
    addReport(r: { targetKind: string; targetId: string; field: string; message: string }) {
      const rid = id(8);
      db.prepare('INSERT INTO reports (id, created_at, target_kind, target_id, field, message) VALUES (?, ?, ?, ?, ?, ?)').run(rid, now(), r.targetKind, r.targetId, r.field, r.message);
      return rid;
    },
    listReports(status?: string) {
      const rows = status ? db.prepare('SELECT * FROM reports WHERE status = ? ORDER BY created_at DESC').all(status) : db.prepare('SELECT * FROM reports ORDER BY created_at DESC LIMIT 500').all();
      return (rows as any[]).map((r) => ({ id: r.id, createdAt: r.created_at, targetKind: r.target_kind, targetId: r.target_id, field: r.field, message: r.message, status: r.status, resolution: r.resolution }));
    },
    resolveReport(rid: string, status: string, resolution: string) {
      return db.prepare('UPDATE reports SET status = ?, resolution = ? WHERE id = ?').run(status, resolution, rid).changes > 0;
    },
    // ------------------------------------------------ modifiche editoriali
    setOverride(kind: string, oid: string, data: unknown, note?: string) {
      db.prepare('INSERT INTO overrides (kind, id, data, updated_at, note) VALUES (?, ?, ?, ?, ?) ON CONFLICT(kind, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at, note = excluded.note').run(kind, oid, JSON.stringify(data), now(), note ?? null);
      db.prepare('INSERT INTO audit (ts, action, target, detail) VALUES (?, ?, ?, ?)').run(now(), 'override', `${kind}:${oid}`, note ?? null);
    },
    deleteOverride(kind: string, oid: string) {
      db.prepare('DELETE FROM overrides WHERE kind = ? AND id = ?').run(kind, oid);
      db.prepare('INSERT INTO audit (ts, action, target, detail) VALUES (?, ?, ?, ?)').run(now(), 'override-removed', `${kind}:${oid}`, null);
    },
    listOverrides() {
      return (db.prepare('SELECT * FROM overrides ORDER BY updated_at DESC').all() as any[]).map((r) => ({ kind: r.kind, id: r.id, data: JSON.parse(r.data), updatedAt: r.updated_at, note: r.note }));
    },
    audit(limit = 100) {
      return db.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT ?').all(limit);
    },
    // ------------------------------------------------ statistiche aggregate
    count(key: string, n = 1) {
      db.prepare('INSERT INTO stats (day, key, count) VALUES (?, ?, ?) ON CONFLICT(day, key) DO UPDATE SET count = count + excluded.count').run(day(), key, n);
    },
    stats(days = 30) {
      const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
      return db.prepare('SELECT day, key, count FROM stats WHERE day >= ? ORDER BY day, key').all(since) as { day: string; key: string; count: number }[];
    },
    // ------------------------------------------------ consumi AI
    logAi(u: { provider: string; model: string; purpose: string; inputTokens?: number; outputTokens?: number; latencyMs: number; status: string }) {
      db.prepare('INSERT INTO ai_usage (ts, provider, model, purpose, input_tokens, output_tokens, latency_ms, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(now(), u.provider, u.model, u.purpose, u.inputTokens ?? null, u.outputTokens ?? null, u.latencyMs, u.status);
    },
    aiTokensToday() {
      const r = db.prepare('SELECT COALESCE(SUM(COALESCE(input_tokens,0) + COALESCE(output_tokens,0)), 0) AS t FROM ai_usage WHERE ts >= ?').get(day()) as any;
      return Number(r.t);
    },
    aiUsage(days = 30) {
      const since = new Date(Date.now() - days * 86400_000).toISOString();
      return db.prepare('SELECT substr(ts,1,10) AS day, provider, model, purpose, status, COUNT(*) AS calls, SUM(input_tokens) AS input, SUM(output_tokens) AS output, AVG(latency_ms) AS avg_ms FROM ai_usage WHERE ts >= ? GROUP BY day, provider, model, purpose, status ORDER BY day').all(since);
    },
    // ------------------------------------------------ salute delle fonti
    setSourceHealth(sourceId: string, status: string, detail: string) {
      db.prepare('INSERT INTO source_health (source_id, checked_at, status, detail) VALUES (?, ?, ?, ?) ON CONFLICT(source_id) DO UPDATE SET checked_at = excluded.checked_at, status = excluded.status, detail = excluded.detail').run(sourceId, now(), status, detail);
    },
    sourceHealth() {
      return db.prepare('SELECT * FROM source_health').all() as { source_id: string; checked_at: string; status: string; detail: string }[];
    },
  };
}
