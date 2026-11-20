import Dexie, { liveQuery } from 'dexie';
import { useEffect, useState } from 'preact/hooks';

// Toutes les données restent dans le téléphone (IndexedDB).
export const db = new Dexie('suivi-nutrition');

db.version(1).stores({
  entries: '++id, date, foodId', // aliments consommés
  foodMeta: 'id, lastUsed', // favoris, récents, portion normale retenue
  customFoods: 'id, barcode', // produits Open Food Facts + saisies perso
  templates: '++id', // repas types
  sessions: '++id, date, type', // séances d'effort
  exercises: 'id', // liste d'exercices
  weights: 'date', // pesées
  settings: 'key',
});

export const DEFAULT_EXERCISES = [
  { id: 'tractions', name: 'Tractions', kind: 'reps', cat: 'Barre' },
  { id: 'dips', name: 'Dips', kind: 'reps', cat: 'Barre' },
  { id: 'releves-jambes', name: 'Relevés de jambes (barre)', kind: 'reps', cat: 'Barre' },
  { id: 'pompes', name: 'Pompes', kind: 'reps', cat: 'Poids du corps' },
  { id: 'gainage', name: 'Gainage', kind: 'time', cat: 'Poids du corps' },
  { id: 'dev-sol', name: 'Développé haltères au sol', kind: 'reps', cat: 'Haltères' },
  { id: 'rowing', name: 'Rowing haltère', kind: 'reps', cat: 'Haltères' },
  { id: 'squat-goblet', name: 'Squat goblet', kind: 'reps', cat: 'Haltères' },
  { id: 'fentes', name: 'Fentes haltères', kind: 'reps', cat: 'Haltères' },
  { id: 'sdt-jt', name: 'Soulevé de terre jambes tendues', kind: 'reps', cat: 'Haltères' },
  { id: 'elev-lat', name: 'Élévations latérales', kind: 'reps', cat: 'Haltères' },
  { id: 'dev-epaules', name: 'Développé épaules haltères', kind: 'reps', cat: 'Haltères' },
  { id: 'curl', name: 'Curl biceps', kind: 'reps', cat: 'Haltères' },
  { id: 'ext-triceps', name: 'Extension triceps haltère', kind: 'reps', cat: 'Haltères' },
];

db.on('populate', (tx) => {
  tx.table('exercises').bulkAdd(DEFAULT_EXERCISES);
});

/** Hook : relit automatiquement la requête quand la base change. */
export function useLive(fn, deps = [], initial) {
  const [value, setValue] = useState(initial);
  useEffect(() => {
    const sub = liveQuery(fn).subscribe({ next: setValue, error: (e) => console.error(e) });
    return () => sub.unsubscribe();
  }, deps);
  return value;
}

export async function getSetting(key, fallback = null) {
  const row = await db.settings.get(key);
  return row ? row.value : fallback;
}
export const setSetting = (key, value) => db.settings.put({ key, value });

export async function latestWeight() {
  const w = await db.weights.orderBy('date').last();
  return w?.kg ?? null;
}

// ---- Sauvegarde : export / import JSON ----
const TABLES = ['entries', 'foodMeta', 'customFoods', 'templates', 'sessions', 'exercises', 'weights', 'settings'];

export async function exportAll() {
  const data = { app: 'suivi-nutrition', version: 1, exportedAt: new Date().toISOString(), tables: {} };
  for (const t of TABLES) data.tables[t] = await db.table(t).toArray();
  return data;
}

export async function importAll(data) {
  if (data?.app !== 'suivi-nutrition' || !data.tables) throw new Error("Ce fichier n'est pas une sauvegarde de l'app.");
  await db.transaction('rw', TABLES.map((t) => db.table(t)), async () => {
    for (const t of TABLES) {
      await db.table(t).clear();
      if (data.tables[t]?.length) await db.table(t).bulkPut(data.tables[t]);
    }
  });
}
