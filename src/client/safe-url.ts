/** External catalog links must never become executable or local URLs. */
export function safeUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return;
  try { const u = new URL(value); return ['https:', 'http:', 'tel:'].includes(u.protocol) ? u.href : undefined; } catch { return; }
}
