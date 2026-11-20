import { useMemo, useState } from 'preact/hooks';
import { db, useLive } from '../db.js';
import { getFood } from '../foods.js';
import { Bar, Empty, Icon, NumInput, Segmented, Sheet, toast } from '../ui.jsx';
import {
  addDays, fmtDay, fmtNum, fmtShort, gapLevel, MEALS, num, parseDate, r0, r1, round5, sumMacros, TARGETS, today, weekStart,
} from '../util.js';
import { BackupCard } from './Backup.jsx';
import { sessionSummary, TYPES } from './Effort.jsx';
import { shortName } from './Nutrition.jsx';

export function Bilan() {
  const [view, setView] = useState('jour');
  const [about, setAbout] = useState(false);
  return (
    <div class="page">
      <header class="page-head">
        <h1>Bilan</h1>
        <button class="icon-btn" onClick={() => setAbout(true)} aria-label="Réglages et sources"><Icon name="gear" /></button>
      </header>
      <WeightCard />
      <Segmented options={[{ id: 'jour', label: 'Jour' }, { id: 'semaine', label: 'Semaine' }]} value={view} onChange={setView} />
      {view === 'jour' ? <DayReport /> : <WeekReport />}
      <BackupCard />
      <About open={about} onClose={() => setAbout(false)} />
    </div>
  );
}

// ---------- Poids : moyenne sur 7 jours ----------
function avgWeight(list, from, to) {
  const xs = list.filter((w) => w.date >= from && w.date <= to).map((w) => w.kg);
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

function WeightCard() {
  const weights = useLive(() => db.weights.orderBy('date').toArray(), [], []);
  const [kg, setKg] = useState('');
  const t = today();
  const todayW = weights.find((w) => w.date === t);
  const avg = avgWeight(weights, addDays(t, -6), t);
  const prev = avgWeight(weights, addDays(t, -13), addDays(t, -7));
  const diff = avg != null && prev != null ? avg - prev : null;

  const save = async () => {
    const v = num(kg);
    if (!v || v < 30 || v > 250) return toast('Poids invalide');
    await db.weights.put({ date: t, kg: v });
    setKg('');
    toast('Pesée enregistrée');
  };

  return (
    <div class="card">
      <h3>Poids</h3>
      <div class="weight-top">
        <div>
          <span class="kcal-big">{avg != null ? fmtNum(r1(avg), 1) : '–'}</span>
          <span class="kcal-unit"> kg · moyenne 7 jours</span>
          {diff != null && (
            <p class="small">
              {diff <= 0 ? '▼' : '▲'} {fmtNum(Math.abs(r1(diff)), 1)} kg par rapport aux 7 jours précédents
            </p>
          )}
        </div>
      </div>
      <div class="row">
        <NumInput value={kg} onInput={setKg} placeholder={todayW ? `Aujourd'hui : ${fmtNum(todayW.kg, 1)}` : 'Pesée du matin'} suffix="kg" />
        <button class="btn primary" disabled={!num(kg)} onClick={save}>{todayW ? 'Corriger' : 'Enregistrer'}</button>
      </div>
      {weights.length > 0 && (
        <p class="muted small">
          Dernières pesées : {weights.slice(-5).reverse().map((w) => `${fmtShort(w.date)} : ${fmtNum(w.kg, 1)} kg`).join(' · ')}
        </p>
      )}
      <p class="muted small">Le poids du jour varie de ±1 kg (eau, sel, repas) : c'est la moyenne qui compte.</p>
    </div>
  );
}

// ---------- Bilan du jour ----------
function DayReport() {
  const [date, setDate] = useState(today());
  const entries = useLive(() => db.entries.where('date').equals(date).toArray(), [date], []);
  const sessions = useLive(() => db.sessions.where('date').equals(date).toArray(), [date], []);
  const meta = useLive(() => db.foodMeta.toArray(), [], []);
  const t = sumMacros(entries);
  const tips = useMemo(() => advice(t, entries, meta, date), [entries, meta, date]);

  return (
    <div class="card">
      <div class="date-nav">
        <button class="icon-btn" onClick={() => setDate(addDays(date, -1))} aria-label="Jour précédent"><Icon name="left" /></button>
        <span class="date-label">{fmtDay(date)}</span>
        <button class="icon-btn" onClick={() => setDate(addDays(date, 1))} disabled={date >= today()} aria-label="Jour suivant"><Icon name="right" /></button>
      </div>
      {!entries.length ? (
        <Empty>Aucun repas noté ce jour.</Empty>
      ) : (
        <>
          <table class="report">
            <thead>
              <tr><th></th><th>Mangé</th><th>Cible</th><th>Écart</th></tr>
            </thead>
            <tbody>
              {[['Énergie', 'kcal', 'kcal'], ['Protéines', 'p', 'g'], ['Glucides', 'g', 'g'], ['Lipides', 'l', 'g']].map(([label, k, u]) => (
                <tr key={k}>
                  <td>{label}</td>
                  <td><b>{fmtNum(r0(t[k]))}</b> {u}</td>
                  <td>{fmtNum(TARGETS[k])}</td>
                  <td class={'gap ' + gapLevel(t[k], TARGETS[k])}>{t[k] - TARGETS[k] >= 0 ? '+' : ''}{fmtNum(r0(t[k] - TARGETS[k]))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p class="muted small">
            Répartition : {fmtNum(r0((t.p * 4 / (t.kcal || 1)) * 100))} % protéines · {fmtNum(r0((t.g * 4 / (t.kcal || 1)) * 100))} % glucides ·{' '}
            {fmtNum(r0((t.l * 9 / (t.kcal || 1)) * 100))} % lipides (cible ≈ 26 / 45 / 29 %)
          </p>
          <div class="meals-split">
            {MEALS.map((m) => {
              const k = sumMacros(entries.filter((e) => e.meal === m.id)).kcal;
              return k ? <span key={m.id}>{m.label} <b>{fmtNum(r0(k))}</b></span> : null;
            })}
          </div>
          <ul class="tips">
            {tips.map((x, i) => <li key={i} class={x.level}>{x.text}</li>)}
          </ul>
        </>
      )}
      {sessions.length > 0 && (
        <div class="day-effort">
          <h4 class="label">Effort du jour (indicatif)</h4>
          {sessions.map((s) => (
            <p key={s.id} class="small"><span class={'badge ' + s.type}>{TYPES[s.type].label}</span> {sessionSummary(s)} · ≈ {fmtNum(r0(s.kcal))} kcal</p>
          ))}
          <p class="muted small">La cible reste 2 000 kcal, effort ou pas.</p>
        </div>
      )}
    </div>
  );
}

/** Conseils simples, calculés uniquement à partir des données notées et des valeurs Ciqual/OFF. */
function advice(t, entries, meta, date) {
  const tips = [];
  const ongoing = date === today() && new Date().getHours() < 20;
  const pct = (k) => t[k] / TARGETS[k];

  if (ongoing) tips.push({ level: 'info', text: 'Journée en cours : le bilan se lit le soir.' });

  if (pct('p') < 0.9) {
    const gap = TARGETS.p - t.p;
    // Meilleure source de protéines parmi tes favoris et récents
    const cands = meta.map((m) => getFood(m.id)).filter((f) => f && f.p && f.kcal && f.p / f.kcal >= 0.12);
    cands.sort((a, b) => b.p / b.kcal - a.p / a.kcal);
    const f = cands[0];
    let text = `Protéines : il manque ${fmtNum(r0(gap))} g.`;
    if (f) {
      const g = Math.min(400, round5((gap / f.p) * 100));
      text += ` Par exemple ${fmtNum(g)} g de ${shortName(f.name).toLowerCase()} (≈ ${fmtNum(r0((f.p * g) / 100))} g de protéines, ${fmtNum(r0((f.kcal * g) / 100))} kcal).`;
    }
    tips.push({ level: ongoing ? 'info' : 'warn', text });
  } else {
    tips.push({ level: 'ok', text: `Protéines : ${fmtNum(r0(t.p))} g, objectif atteint.` });
  }

  if (pct('kcal') > 1.1) tips.push({ level: 'warn', text: `Énergie : ${fmtNum(r0(t.kcal - TARGETS.kcal))} kcal au-dessus de la cible.` });
  else if (!ongoing && pct('kcal') < 0.85) tips.push({ level: 'warn', text: `Énergie : ${fmtNum(r0(TARGETS.kcal - t.kcal))} kcal en dessous de la cible. Un oubli de saisie ?` });
  else if (!ongoing) tips.push({ level: 'ok', text: 'Énergie dans la cible.' });

  if (pct('l') > 1.15) {
    const top = [...entries].sort((a, b) => b.l - a.l)[0];
    tips.push({ level: 'warn', text: `Lipides : +${fmtNum(r0(t.l - TARGETS.l))} g. Principale source : ${shortName(top.name).toLowerCase()} (${fmtNum(r0(top.l))} g).` });
  }
  if (!ongoing && pct('g') < 0.8) tips.push({ level: 'warn', text: `Glucides bas : ${fmtNum(r0(t.g))} g sur ${TARGETS.g} g.` });
  if (pct('g') > 1.15) tips.push({ level: 'warn', text: `Glucides : +${fmtNum(r0(t.g - TARGETS.g))} g au-dessus de la cible.` });
  return tips;
}

// ---------- Bilan de la semaine ----------
function WeekReport() {
  const [ws, setWs] = useState(weekStart(today()));
  const we = addDays(ws, 6);
  const entries = useLive(() => db.entries.where('date').between(ws, we, true, true).toArray(), [ws], []);
  const sessions = useLive(() => db.sessions.where('date').between(ws, we, true, true).toArray(), [ws], []);
  const weights = useLive(() => db.weights.where('date').between(addDays(ws, -7), we, true, true).toArray(), [ws], []);

  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const perDay = days.map((d) => ({ d, list: entries.filter((e) => e.date === d) })).map((x) => ({ ...x, t: sumMacros(x.list) }));
  const logged = perDay.filter((x) => x.list.length && x.d !== today());
  const avg = logged.length ? sumMacros(logged.map((x) => x.t)) : null;
  if (avg) for (const k in avg) avg[k] /= logged.length;
  const pDays = logged.filter((x) => x.t.p >= TARGETS.p * 0.9).length;
  const kDays = logged.filter((x) => gapLevel(x.t.kcal, TARGETS.kcal) === 'ok').length;
  const wNow = avgWeight(weights, ws, we);
  const wPrev = avgWeight(weights, addDays(ws, -7), addDays(ws, -1));
  const effMin = sessions.reduce((a, s) => a + (s.duration || 0), 0);

  const title = `Semaine du ${parseDate(ws).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`;

  return (
    <div class="card">
      <div class="date-nav">
        <button class="icon-btn" onClick={() => setWs(addDays(ws, -7))} aria-label="Semaine précédente"><Icon name="left" /></button>
        <span class="date-label">{title}</span>
        <button class="icon-btn" onClick={() => setWs(addDays(ws, 7))} disabled={we >= today()} aria-label="Semaine suivante"><Icon name="right" /></button>
      </div>

      <table class="report week">
        <thead>
          <tr><th></th><th>kcal</th><th>P</th><th>G</th><th>L</th></tr>
        </thead>
        <tbody>
          {perDay.map(({ d, list, t }) => (
            <tr key={d} class={d === today() ? 'today' : ''}>
              <td>{fmtShort(d)}</td>
              {list.length ? (
                ['kcal', 'p', 'g', 'l'].map((k) => (
                  <td key={k} class={'gap ' + (d === today() ? '' : gapLevel(t[k], TARGETS[k]))}>{fmtNum(r0(t[k]))}</td>
                ))
              ) : (
                <td colSpan={4} class="muted">{d > today() ? '' : '—'}</td>
              )}
            </tr>
          ))}
          {avg && (
            <tr class="avg">
              <td>Moy.</td>
              {['kcal', 'p', 'g', 'l'].map((k) => (
                <td key={k} class={'gap ' + gapLevel(avg[k], TARGETS[k])}>{fmtNum(r0(avg[k]))}</td>
              ))}
            </tr>
          )}
          <tr class="target">
            <td>Cible</td><td>{TARGETS.kcal}</td><td>{TARGETS.p}</td><td>{TARGETS.g}</td><td>{TARGETS.l}</td>
          </tr>
        </tbody>
      </table>
      <p class="muted small">Vert : à ±10 % de la cible · orange : ±20 % · rouge : au-delà. Jour en cours exclu de la moyenne.</p>

      {logged.length ? (
        <ul class="tips">
          <li class={logged.length >= 5 ? 'ok' : 'warn'}>{logged.length} jour(s) complet(s) noté(s) sur la semaine.</li>
          <li class={gapLevel(avg.kcal, TARGETS.kcal)}>
            Énergie moyenne : {fmtNum(r0(avg.kcal))} kcal ({avg.kcal >= TARGETS.kcal ? '+' : ''}{fmtNum(r0((avg.kcal / TARGETS.kcal - 1) * 100))} %) · dans la cible {kDays} jour(s).
          </li>
          <li class={pDays >= logged.length * 0.7 ? 'ok' : 'warn'}>
            Protéines : moyenne {fmtNum(r0(avg.p))} g · objectif atteint {pDays}/{logged.length} jour(s).
          </li>
          {wNow != null && (
            <li class="info">
              Poids moyen : {fmtNum(r1(wNow), 1)} kg
              {wPrev != null && ` (${wNow - wPrev <= 0 ? '' : '+'}${fmtNum(r1(wNow - wPrev), 1)} kg vs semaine précédente)`}.
            </li>
          )}
          <li class="info">
            Effort : {sessions.length} séance(s), {fmtNum(effMin)} min
            {sessions.length > 0 && ` (${Object.keys(TYPES).map((k) => [k, sessions.filter((s) => s.type === k).length]).filter(([, n]) => n).map(([k, n]) => `${n} ${TYPES[k].label.toLowerCase()}`).join(', ')})`}.
          </li>
        </ul>
      ) : (
        <Empty>Pas encore de journée complète notée cette semaine.</Empty>
      )}
    </div>
  );
}

function About({ open, onClose }) {
  const [persisted, setPersisted] = useState(null);
  if (open && persisted === null) navigator.storage?.persisted?.().then(setPersisted, () => setPersisted(false));
  return (
    <Sheet open={open} title="Réglages et sources" onClose={onClose}>
      <h4 class="label">Cible quotidienne (fixe)</h4>
      <p>{TARGETS.kcal} kcal · {TARGETS.p} g protéines · {TARGETS.g} g glucides · {TARGETS.l} g lipides</p>
      <h4 class="label">Sources des valeurs nutritionnelles</h4>
      <p class="small">
        ANSES, Table de composition nutritionnelle des aliments Ciqual 2025 (licence CC-BY 4.0) : aliments génériques, crus et cuits
        séparés. Open Food Facts (licence ODbL) : produits emballés, par code-barres. Les valeurs « perso » sont recopiées de l'étiquette.
      </p>
      <h4 class="label">Dépense des séances</h4>
      <p class="small">Estimation indicative (méthode MET, Compendium of Physical Activities ; course ≈ 1 kcal/kg/km), calculée avec ta dernière pesée (70 kg par défaut).</p>
      <h4 class="label">Stockage</h4>
      <p class="small">
        Données uniquement sur ce téléphone{persisted === true ? ', stockage protégé contre l’effacement automatique' : ''}.
        Ouvre toujours l’app depuis l’icône de l’écran d’accueil : Safari a une mémoire séparée.
      </p>
    </Sheet>
  );
}
