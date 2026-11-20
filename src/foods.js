import { db } from './db.js';
import { macrosFor, mealForNow, round5, today } from './util.js';

// ---------- Chargement de la base d'aliments ----------
let ciqual = [];
let custom = [];
const byId = new Map();
let groups = {};
let loading = null;

export function loadFoods() {
  if (!loading) {
    loading = (async () => {
      const res = await fetch(import.meta.env.BASE_URL + 'ciqual.json');
      const d = await res.json();
      groups = d.groups;
      ciqual = d.foods.map(([code, name, grp, kcal, p, g, l, fib, suc, sel]) =>
        index({ id: 'c' + code, code, name, grp, kcal, p, g, l, fib, suc, sel, source: 'ciqual' }),
      );
      for (const f of ciqual) byId.set(f.id, f);
      await refreshCustom();
    })();
  }
  return loading;
}

export async function refreshCustom() {
  for (const f of custom) byId.delete(f.id);
  custom = (await db.customFoods.toArray()).map(index);
  for (const f of custom) byId.set(f.id, f);
}

export const getFood = (id) => byId.get(id);
export const groupName = (grp) => groups[grp] ?? '';

// ---------- Recherche tolérante (accents, fautes, pluriels) ----------
export function norm(s) {
  return s
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
const STOP = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'l', 'd', 'au', 'aux', 'a', 'en', 'et', 'un', 'une', 'avec']);
const stem = (t) => (t.length > 3 ? t.replace(/(s|x)$/, '') : t);
const tokens = (s) => norm(s).split(' ').filter(Boolean);

// Mots qui n'aident pas à distinguer les aliments : ne pénalisent pas les noms longs.
const NOISE = new Set(['sans', 'sel', 'ajoute', 'chair', 'peau', 'aliment', 'moyen', 'precision', 'sur', 'teneur', 'eau', 'standard', 'ou', 'ex']);
const BASIC = /^0[2-5]|^09/; // légumes, féculents, viandes, poissons, laitiers, matières grasses

function index(f) {
  f.tok = tokens(f.name).map(stem);
  let w = 0;
  for (const t of f.tok) if (!NOISE.has(t) && !STOP.has(t)) w++;
  // bonus/malus de « simplicité » calculé une seule fois
  f.base = -w * 0.12;
  if (f.source === 'ciqual') {
    if (BASIC.test(f.grp)) f.base += 0.4;
    if (/^01|^11/.test(f.grp)) f.base -= 0.5; // plats composés, alimentation infantile
    if (f.tok.some((t) => t.startsWith('preemball'))) f.base -= 0.5;
  } else f.base += 0.5;
  return f;
}

// Synonymes courants → nom utilisé par Ciqual
const ALIASES = [
  [/\bcreme fraiche\b/, 'creme mg epaisse'],
  [/^pates?\b(?! (a|brisee|sablee|feuilletee|pizza|tartiner|amande|fruit))/, 'pates seches'],
  [/\bpatates?\b|\bpdt\b/, 'pomme de terre'],
  [/^steak\b(?! de)/, 'boeuf steak'],
  [/\bblanc de poulet\b/, 'poulet filet'],
  [/\bblanc de dinde\b/, 'dinde escalope'],
];

function lev(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2 = null;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      // lettres inversées (ex. « pouelt » → « poulet ») = 1 seule faute
      if (prev2 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) cur[j] = Math.min(cur[j], prev2[j - 2] + 1);
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[b.length];
}

function tokScore(q, t) {
  if (t === q) return 3;
  if (t.startsWith(q)) return 2 + (q.length / t.length) * 0.5;
  if (q.length >= 4) {
    const max = q.length >= 7 ? 2 : 1;
    if (lev(q, t, max) <= max) return 1.6;
    if (t.length > q.length && lev(q, t.slice(0, q.length), max) <= max) return 1.2;
  }
  if (q.length >= 3 && t.includes(q)) return 1;
  return 0;
}

function scoreFood(f, qt, meta) {
  let s = 0;
  for (const q of qt) {
    let best = 0;
    for (let i = 0; i < f.tok.length; i++) {
      let v = tokScore(q, f.tok[i]);
      if (v && i === 0) v += 1; // le nom commence par le mot cherché
      if (v > best) best = v;
    }
    if (!best) return 0;
    s += best;
  }
  s += f.base; // aliments simples d'abord
  if (meta) {
    if (meta.fav) s += 4;
    if (meta.uses) s += Math.min(3, Math.log2(1 + meta.uses));
  }
  return s;
}

function queryTokens(q) {
  let qt = tokens(q).map(stem);
  const useful = qt.filter((t) => !STOP.has(t));
  return useful.length ? useful : qt;
}

export function search(query, metaMap = new Map(), limit = 40) {
  const nq = norm(query);
  const variants = [[queryTokens(nq), 0]];
  for (const [re, rep] of ALIASES) if (re.test(nq)) variants.push([queryTokens(nq.replace(re, rep)), 0.5]);
  if (!variants[0][0].length) return [];
  const best = new Map();
  for (const list of [custom, ciqual]) {
    for (const f of list) {
      const meta = metaMap.get(f.id);
      for (const [qt, bonus] of variants) {
        const s = scoreFood(f, qt, meta);
        if (s > 0 && s + bonus > (best.get(f) ?? 0)) best.set(f, s + bonus);
      }
    }
  }
  const ranked = [...best].sort((a, b) => b[1] - a[1]).slice(0, limit).map((x) => x[0]);
  return pairCrudeCooked(ranked);
}

// Range la version cuite juste après la version crue (et inversement) : « Riz blanc, cru » puis « Riz blanc, cuit ».
const COOK_WORDS = /\b(cru|crue|crus|crues|cuit|cuite|cuits|cuites|sec|seche|secs|seches|sans sel ajoute|bouilli|bouillie|bouillis|a l eau)\b/g;
function pairCrudeCooked(list) {
  const key = (f) => norm(f.name).replace(COOK_WORDS, ' ').replace(/\s+/g, ' ').trim();
  const groups = new Map();
  for (const f of list) {
    const k = key(f);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(f);
  }
  return [...groups.values()].flat();
}

// ---------- Portions (petite / normale / grosse) ----------
// Portion « normale » par défaut selon le sous-groupe Ciqual, en grammes.
// [cru/sec, cuit] pour les féculents et légumineuses.
const PORTION = {
  '0101': 200, '0102': 250, '0103': 300, '0104': 200, '0105': 200, '0106': 100,
  '0201': 150, '0202': 180, '0203': [60, 150], '0204': 130, '0205': 25,
  '0301': [80, 180], '0302': 50, '0303': 30, '0304': 30, '0305': 50,
  '0401': 120, '0402': 120, '0403': 40, '0404': 60,
  '0405': 130, '0406': 130, '0407': 120, '0408': 120, '0409': 80, '0410': 100,
  '0501': 250, '0502': 125, '0503': 30, '0504': 20,
  '0601': 250, '0602': 250, '0603': 150,
  '0701': 10, '0702': 20, '0703': 20, '0704': 20, '0705': 60, '0706': 25, '0707': 40,
  '0708': 25, '0709': 80, '08': 80, '0801': 80, '0802': 80, '0803': 80,
  '0901': 10, '0902': 10, '0903': 10, '0904': 5, '0905': 10,
  '1001': 20, '1002': 10, '1003': 10, '1004': 2, '1005': 2, '1006': 5, '1007': 5,
  '1008': 30, '1009': 30, '1010': 30,
};

export function isRaw(name) {
  return /\b(cru|crue|crus|crues|sec|seche|secs|seches|deshydrate)\b/.test(norm(name));
}

export function normalPortion(food, meta) {
  if (meta?.portion) return meta.portion;
  if (food.portion) return food.portion;
  const p = PORTION[food.grp] ?? PORTION[food.grp?.slice(0, 2)] ?? 100;
  if (Array.isArray(p)) return isRaw(food.name) ? p[0] : p[1];
  return p;
}

export const SIZES = [
  { id: 'petite', label: 'Petite', k: 0.7 },
  { id: 'normale', label: 'Normale', k: 1 },
  { id: 'grosse', label: 'Grosse', k: 1.4 },
];
export const sizeGrams = (normal, k) => (k === 1 ? normal : round5(normal * k));

// ---------- Enregistrement d'une consommation ----------
export function per100(food) {
  return { kcal: food.kcal, p: food.p, g: food.g, l: food.l };
}

export async function logFood(food, grams, { meal = mealForNow(), date = today(), origin = 'manuel' } = {}) {
  const m = macrosFor(per100(food), grams);
  const id = await db.entries.add({
    date,
    meal,
    foodId: food.id,
    name: food.name,
    source: food.source,
    per100: per100(food),
    grams,
    ...m,
    origin,
    ts: Date.now(),
  });
  await touchMeta(food.id);
  return id;
}

export async function touchMeta(id) {
  const meta = (await db.foodMeta.get(id)) ?? { id, uses: 0, fav: 0 };
  meta.uses = (meta.uses || 0) + 1;
  meta.lastUsed = Date.now();
  await db.foodMeta.put(meta);
}

export async function updateMeta(id, patch) {
  const meta = (await db.foodMeta.get(id)) ?? { id, uses: 0, fav: 0 };
  await db.foodMeta.put({ ...meta, ...patch });
}

// ---------- Aliments perso / Open Food Facts ----------
export async function saveCustomFood(f) {
  await db.customFoods.put(f);
  await refreshCustom();
  return getFood(f.id);
}

const OFF_FIELDS = 'code,product_name,product_name_fr,brands,quantity,nutriments,serving_quantity';

function offToFood(p) {
  const n = p.nutriments || {};
  const kcal = n['energy-kcal_100g'] ?? (n['energy_100g'] != null ? n['energy_100g'] / 4.184 : null);
  if (kcal == null) return null;
  const name = [p.product_name_fr || p.product_name, p.brands?.split(',')[0]].filter(Boolean).join(' · ');
  return {
    id: 'o' + p.code,
    barcode: p.code,
    name: name || `Produit ${p.code}`,
    source: 'off',
    kcal: Math.round(kcal),
    p: n.proteins_100g ?? null,
    g: n.carbohydrates_100g ?? null,
    l: n.fat_100g ?? null,
    fib: n.fiber_100g ?? null,
    suc: n.sugars_100g ?? null,
    sel: n.salt_100g ?? null,
    portion: p.serving_quantity ? Math.round(+p.serving_quantity) || null : null,
  };
}

export async function offByBarcode(code) {
  const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${OFF_FIELDS}`);
  if (!res.ok) return null;
  const d = await res.json();
  if (d.status !== 1 || !d.product) return null;
  return offToFood({ ...d.product, code: d.product.code || code });
}

export async function offSearch(q) {
  const url =
    'https://world.openfoodfacts.org/cgi/search.pl?search_simple=1&json=1&page_size=25&lc=fr&cc=fr' +
    `&fields=${OFF_FIELDS}&search_terms=${encodeURIComponent(q)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Open Food Facts ne répond pas.');
  const d = await res.json();
  return (d.products || []).map(offToFood).filter(Boolean);
}
