import { tx, getLocale } from '../locale.ts';
import { useApp } from '../store.ts';
import LocationPicker from './LocationPicker.tsx';

export default function AreaPicker() {
  const d = useApp((s) => s.draft)!;
  const setDraft = useApp((s) => s.setDraft);
  const areas = useApp((s) => s.meta?.areas ?? []);
  const selected = d.area;
  const current = selected && areas.find((a) => a.lon === selected.center.lon && a.lat === selected.center.lat);
  return <fieldset className="area-picker field">
    <legend>{tx("Dove volete trascorrere la giornata?")}</legend>
    <p className="hint">{tx("La zona delle attività è indipendente dal punto di partenza. Gli spostamenti possono attraversare altre zone.")}</p>
    <select aria-label={tx("Zona dell’itinerario")} value={!selected ? 'any' : current?.id ?? 'custom'} onChange={(e) => {
      const a = areas.find((a) => a.id === e.target.value);
      setDraft((x) => ({ ...x, area: e.target.value === 'any' ? null : { center: a ? { kind: 'point', label: a.label, lon: a.lon, lat: a.lat } : x.start, radiusKm: x.area?.radiusKm ?? 2 } }));
    }}>
      <option value="any">{tx("Ovunque nella mappa")}</option>
      <option value="custom">{tx("Vicino a un punto a scelta")}</option>
      {tx(areas.map((a) => <option key={a.id} value={a.id}>{tx(a.label)}</option>))}
    </select>
    {tx(selected && <>
      {tx(!current && <LocationPicker id="area-center" value={selected.center} onChange={(center) => setDraft((x) => ({ ...x, area: { center, radiusKm: x.area?.radiusKm ?? 2 } }))} />)}
      <label htmlFor="area-radius">{tx("Dintorni inclusi")}</label>
      <select id="area-radius" value={selected.radiusKm} onChange={(e) => setDraft((x) => ({ ...x, area: { ...x.area!, radiusKm: Number(e.target.value) } }))}>
        {tx([0.5, 1, 2, 3, 5, 10, 15].map((r) => <option key={r} value={r}>{tx(`${r} km`)}</option>))}
        {tx(![0.5, 1, 2, 3, 5, 10, 15].includes(selected.radiusKm) && <option value={selected.radiusKm}>{tx(`${selected.radiusKm} km`)}</option>)}
      </select>
      <p className="hint">{tx("Le tappe resteranno entro questo raggio. Se non ci sono eventi compatibili, vi proporremo zone vicine prima di cambiare destinazione.")}</p>
    </>)}
  </fieldset>;
}
