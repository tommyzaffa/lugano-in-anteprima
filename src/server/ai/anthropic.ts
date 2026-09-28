/**
 * Fornitore Anthropic (Claude) tramite l'SDK ufficiale @anthropic-ai/sdk.
 * - output strutturato validato con schema zod (messages.parse + betaZodOutputFormat);
 * - fallback lato server in caso di rifiuto (fallbacks: "default");
 * - timeout, retry limitati, registrazione dei consumi senza contenuti.
 */
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { z } from 'zod';
import type { AiProvider, AiCallMeta } from './provider.ts';
import { config } from '../config.ts';
import type { Db } from '../db.ts';

export function anthropicProvider(db: Db): AiProvider {
  const client = new Anthropic({
    ...(config.ai.anthropicKey ? { apiKey: config.ai.anthropicKey } : {}),
    maxRetries: config.ai.maxRetries,
    timeout: config.ai.timeoutMs,
  });
  const model = config.ai.anthropicModel;
  // i fallback lato server sono disponibili sui modelli con classificatori di sicurezza (Opus 5, Fable)
  const supportsFallback = /^claude-(opus-5|fable)/.test(model);
  return {
    name: 'anthropic',
    model,
    async structured<T extends z.ZodType>(system: string, user: string, schema: T, meta: AiCallMeta) {
      if (db.aiTokensToday() > config.ai.dailyTokenBudget) {
        db.logAi({ provider: 'anthropic', model, purpose: meta.purpose, latencyMs: 0, status: 'daily_budget_exceeded' });
        return null;
      }
      const t0 = Date.now();
      try {
        const response = await client.beta.messages.parse({
          model,
          max_tokens: meta.maxTokens ?? config.ai.maxTokens,
          system,
          messages: [{ role: 'user', content: user }],
          output_config: { format: betaZodOutputFormat(schema), effort: meta.effort ?? 'low' },
          ...(supportsFallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
        }, { signal: meta.signal, timeout: config.ai.timeoutMs });
        const status = response.stop_reason === 'refusal' ? 'refusal' : response.stop_reason === 'max_tokens' ? 'max_tokens' : 'ok';
        db.logAi({ provider: 'anthropic', model: response.model, purpose: meta.purpose, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens, latencyMs: Date.now() - t0, status });
        if (status !== 'ok') return null;
        return (response.parsed_output ?? null) as z.infer<T> | null;
      } catch (err) {
        let status = 'error';
        if (err instanceof Anthropic.AuthenticationError) status = 'auth_error';
        else if (err instanceof Anthropic.RateLimitError) status = 'rate_limited';
        else if (err instanceof Anthropic.BadRequestError) status = 'bad_request';
        else if (err instanceof Anthropic.APIConnectionTimeoutError) status = 'timeout';
        else if (err instanceof Anthropic.APIConnectionError) status = 'connection_error';
        else if (err instanceof Anthropic.APIError) status = `api_error_${err.status}`;
        else if ((err as Error).name === 'AbortError') status = 'aborted';
        db.logAi({ provider: 'anthropic', model, purpose: meta.purpose, latencyMs: Date.now() - t0, status });
        db.setSourceHealth('ai', 'error', status);
        throw err;
      }
    },
  };
}
