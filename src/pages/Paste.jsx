import { useMemo, useState } from 'preact/hooks';
import { db } from '../db.js';
import { getFood, logFood, search } from '../foods.js';
import { Empty, Icon, NumInput, Segmented, Sheet, toast } from '../ui.jsx';
import { fmtNum, macrosFor, MEALS, mealForNow, num, r0, SOURCE_LABEL, sumMacros } from '../util.js';
import { shortName } from './Nutrition.jsx';

// Consigne à coller UNE fois dans les instructions d'un projet « Nutrition » de l'app Claude.
export const CLAUDE_PROMPT = `Tu reçois la photo d'un repas. Identifie chaque aliment visible et estime son poids en grammes.
Réponds UNIQUEMENT avec une ligne par aliment, au format :
nom de l'aliment ; grammes
Règles :
- précise toujours cru ou cuit pour le riz, les pâtes, les légumineuses, les pommes de terre, la viande et le poisson ;
- utilise des noms simples, comme dans une table de composition (ex. « riz blanc cuit », « filet de poulet grillé », « haricots verts cuits ») ;
- sépare les sauces et l'huile visibles sur une ligne à part ;
- aucune calorie, aucun commentaire, aucune autre ligne.`;

/** « - Riz cuit : 180 g » → { name: 'Riz cuit', grams: 180 } */
export function parseLines(text) {
  const out = [];
  for (let raw of text.split(/\n+/)) {
    let line = raw.replace(/^\s*([-*•·]|\d+[.)])\s*/, '').replace(/\*\*/g, '').trim();
    if (!line) continue;
    const m = [...line.matchAll(/(\d+(?:[.,]\d+)?)\s*(kg|g|gr|grammes?|ml|cl|l)?\b/gi)].pop();
    if (!m) continue;
    let grams = parseFloat(m[1].replace(',', '.'));
    const unit = (m[2] || 'g').toLowerCase();
    if (unit === 'kg' || unit === 'l') grams *= 1000;
    if (unit === 'cl') grams *= 10;
    const name = (line.slice(0, m.index) + ' ' + line.slice(m.index + m[0].length))
      .replace(/[;:=–—(),~≈]|environ|env\./gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (name && grams > 0) out.push({ name, grams: Math.round(grams) });
  }
  return out;
}

export function PasteSheet({ open, date, onClose }) {
  const [text, setText] = useState('');
  const [rows, setRows] = useState(null);
  const [meal, setMeal] = useState(mealForNow());

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(CLAUDE_PROMPT);
      toast('Consigne copiée');
    } catch {
      toast('Copie impossible : sélectionne le texte à la main');
    }
  };

  const analyse = (t) => {
    const lines = parseLines(t);
    setRows(
      lines.map((l) => {
        const cands = search(l.name, new Map(), 8);
        return { ...l, cands, foodId: cands[0]?.id ?? null, grams: String(l.grams), open: false };
      }),
    );
  };

  const pasteNow = async () => {
    try {
      const t = await navigator.clipboard.readText();
      setText(t);
      analyse(t);
    } catch {
      toast('Colle le texte dans le champ (appui long → Coller)');
    }
  };

  const reset = () => {
    setText('');
    setRows(null);
  };

  const close = () => {
    reset();
    onClose();
  };

  const valid = (rows || []).filter((r) => r.foodId && num(r.grams) > 0);
  const total = sumMacros(valid.map((r) => macrosFor(getFood(r.foodId), num(r.grams))));

  const addAll = async () => {
    const ids = [];
    for (const r of valid) ids.push(await logFood(getFood(r.foodId), num(r.grams), { meal, date, origin: 'photo' }));
    toast(`${ids.length} aliments ajoutés`, { label: 'Annuler', run: () => db.entries.bulkDelete(ids) });
    close();
  };

  const upd = (i, patch) => setRows(rows.map((r, n) => (n === i ? { ...r, ...patch } : r)));

  return (
    <Sheet open={open} title="Photo analysée par Claude" onClose={close} full>
      {!rows && (
        <>
          <ol class="steps">
            <li>
              Une seule fois : dans l'app Claude, crée un projet « Nutrition » et colle cette consigne dans ses instructions.
              <button class="btn ghost small-btn" onClick={copyPrompt}><Icon name="paste" size={16} /> Copier la consigne</button>
            </li>
            <li>Dans ce projet, envoie la photo de ton assiette, puis copie la réponse.</li>
            <li>Reviens ici et touche « Coller la réponse ».</li>
          </ol>
          <button class="btn primary block" onClick={pasteNow}>Coller la réponse</button>
          <textarea
            class="text-area"
            rows={5}
            placeholder={'ou colle ici, ex. :\npoulet grillé ; 120\nriz blanc cuit ; 180\nharicots verts cuits ; 100'}
            value={text}
            onInput={(e) => setText(e.currentTarget.value)}
          />
          {text.trim() && <button class="btn block" onClick={() => analyse(text)}>Analyser</button>}
          <p class="muted small">Claude ne donne que les aliments et les grammes. Les calories viennent de Ciqual.</p>
        </>
      )}

      {rows && (
        <>
          {!rows.length && <Empty>Aucune ligne « aliment ; grammes » trouvée dans le texte.</Empty>}
          <div class="paste-rows">
            {rows.map((r, i) => (
              <PasteRow key={i} row={r} onChange={(p) => upd(i, p)} onRemove={() => setRows(rows.filter((_, n) => n !== i))} />
            ))}
          </div>
          <Segmented small options={MEALS} value={meal} onChange={setMeal} />
          <button class="btn primary block" disabled={!valid.length} onClick={addAll}>
            Tout ajouter · {fmtNum(r0(total.kcal))} kcal · P {fmtNum(r0(total.p))} g
          </button>
          <button class="btn ghost block" onClick={reset}>Recommencer</button>
        </>
      )}
    </Sheet>
  );
}

function PasteRow({ row, onChange, onRemove }) {
  const [q, setQ] = useState('');
  const food = row.foodId && getFood(row.foodId);
  const g = num(row.grams);
  const list = useMemo(() => (q.trim().length >= 2 ? search(q, new Map(), 8) : row.cands), [q, row.cands]);
  return (
    <div class={'paste-row' + (food ? '' : ' missing')}>
      <div class="paste-top">
        <span class="paste-claude">Claude : « {row.name} »</span>
        <button class="icon-btn small" onClick={onRemove} aria-label="Retirer"><Icon name="close" size={18} /></button>
      </div>
      <div class="paste-main">
        <button class="paste-food" onClick={() => onChange({ open: !row.open })}>
          {food ? shortName(food.name) : 'Aucune correspondance : choisir'}
          <Icon name={row.open ? 'minus' : 'edit'} size={16} />
        </button>
        <NumInput value={row.grams} onInput={(v) => onChange({ grams: v })} suffix="g" />
      </div>
      {food && g > 0 && <span class="muted small">{fmtNum(r0(macrosFor(food, g).kcal))} kcal · P {fmtNum(r0(macrosFor(food, g).p))} g · {SOURCE_LABEL[food.source]}</span>}
      {row.open && (
        <div class="paste-pick">
          <input class="text-input" placeholder="Chercher un autre aliment…" value={q} onInput={(e) => setQ(e.currentTarget.value)} />
          {list.map((f) => (
            <button key={f.id} class={'food-row compact' + (f.id === row.foodId ? ' on' : '')} onClick={() => { onChange({ foodId: f.id, open: false }); setQ(''); }}>
              <span class="food-name">{f.name}</span>
              <span class="food-sub">{fmtNum(f.kcal)} kcal/100 g</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
