/** Preferiti e posti già visitati: solo su questo dispositivo, nessun account. */
import { create } from 'zustand';

function load(k: string): string[] { try { return JSON.parse(localStorage.getItem(k) ?? '[]'); } catch { return []; } }
function save(k: string, v: string[]) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* archiviazione non disponibile */ } }

interface Personal { favs: string[]; visited: string[]; toggleFav: (id: string) => void; toggleVisited: (id: string) => void }
export const usePersonal = create<Personal>((set, get) => ({
  favs: load('lia.favs'),
  visited: load('lia.visited'),
  toggleFav: (id) => { const v = get().favs.includes(id) ? get().favs.filter((x) => x !== id) : [...get().favs, id]; save('lia.favs', v); set({ favs: v }); },
  toggleVisited: (id) => { const v = get().visited.includes(id) ? get().visited.filter((x) => x !== id) : [...get().visited, id]; save('lia.visited', v); set({ visited: v }); },
}));
