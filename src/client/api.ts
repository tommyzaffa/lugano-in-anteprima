/** Client dell'API: richieste cancellabili, errori leggibili, piano in streaming. */
import type { GroupRequest, Plan, Decision, PlanDiff, InfeasibleResult, Contradiction } from '../shared/types.ts';

export class ApiError extends Error {
  status: number;
  code: string;
  data?: any;
  constructor(status: number, code: string, message: string, data?: any) {
    super(message);
    this.status = status; this.code = code; this.data = data;
  }
}

async function json<T>(res: Response): Promise<T> {
  let body: any = null;
  try { body = await res.json(); } catch { /* corpo non JSON */ }
  if (!res.ok) throw new ApiError(res.status, body?.error ?? 'http_error', body?.message ?? `Errore ${res.status}`, body);
  return body as T;
}

export async function get<T>(url: string, opts: { signal?: AbortSignal; headers?: Record<string, string> } = {}): Promise<T> {
  let res: Response;
  try { res = await fetch(url, { signal: opts.signal, headers: opts.headers }); }
  catch (e) { if ((e as Error).name === 'AbortError') throw e; throw new ApiError(0, 'network', 'Connessione non disponibile. Controllate la rete e riprovate.'); }
  return json<T>(res);
}

export async function send<T>(method: string, url: string, body: unknown, opts: { signal?: AbortSignal; headers?: Record<string, string> } = {}): Promise<T> {
  let res: Response;
  try { res = await fetch(url, { method, signal: opts.signal, headers: { 'Content-Type': 'application/json', ...(opts.headers ?? {}) }, body: body == null ? undefined : JSON.stringify(body) }); }
  catch (e) { if ((e as Error).name === 'AbortError') throw e; throw new ApiError(0, 'network', 'Connessione non disponibile. Controllate la rete e riprovate.'); }
  return json<T>(res);
}

export type PlanResult = (
  | { type: 'result'; status: 'ok'; alternatives: Plan[]; understood: string[]; notices: string[]; plannerSource: 'ai-live' | 'deterministic'; stats: Record<string, number>; demoMode: boolean }
  | { type: 'result'; status: 'needs_resolution'; contradictions: Contradiction[]; understood: string[] }
  | { type: 'result'; status: 'infeasible'; infeasible: InfeasibleResult; understood: string[]; notices: string[] }) & { areaAdvice?: import('../shared/area.ts').AreaAdvice };

/** Pianificazione in streaming NDJSON: callback di avanzamento, annullabile. */
export async function planStream(req: GroupRequest, onProgress: (step: string) => void, signal: AbortSignal): Promise<PlanResult> {
  let res: Response;
  try {
    res = await fetch('/api/plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req), signal });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError(0, 'network', 'Connessione non disponibile. Controllate la rete e riprovate.');
  }
  if (!res.ok || !res.body) return json<PlanResult>(res);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let result: PlanResult | null = null;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      const msg = JSON.parse(line);
      if (msg.type === 'progress') onProgress(msg.step);
      else if (msg.type === 'result') result = msg;
      else if (msg.type === 'error') throw new ApiError(500, 'planner_error', msg.message);
    }
  }
  if (!result) throw new ApiError(500, 'no_result', 'Risposta incompleta dal pianificatore.');
  return result;
}

export interface ReplanResponse { plan: Plan | null; diff: PlanDiff | null; explanation: string[]; hypothetical: boolean; ms: number }
export const replan = (plan: Plan, decision: Decision) => send<ReplanResponse>('POST', '/api/replan', { plan, decision });

export function track(key: string) {
  try { void fetch('/api/stats', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key }), keepalive: true }).catch(() => {}); } catch { /* statistiche non essenziali */ }
}
