import { useState } from 'preact/hooks';
import { saveCustomFood } from '../foods.js';
import { NumInput, Sheet } from '../ui.jsx';
import { num } from '../util.js';

/** Aliment absent des bases : valeurs recopiées depuis l'étiquette (pour 100 g). */
export function CustomFoodSheet({ init, onClose, onSaved }) {
  if (!init) return null;
  return <Form init={init} onClose={onClose} onSaved={onSaved} />;
}

function Form({ init, onClose, onSaved }) {
  const [f, setF] = useState({ name: init.name || '', kcal: '', p: '', g: '', l: '', portion: '' });
  const set = (k) => (v) => setF({ ...f, [k]: v });
  const ok = f.name.trim() && num(f.kcal) != null && num(f.p) != null && num(f.g) != null && num(f.l) != null;

  const save = async () => {
    const id = init.barcode ? 'o' + init.barcode : 'p' + Date.now().toString(36);
    const food = await saveCustomFood({
      id,
      barcode: init.barcode ?? null,
      name: f.name.trim(),
      source: 'perso',
      kcal: num(f.kcal),
      p: num(f.p),
      g: num(f.g),
      l: num(f.l),
      portion: num(f.portion) || null,
      createdAt: Date.now(),
    });
    onSaved(food);
  };

  return (
    <Sheet open title="Nouvel aliment (étiquette)" onClose={onClose}>
      {init.barcode && <p class="muted small">Code {init.barcode} inconnu d'Open Food Facts.</p>}
      <input class="text-input" placeholder="Nom du produit" value={f.name} onInput={(e) => set('name')(e.currentTarget.value)} />
      <p class="muted small">Valeurs pour 100 g, recopiées de l'emballage :</p>
      <div class="grid2">
        <NumInput value={f.kcal} onInput={set('kcal')} placeholder="Énergie" suffix="kcal" />
        <NumInput value={f.p} onInput={set('p')} placeholder="Protéines" suffix="g" />
        <NumInput value={f.g} onInput={set('g')} placeholder="Glucides" suffix="g" />
        <NumInput value={f.l} onInput={set('l')} placeholder="Lipides" suffix="g" />
      </div>
      <NumInput value={f.portion} onInput={set('portion')} placeholder="Portion habituelle (facultatif)" suffix="g" />
      <button class="btn primary block" disabled={!ok} onClick={save}>Enregistrer et choisir la portion</button>
    </Sheet>
  );
}
