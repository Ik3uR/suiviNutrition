// Cible fixe : elle ne varie jamais selon l'effort.
export const TARGETS = { kcal: 2000, p: 130, g: 225, l: 65 };

export const MEALS = [
  { id: 'pdj', label: 'Petit-déj' },
  { id: 'dej', label: 'Déjeuner' },
  { id: 'col', label: 'Collation' },
  { id: 'din', label: 'Dîner' },
];
export const mealLabel = (id) => MEALS.find((m) => m.id === id)?.label ?? id;

export function mealForNow(d = new Date()) {
  const h = d.getHours() + d.getMinutes() / 60;
  if (h < 10.5) return 'pdj';
  if (h < 15) return 'dej';
  if (h < 18) return 'col';
  return 'din';
}

const z = (n) => String(n).padStart(2, '0');
export const dateStr = (d = new Date()) => `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
export const today = () => dateStr();
export function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(s, n) {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return dateStr(d);
}
/** Lundi de la semaine de la date s. */
export function weekStart(s) {
  const wd = (parseDate(s).getDay() + 6) % 7;
  return addDays(s, -wd);
}
export function fmtDay(s, opts = { weekday: 'long', day: 'numeric', month: 'long' }) {
  if (s === today()) return "Aujourd'hui";
  if (s === addDays(today(), -1)) return 'Hier';
  const t = parseDate(s).toLocaleDateString('fr-FR', opts);
  return t.charAt(0).toUpperCase() + t.slice(1);
}
export const fmtShort = (s) => parseDate(s).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' });

/** Valeurs nutritionnelles pour `grams` grammes, à partir des valeurs pour 100 g. */
export function macrosFor(per100, grams) {
  const k = grams / 100;
  return {
    kcal: (per100.kcal ?? 0) * k,
    p: (per100.p ?? 0) * k,
    g: (per100.g ?? 0) * k,
    l: (per100.l ?? 0) * k,
  };
}

export function sumMacros(list) {
  const t = { kcal: 0, p: 0, g: 0, l: 0 };
  for (const e of list) {
    t.kcal += e.kcal || 0;
    t.p += e.p || 0;
    t.g += e.g || 0;
    t.l += e.l || 0;
  }
  return t;
}

export const r0 = (n) => Math.round(n || 0);
export const r1 = (n) => Math.round((n || 0) * 10) / 10;
export const fmtNum = (n, d = 0) =>
  (n ?? 0).toLocaleString('fr-FR', { maximumFractionDigits: d, minimumFractionDigits: 0 });
export const round5 = (n) => Math.max(5, Math.round(n / 5) * 5);

/** Lit un nombre saisi au clavier (virgule acceptée). */
export function num(v) {
  if (v === '' || v == null) return null;
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** Écart à la cible : 'ok' (±10 %), 'warn' (±20 %), 'bad'. */
export function gapLevel(value, target) {
  const r = Math.abs(value / target - 1);
  if (r <= 0.1) return 'ok';
  if (r <= 0.2) return 'warn';
  return 'bad';
}

export const SOURCE_LABEL = {
  ciqual: 'Ciqual 2025 (ANSES)',
  off: 'Open Food Facts',
  perso: 'Étiquette (saisie perso)',
};
