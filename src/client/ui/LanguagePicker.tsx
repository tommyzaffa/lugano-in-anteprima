import { setLocale, useLocale } from '../locale.ts';
export default function LanguagePicker() {
  const locale = useLocale();
  return <label className="language-picker"><span aria-hidden="true">◎</span><select aria-label="Language / Lingua / Langue / Sprache" value={locale} onChange={(e) => setLocale(e.target.value)}>
    <option value="it">Italiano</option><option value="en">English</option><option value="fr">Français</option><option value="de">Deutsch</option>
  </select></label>;
}
