/**
 * Modifiche editoriali: applicazione validata e rilevamento dei conflitti
 * con il dato di base (brief: «le modifiche manuali non vengono perse in
 * silenzio da un aggiornamento automatico»).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { DataStore, baseHash } from '../src/server/data.ts';
import { openDb } from '../src/server/db.ts';

let data: DataStore;
beforeAll(() => { data = new DataStore(); data.load(); });

describe('modifiche editoriali', () => {
  it('una modifica valida viene applicata e cambia la versione del catalogo', () => {
    const db = openDb(':memory:');
    const id = 'parco-ciani';
    db.setOverride('place', id, { name: 'Parco Ciani (verificato)', _baseHash: baseHash(data.basePlace(id)) }, 'test');
    data.applyOverrides(db);
    expect(data.place(id)?.name).toBe('Parco Ciani (verificato)');
    expect(data.catalogVersion).toMatch(/\+ed1$/);
    expect(data.conflicts).toHaveLength(0);
    data.applyOverrides();
  });

  it('se il dato di base è cambiato dopo la modifica, il conflitto è segnalato', () => {
    const db = openDb(':memory:');
    db.setOverride('place', 'parco-ciani', { name: 'Parco Ciani bis', _baseHash: 'impronta-vecchia' }, 'test');
    data.applyOverrides(db);
    expect(data.conflicts.map((c) => c.id)).toContain('parco-ciani');
    data.applyOverrides();
  });

  it('una modifica non valida per lo schema è ignorata e segnalata, non pubblicata', () => {
    const db = openDb(':memory:');
    db.setOverride('place', 'parco-ciani', { lon: 'non-un-numero' }, 'test');
    data.applyOverrides(db);
    expect(typeof data.place('parco-ciani')?.lon).toBe('number');
    expect(data.conflicts.some((c) => c.id === 'parco-ciani' && /schema/.test(c.note))).toBe(true);
    data.applyOverrides();
  });

  it('una modifica su un luogo non più presente è segnalata', () => {
    const db = openDb(':memory:');
    db.setOverride('place', 'luogo-sparito', { name: 'x' }, 'test');
    data.applyOverrides(db);
    expect(data.conflicts.some((c) => c.id === 'luogo-sparito')).toBe(true);
    data.applyOverrides();
  });

  it('nascondere un luogo lo toglie dal catalogo pubblicato', () => {
    const db = openDb(':memory:');
    db.setOverride('place', 'parco-ciani', { hidden: true }, 'test');
    data.applyOverrides(db);
    expect(data.place('parco-ciani')).toBeUndefined();
    data.applyOverrides();
    expect(data.place('parco-ciani')).toBeDefined();
  });
});
