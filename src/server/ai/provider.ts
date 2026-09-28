/**
 * Interfaccia neutrale rispetto al fornitore: la UI e il pianificatore non
 * dipendono da un modello specifico. Ogni fornitore restituisce oggetti già
 * validati con schema; il pianificatore resta la fonte di verità.
 */
import type { z } from 'zod';

export interface AiCallMeta { purpose: 'interpret' | 'propose' | 'narrate'; signal?: AbortSignal; maxTokens?: number; effort?: 'low' | 'medium' | 'high' }

export interface AiProvider {
  name: string;
  model: string;
  /** Chiede un oggetto conforme allo schema. Restituisce null se il modello rifiuta o l'output non è valido. */
  structured<T extends z.ZodType>(system: string, user: string, schema: T, meta: AiCallMeta): Promise<z.infer<T> | null>;
}
