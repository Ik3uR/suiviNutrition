import { useMemo, useRef, useState } from 'preact/hooks';
import { db, useLive } from '../db.js';
import { getFood, groupName, logFood, normalPortion, offSearch, saveCustomFood, search, SIZES, sizeGrams, updateMeta } from '../foods.js';
import { Bar, Empty, Icon, NumInput, Segmented, Sheet, toast } from '../ui.jsx';
import {
  addDays, fmtDay, fmtNum, macrosFor, MEALS, mealForNow, mealLabel, num, r0, r1, SOURCE_LABEL, sumMacros, TARGETS, today,
} from '../util.js';
import { PasteSheet } from './Paste.jsx';
import { ScanSheet } from './Scan.jsx';
import { CustomFoodSheet } from './CustomFood.jsx';

export function Nutrition() {
  const [date, setDate] = useState(today());
  const [q, setQ] = useState('');
  const [searching, setSearching] = useState(false);
  const [foodSheet, setFoodSheet] = useState(null); // aliment choisi
  const [entrySheet, setEntrySheet] = useState(null);
  const [tplSheet, setTplSheet] = useState(null);
  const [saveTpl, setSaveTpl] = useState(null); // repas à enregistrer comme type
  const [paste, setPaste] = useState(false);
  const [scan, setScan] = useState(false);
  const [custom, setCustom] = useState(null);
  const inputRef = useRef();

  const entries = useLive(() => db.entries.where('date').equals(date).sortBy('ts'), [date], []);
  const metaList = useLive(() => db.foodMeta.toArray(), [], []);
  const templates = useLive(() => db.templates.toArray(), [], []);
  const metaMap = useMemo(() => new Map(metaList.map((m) => [m.id, m])), [metaList]);

  const totals = sumMacros(entries);
  const results = useMemo(() => (q.trim().length >= 2 ? search(q, metaMap) : []), [q, metaMap]);

  // Raccourcis : favoris puis récents
  const shortcuts = useMemo(() => {
    const favs = metaList.filter((m) => m.fav).sort((a, b) => (b.uses || 0) - (a.uses || 0));
    const recents = metaList.filter((m) => !m.fav && m.lastUsed).sort((a, b) => b.lastUsed - a.lastUsed);
    return [...favs, ...recents].map((m) => getFood(m.id)).filter(Boolean).slice(0, 16);
  }, [metaList]);

  const closeSearch = () => {
    setQ('');
    setSearching(false);
    inputRef.current?.blur();
  };

  const openFood = (food) => setFoodSheet(food);

  const onLogged = () => {
    setFoodSheet(null);
    closeSearch();
  };

  return (
    <div class="page">
      <header class="sticky">
        {!searching && (
          <>
            <div class="date-nav">
              <button class="icon-btn" onClick={() => setDate(addDays(date, -1))} aria-label="Jour précédent">
                <Icon name="left" />
              </button>
              <button class="date-label" onClick={() => setDate(today())}>{fmtDay(date)}</button>
              <button class="icon-btn" onClick={() => setDate(addDays(date, 1))} aria-label="Jour suivant" disabled={date >= today()}>
                <Icon name="right" />
              </button>
            </div>
            <DaySummary totals={totals} />
          </>
        )}
        <div class="search-row">
          <label class="search">
            <Icon name="search" size={20} />
            <input
              ref={inputRef}
              type="search"
              placeholder="Ajouter un aliment…"
              value={q}
              autocomplete="off"
              autocorrect="off"
              spellcheck={false}
              enterkeyhint="search"
              onFocus={() => setSearching(true)}
              onInput={(e) => setQ(e.currentTarget.value)}
            />
          </label>
          {searching && (
            <button class="link-btn" onClick={closeSearch}>Fermer</button>
          )}
        </div>
      </header>

      {searching ? (
        <SearchResults
          q={q}
          results={results}
          shortcuts={shortcuts}
          metaMap={metaMap}
          onPick={openFood}
          onCustom={() => setCustom({ name: q })}
        />
      ) : (
        <>
          <div class="quick-actions">
            <button class="chip-btn" onClick={() => setPaste(true)}><Icon name="paste" size={18} /> Photo via Claude</button>
            <button class="chip-btn" onClick={() => setScan(true)}><Icon name="barcode" size={18} /> Code-barres</button>
          </div>

          {templates.length > 0 && (
            <section>
              <h3 class="section-title">Repas types</h3>
              <div class="chips">
                {templates.map((t) => (
                  <button key={t.id} class="chip tpl" onClick={() => setTplSheet(t)}>
                    <Icon name="bookmark" size={16} /> {t.name}
                  </button>
                ))}
              </div>
            </section>
          )}

          {shortcuts.length > 0 && (
            <section>
              <h3 class="section-title">Favoris et récents</h3>
              <div class="chips">
                {shortcuts.map((f) => (
                  <button key={f.id} class={'chip' + (metaMap.get(f.id)?.fav ? ' fav' : '')} onClick={() => openFood(f)}>
                    {shortName(f.name)}
                  </button>
                ))}
              </div>
            </section>
          )}

          <DayLog entries={entries} onEdit={setEntrySheet} onSaveTemplate={setSaveTpl} />
        </>
      )}

      <FoodSheet
        key={foodSheet?.id}
        food={foodSheet}
        meta={foodSheet && metaMap.get(foodSheet.id)}
        date={date}
        onClose={() => setFoodSheet(null)}
        onLogged={onLogged}
      />
      <EntrySheet key={entrySheet?.id} entry={entrySheet} onClose={() => setEntrySheet(null)} />
      <TemplateSheet key={tplSheet?.id} tpl={tplSheet} date={date} onClose={() => setTplSheet(null)} />
      <SaveTemplateSheet meal={saveTpl} entries={entries} onClose={() => setSaveTpl(null)} />
      <PasteSheet open={paste} date={date} onClose={() => setPaste(false)} />
      <ScanSheet open={scan} onClose={() => setScan(false)} onFood={(f) => { setScan(false); openFood(f); }} onUnknown={(code) => { setScan(false); setCustom({ barcode: code }); }} />
      <CustomFoodSheet init={custom} onClose={() => setCustom(null)} onSaved={(f) => { setCustom(null); openFood(f); }} />
    </div>
  );
}

/** « Riz blanc, cuit, sans sel ajouté » → « Riz blanc, cuit » */
export function shortName(name) {
  const parts = name.split(/,\s*/);
  return parts.slice(0, 2).join(', ');
}

function DaySummary({ totals }) {
  const left = TARGETS.kcal - totals.kcal;
  return (
    <div class="summary">
      <div class="kcal">
        <div>
          <span class="kcal-big">{fmtNum(r0(totals.kcal))}</span>
          <span class="kcal-unit"> / {fmtNum(TARGETS.kcal)} kcal</span>
        </div>
        <span class={'kcal-left' + (left < -100 ? ' over' : '')}>
          {left >= 0 ? `reste ${fmtNum(r0(left))}` : `+${fmtNum(r0(-left))} au-dessus`}
        </span>
      </div>
      <div class="bar-track big">
        <div class={'bar-fill' + (totals.kcal > TARGETS.kcal * 1.1 ? ' over' : '')} style={{ width: Math.min(100, (totals.kcal / TARGETS.kcal) * 100) + '%' }} />
      </div>
      <div class="macros">
        <Bar label="Protéines" value={totals.p} target={TARGETS.p} />
        <Bar label="Glucides" value={totals.g} target={TARGETS.g} />
        <Bar label="Lipides" value={totals.l} target={TARGETS.l} />
      </div>
    </div>
  );
}

function SearchResults({ q, results, shortcuts, metaMap, onPick, onCustom }) {
  const [off, setOff] = useState(null); // { loading, items, error }
  const term = q.trim();

  const runOff = async () => {
    setOff({ loading: true });
    try {
      const items = await offSearch(term);
      setOff({ items });
    } catch (e) {
      setOff({ error: e.message });
    }
  };

  const pickOff = async (f) => onPick(await saveCustomFood(f));

  if (term.length < 2) {
    return (
      <div class="results">
        {shortcuts.length ? (
          shortcuts.map((f) => <FoodRow key={f.id} food={f} meta={metaMap.get(f.id)} onPick={onPick} />)
        ) : (
          <Empty>Tape au moins 2 lettres. Tes favoris et récents apparaîtront ici.</Empty>
        )}
      </div>
    );
  }

  return (
    <div class="results">
      {results.map((f) => <FoodRow key={f.id} food={f} meta={metaMap.get(f.id)} onPick={onPick} />)}
      {!results.length && <Empty>Aucun aliment Ciqual ne correspond à « {term} ».</Empty>}

      <div class="results-more">
        {!off && (
          <button class="btn ghost" onClick={runOff}>
            Chercher « {term} » dans les produits du commerce (Open Food Facts)
          </button>
        )}
        {off?.loading && <p class="muted">Recherche Open Food Facts…</p>}
        {off?.error && <p class="muted">{off.error}</p>}
        {off?.items && !off.items.length && <p class="muted">Rien trouvé sur Open Food Facts.</p>}
        {off?.items?.map((f) => <FoodRow key={f.id} food={f} onPick={pickOff} />)}
        <button class="btn ghost" onClick={onCustom}>Créer un aliment à partir de l'étiquette</button>
      </div>
    </div>
  );
}

function FoodRow({ food, meta, onPick }) {
  return (
    <button class="food-row" onClick={() => onPick(food)}>
      <span class="food-name">
        {meta?.fav ? <Icon name="star" size={14} fill /> : null} {food.name}
      </span>
      <span class="food-sub">
        {fmtNum(food.kcal)} kcal · P {fmtNum(food.p ?? 0, 1)} · G {fmtNum(food.g ?? 0, 1)} · L {fmtNum(food.l ?? 0, 1)} <em>/100 g</em>
        {food.source !== 'ciqual' && <span class="tag">{food.source === 'off' ? 'OFF' : 'perso'}</span>}
        {food.source === 'ciqual' && groupName(food.grp) && <span class="grp"> · {groupName(food.grp)}</span>}
      </span>
    </button>
  );
}

// ---------- Choix de la portion : 1 tap = enregistré ----------
export function FoodSheet({ food, meta, date, onClose, onLogged }) {
  const [meal, setMeal] = useState(mealForNow());
  const [custom, setCustomG] = useState('');
  const [remember, setRemember] = useState(false);
  if (!food) return null;

  const normal = normalPortion(food, meta);
  const fav = !!meta?.fav;

  const add = async (grams) => {
    if (!grams || grams <= 0) return;
    if (remember) await updateMeta(food.id, { portion: grams });
    const id = await logFood(food, grams, { meal, date });
    toast(`${shortName(food.name)} · ${fmtNum(grams)} g ajouté`, {
      label: 'Annuler',
      run: () => db.entries.delete(id),
    });
    onLogged?.();
  };

  const customG = num(custom);
  return (
    <Sheet open title={food.name} onClose={onClose}>
      <p class="source">
        Source : {SOURCE_LABEL[food.source]} · pour 100 g : {fmtNum(food.kcal)} kcal, P {fmtNum(food.p ?? 0, 1)} g,
        G {fmtNum(food.g ?? 0, 1)} g, L {fmtNum(food.l ?? 0, 1)} g
        {(food.p == null || food.g == null || food.l == null) && <b> (valeur manquante dans la source, comptée 0)</b>}
      </p>
      <Segmented small options={MEALS} value={meal} onChange={setMeal} />
      <div class="portions">
        {SIZES.map((s) => {
          const g = sizeGrams(normal, s.k);
          const m = macrosFor(food, g);
          return (
            <button key={s.id} class={'portion' + (s.k === 1 ? ' main' : '')} onClick={() => add(g)}>
              <span class="p-label">{s.label}</span>
              <span class="p-g">{fmtNum(g)} g</span>
              <span class="p-k">{fmtNum(r0(m.kcal))} kcal · P {fmtNum(r0(m.p))}</span>
            </button>
          );
        })}
      </div>
      <div class="row custom-g">
        <NumInput value={custom} onInput={setCustomG} placeholder="Autre quantité" suffix="g" />
        <button class="btn" disabled={!customG} onClick={() => add(customG)}>Ajouter</button>
      </div>
      {customG > 0 && (
        <label class="check">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.currentTarget.checked)} />
          Retenir {fmtNum(customG)} g comme portion normale
          {customG > 0 && ` (${fmtNum(r0(macrosFor(food, customG).kcal))} kcal)`}
        </label>
      )}
      <button class={'btn ghost fav-btn' + (fav ? ' on' : '')} onClick={() => updateMeta(food.id, { fav: fav ? 0 : 1 })}>
        <Icon name="star" size={18} fill={fav} /> {fav ? 'Retirer des favoris' : 'Ajouter aux favoris'}
      </button>
      <p class="muted small">Portion normale : {fmtNum(normal)} g {meta?.portion ? '(la tienne)' : '(par défaut, modifiable)'}.</p>
    </Sheet>
  );
}

// ---------- Journal du jour ----------
function DayLog({ entries, onEdit, onSaveTemplate }) {
  if (!entries.length) return <Empty>Rien de noté pour ce jour. Touche la barre de recherche pour ajouter un aliment.</Empty>;
  return (
    <div class="daylog">
      {MEALS.map((m) => {
        const list = entries.filter((e) => e.meal === m.id);
        if (!list.length) return null;
        const t = sumMacros(list);
        return (
          <section key={m.id} class="meal">
            <div class="meal-head">
              <h3>{m.label}</h3>
              <span class="muted">{fmtNum(r0(t.kcal))} kcal · P {fmtNum(r0(t.p))} g</span>
              <button class="icon-btn small" onClick={() => onSaveTemplate(m.id)} aria-label="Enregistrer comme repas type" title="Enregistrer comme repas type">
                <Icon name="bookmark" size={18} />
              </button>
            </div>
            {list.map((e) => (
              <button key={e.id} class="entry" onClick={() => onEdit(e)}>
                <span class="entry-name">{shortName(e.name)}</span>
                <span class="entry-g">{fmtNum(e.grams)} g</span>
                <span class="entry-k">{fmtNum(r0(e.kcal))} kcal</span>
              </button>
            ))}
          </section>
        );
      })}
      <p class="muted small center">Touche un aliment pour corriger la quantité. <Icon name="bookmark" size={13} /> = enregistrer le repas comme repas type.</p>
    </div>
  );
}

function EntrySheet({ entry, onClose }) {
  const [grams, setGrams] = useState(entry ? String(entry.grams) : '');
  const [meal, setMeal] = useState(entry?.meal);
  if (!entry) return null;
  const g = num(grams) ?? 0;
  const m = macrosFor(entry.per100, g);
  const bump = (d) => setGrams(String(Math.max(0, (num(grams) ?? 0) + d)));

  const save = async () => {
    if (g <= 0) return;
    await db.entries.update(entry.id, { grams: g, meal, ...m });
    onClose();
  };
  const del = async () => {
    const copy = { ...entry };
    await db.entries.delete(entry.id);
    onClose();
    toast(`${shortName(entry.name)} supprimé`, { label: 'Annuler', run: () => db.entries.add(copy) });
  };

  return (
    <Sheet open title={entry.name} onClose={onClose}>
      <p class="source">Source : {SOURCE_LABEL[entry.source] ?? entry.source}</p>
      <div class="stepper">
        <button class="round" onClick={() => bump(-10)} aria-label="Moins 10 g"><Icon name="minus" /></button>
        <NumInput value={grams} onInput={setGrams} suffix="g" />
        <button class="round" onClick={() => bump(10)} aria-label="Plus 10 g"><Icon name="plus" /></button>
      </div>
      <p class="center big-k">
        {fmtNum(r0(m.kcal))} kcal · P {fmtNum(r1(m.p), 1)} · G {fmtNum(r1(m.g), 1)} · L {fmtNum(r1(m.l), 1)}
      </p>
      <Segmented small options={MEALS} value={meal} onChange={setMeal} />
      <div class="row">
        <button class="btn danger" onClick={del}><Icon name="trash" size={18} /> Supprimer</button>
        <button class="btn primary grow" onClick={save}>Enregistrer</button>
      </div>
    </Sheet>
  );
}

// ---------- Repas types ----------
function TemplateSheet({ tpl, date, onClose }) {
  const [meal, setMeal] = useState(mealForNow());
  if (!tpl) return null;
  const base = sumMacros(tpl.items.map((i) => macrosFor(i.per100, i.grams)));

  const add = async (k) => {
    const ids = [];
    const now = Date.now();
    for (const [n, it] of tpl.items.entries()) {
      const grams = Math.round(it.grams * k);
      ids.push(
        await db.entries.add({
          date, meal, foodId: it.foodId, name: it.name, source: it.source, per100: it.per100,
          grams, ...macrosFor(it.per100, grams), origin: 'repas type', ts: now + n,
        }),
      );
    }
    onClose();
    toast(`${tpl.name} ajouté`, { label: 'Annuler', run: () => db.entries.bulkDelete(ids) });
  };

  const del = async () => {
    if (!confirm(`Supprimer le repas type « ${tpl.name} » ?`)) return;
    await db.templates.delete(tpl.id);
    onClose();
  };

  return (
    <Sheet open title={tpl.name} onClose={onClose}>
      <ul class="tpl-items">
        {tpl.items.map((i, n) => (
          <li key={n}><span>{shortName(i.name)}</span><span class="muted">{fmtNum(i.grams)} g</span></li>
        ))}
      </ul>
      <Segmented small options={MEALS} value={meal} onChange={setMeal} />
      <div class="portions">
        {SIZES.map((s) => (
          <button key={s.id} class={'portion' + (s.k === 1 ? ' main' : '')} onClick={() => add(s.k)}>
            <span class="p-label">{s.label}</span>
            <span class="p-g">×{fmtNum(s.k, 1)}</span>
            <span class="p-k">{fmtNum(r0(base.kcal * s.k))} kcal · P {fmtNum(r0(base.p * s.k))}</span>
          </button>
        ))}
      </div>
      <button class="btn ghost danger-text" onClick={del}><Icon name="trash" size={18} /> Supprimer ce repas type</button>
    </Sheet>
  );
}

function SaveTemplateSheet({ meal, entries, onClose }) {
  const [name, setName] = useState('');
  if (!meal) return null;
  const items = entries.filter((e) => e.meal === meal);
  const save = async () => {
    const n = name.trim() || `${mealLabel(meal)} type`;
    await db.templates.add({
      name: n,
      items: items.map((e) => ({ foodId: e.foodId, name: e.name, source: e.source, per100: e.per100, grams: e.grams })),
    });
    setName('');
    onClose();
    toast(`Repas type « ${n} » enregistré`);
  };
  return (
    <Sheet open title={`Enregistrer le ${mealLabel(meal).toLowerCase()} comme repas type`} onClose={onClose}>
      <ul class="tpl-items">
        {items.map((i) => (
          <li key={i.id}><span>{shortName(i.name)}</span><span class="muted">{fmtNum(i.grams)} g</span></li>
        ))}
      </ul>
      <input class="text-input" placeholder="Nom (ex. Plat de cantine type)" value={name} onInput={(e) => setName(e.currentTarget.value)} />
      <button class="btn primary block" onClick={save}>Enregistrer</button>
    </Sheet>
  );
}
