import { useMemo, useState } from 'preact/hooks';
import { db, latestWeight, useLive } from '../db.js';
import { Empty, Icon, NumInput, Segmented, Sheet, toast } from '../ui.jsx';
import { addDays, fmtDay, fmtNum, num, r0, today, weekStart } from '../util.js';

export const TYPES = {
  renfo: { label: 'Renfo', long: 'Renforcement (maison)' },
  course: { label: 'Course', long: 'Course à pied' },
  natation: { label: 'Natation', long: 'Natation' },
};

const RPE = [
  { id: 1, label: 'Très facile' },
  { id: 2, label: 'Facile' },
  { id: 3, label: 'Moyen' },
  { id: 4, label: 'Dur' },
  { id: 5, label: 'Très dur' },
];

/**
 * Dépense estimée, À TITRE INDICATIF (la cible calorique ne change pas).
 * Méthode MET (Compendium of Physical Activities) : kcal ≈ MET × poids (kg) × durée (h).
 * Course : ≈ 1 kcal par kg et par km quand la distance est connue.
 */
export function estimateKcal(s, weightKg) {
  const kg = weightKg || 70;
  const h = (s.duration || 0) / 60;
  if (s.type === 'course') {
    if (s.distance) return kg * s.distance;
    return 9 * kg * h;
  }
  if (s.type === 'natation') {
    const met = s.rpe <= 2 ? 5.8 : s.rpe >= 4 ? 9.8 : 7;
    return met * kg * h;
  }
  const met = s.rpe >= 4 ? 5 : 3.5; // renforcement musculaire
  return met * kg * h;
}

export function sessionSummary(s) {
  if (s.type === 'course') {
    const pace = s.distance && s.duration ? s.duration / s.distance : null;
    return [
      s.duration && `${s.duration} min`,
      s.distance && `${fmtNum(s.distance, 2)} km`,
      pace && `${Math.floor(pace)}'${String(Math.round((pace % 1) * 60)).padStart(2, '0')}"/km`,
    ].filter(Boolean).join(' · ');
  }
  if (s.type === 'natation') {
    return [s.duration && `${s.duration} min`, s.distance && `${fmtNum(s.distance)} m`, s.stroke].filter(Boolean).join(' · ');
  }
  const nbSets = (s.exercises || []).reduce((a, e) => a + e.sets.length, 0);
  const nbEx = (s.exercises || []).length;
  return [s.duration && `${s.duration} min`, `${nbEx} exercice${nbEx > 1 ? 's' : ''}`, `${nbSets} série${nbSets > 1 ? 's' : ''}`].filter(Boolean).join(' · ');
}

export function Effort() {
  const [editing, setEditing] = useState(null);
  const sessions = useLive(() => db.sessions.orderBy('date').reverse().limit(60).toArray(), [], []);
  const ws = weekStart(today());
  const week = sessions.filter((s) => s.date >= ws);

  const start = async (type) => {
    const base = { type, date: today(), duration: null, distance: null, rpe: 3 };
    if (type === 'renfo') {
      // On repart de la dernière séance : il suffit d'ajuster.
      const last = (await db.sessions.where('type').equals('renfo').sortBy('date')).pop();
      if (last) {
        base.duration = last.duration;
        base.exercises = last.exercises.map((e) => ({ ...e, sets: e.sets.map((x) => ({ ...x })) }));
      } else base.exercises = [];
    }
    if (type === 'natation') {
      const last = (await db.sessions.where('type').equals('natation').sortBy('date')).pop();
      base.stroke = last?.stroke || 'Crawl';
    }
    setEditing(base);
  };

  return (
    <div class="page">
      <header class="page-head">
        <h1>Effort</h1>
      </header>
      <p class="muted small">La dépense affichée est une estimation indicative. Ta cible reste fixe à 2 000 kcal.</p>

      <div class="type-buttons">
        {Object.entries(TYPES).map(([id, t]) => (
          <button key={id} class="type-btn" onClick={() => start(id)}>
            <Icon name="plus" size={20} />
            {t.label}
          </button>
        ))}
      </div>

      <WeekSummary week={week} />

      <h3 class="section-title">Séances</h3>
      {!sessions.length && <Empty>Aucune séance. Touche Renfo, Course ou Natation pour noter la première.</Empty>}
      <div class="sessions">
        {sessions.map((s) => (
          <button key={s.id} class="session" onClick={() => setEditing(structuredClone(s))}>
            <span class={'badge ' + s.type}>{TYPES[s.type].label}</span>
            <span class="session-main">
              <b>{fmtDay(s.date)}</b>
              <span class="muted small">{sessionSummary(s)}</span>
            </span>
            <span class="muted small">≈ {fmtNum(r0(s.kcal))} kcal</span>
          </button>
        ))}
      </div>

      {editing && <SessionSheet init={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function WeekSummary({ week }) {
  const minutes = week.reduce((a, s) => a + (s.duration || 0), 0);
  const km = week.filter((s) => s.type === 'course').reduce((a, s) => a + (s.distance || 0), 0);
  const m = week.filter((s) => s.type === 'natation').reduce((a, s) => a + (s.distance || 0), 0);
  const kcal = week.reduce((a, s) => a + (s.kcal || 0), 0);
  const renfo = week.filter((s) => s.type === 'renfo').length;
  return (
    <div class="card stats">
      <h3>Cette semaine</h3>
      <div class="stat-grid">
        <div><b>{week.length}</b><span>séances</span></div>
        <div><b>{fmtNum(minutes)}</b><span>minutes</span></div>
        <div><b>{renfo}</b><span>renfo</span></div>
        <div><b>{fmtNum(km, 1)}</b><span>km course</span></div>
        <div><b>{fmtNum(m)}</b><span>m nage</span></div>
        <div><b>≈ {fmtNum(r0(kcal))}</b><span>kcal (indic.)</span></div>
      </div>
    </div>
  );
}

function SessionSheet({ init, onClose }) {
  const [s, setS] = useState({
    ...init,
    duration: init.duration != null ? String(init.duration) : '',
    distance: init.distance != null ? String(init.distance) : '',
  });
  const [picker, setPicker] = useState(false);
  const exercises = useLive(() => db.exercises.toArray(), [], []);
  const exMap = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises]);
  const set = (patch) => setS({ ...s, ...patch });
  const isNew = !s.id;

  const save = async () => {
    const out = {
      ...s,
      duration: num(s.duration),
      distance: num(s.distance),
    };
    if (out.type === 'renfo') {
      out.exercises = (out.exercises || [])
        .map((e) => ({ ...e, sets: e.sets.filter((x) => num(x.reps) > 0 || num(x.sec) > 0).map((x) => ({ reps: num(x.reps), kg: num(x.kg), sec: num(x.sec) })) }))
        .filter((e) => e.sets.length);
    }
    out.kcal = estimateKcal(out, await latestWeight());
    if (out.id) await db.sessions.put(out);
    else await db.sessions.add(out);
    toast('Séance enregistrée');
    onClose();
  };

  const del = async () => {
    if (!confirm('Supprimer cette séance ?')) return;
    await db.sessions.delete(s.id);
    onClose();
  };

  // --- renfo ---
  const updEx = (i, patch) => set({ exercises: s.exercises.map((e, n) => (n === i ? { ...e, ...patch } : e)) });
  const updSet = (i, j, patch) => updEx(i, { sets: s.exercises[i].sets.map((x, n) => (n === j ? { ...x, ...patch } : x)) });
  const addSet = (i) => {
    const sets = s.exercises[i].sets;
    updEx(i, { sets: [...sets, { ...(sets[sets.length - 1] || { reps: '', kg: '' }) }] });
  };
  const addExercise = (ex) => {
    set({ exercises: [...(s.exercises || []), { exId: ex.id, sets: [ex.kind === 'time' ? { sec: '' } : { reps: '', kg: '' }] }] });
    setPicker(false);
  };

  const dateOpts = [0, 1, 2].map((d) => ({ id: addDays(today(), -d), label: d === 0 ? "Aujourd'hui" : d === 1 ? 'Hier' : 'Avant-hier' }));
  if (!dateOpts.some((o) => o.id === s.date)) dateOpts.push({ id: s.date, label: fmtDay(s.date) });

  return (
    <Sheet open title={TYPES[s.type].long} onClose={onClose} full>
      <Segmented small options={dateOpts} value={s.date} onChange={(date) => set({ date })} />

      <div class="grid2">
        <NumInput value={s.duration} onInput={(v) => set({ duration: v })} placeholder="Durée" suffix="min" inputMode="numeric" />
        {s.type === 'course' && <NumInput value={s.distance} onInput={(v) => set({ distance: v })} placeholder="Distance" suffix="km" />}
        {s.type === 'natation' && <NumInput value={s.distance} onInput={(v) => set({ distance: v })} placeholder="Distance" suffix="m" inputMode="numeric" />}
      </div>

      {s.type === 'natation' && (
        <Segmented small options={['Crawl', 'Brasse', 'Dos', 'Mixte'].map((x) => ({ id: x, label: x }))} value={s.stroke} onChange={(stroke) => set({ stroke })} />
      )}

      {s.type === 'renfo' && (
        <div class="exercises">
          {isNew && s.exercises?.length > 0 && <p class="muted small">Prérempli avec ta dernière séance : ajuste et enregistre.</p>}
          {(s.exercises || []).map((e, i) => {
            const ex = exMap.get(e.exId) || { name: e.exId, kind: 'reps' };
            return (
              <div key={i} class="ex-card">
                <div class="ex-head">
                  <b>{ex.name}</b>
                  <button class="icon-btn small" onClick={() => set({ exercises: s.exercises.filter((_, n) => n !== i) })} aria-label="Retirer l'exercice">
                    <Icon name="trash" size={18} />
                  </button>
                </div>
                {e.sets.map((x, j) => (
                  <div key={j} class="set-row">
                    <span class="set-n">{j + 1}</span>
                    {ex.kind === 'time' ? (
                      <NumInput value={x.sec ?? ''} onInput={(v) => updSet(i, j, { sec: v })} suffix="s" inputMode="numeric" />
                    ) : (
                      <>
                        <NumInput value={x.reps ?? ''} onInput={(v) => updSet(i, j, { reps: v })} suffix="reps" inputMode="numeric" />
                        <NumInput value={x.kg ?? ''} onInput={(v) => updSet(i, j, { kg: v })} placeholder="PDC" suffix="kg" />
                      </>
                    )}
                    <button class="icon-btn small" onClick={() => updEx(i, { sets: e.sets.filter((_, n) => n !== j) })} aria-label="Retirer la série">
                      <Icon name="close" size={16} />
                    </button>
                  </div>
                ))}
                <button class="btn ghost small-btn" onClick={() => addSet(i)}><Icon name="plus" size={16} /> Série</button>
              </div>
            );
          })}
          <button class="btn block" onClick={() => setPicker(true)}><Icon name="plus" size={18} /> Ajouter un exercice</button>
          <p class="muted small">kg vide = poids du corps (PDC). Pour les tractions ou dips lestés, indique le lest.</p>
        </div>
      )}

      <h4 class="label">Ressenti</h4>
      <Segmented small options={RPE.map((r) => ({ id: r.id, label: String(r.id) }))} value={s.rpe} onChange={(rpe) => set({ rpe })} />
      <p class="muted small center">{RPE.find((r) => r.id === s.rpe)?.label}</p>

      <input class="text-input" placeholder="Note (facultatif)" value={s.notes || ''} onInput={(e) => set({ notes: e.currentTarget.value })} />

      <div class="row">
        {!isNew && <button class="btn danger" onClick={del}><Icon name="trash" size={18} /></button>}
        <button class="btn primary grow" onClick={save}>Enregistrer</button>
      </div>

      {picker && <ExercisePicker exercises={exercises} onPick={addExercise} onClose={() => setPicker(false)} />}
    </Sheet>
  );
}

function ExercisePicker({ exercises, onPick, onClose }) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState('reps');
  const cats = [...new Set(exercises.map((e) => e.cat))];
  const create = async () => {
    const ex = { id: 'x' + Date.now().toString(36), name: name.trim(), kind, cat: 'Perso' };
    await db.exercises.add(ex);
    onPick(ex);
  };
  return (
    <Sheet open title="Choisir un exercice" onClose={onClose} full>
      {cats.map((c) => (
        <section key={c}>
          <h3 class="section-title">{c}</h3>
          <div class="chips">
            {exercises.filter((e) => e.cat === c).map((e) => (
              <button key={e.id} class="chip" onClick={() => onPick(e)}>{e.name}</button>
            ))}
          </div>
        </section>
      ))}
      <h3 class="section-title">Nouvel exercice</h3>
      <input class="text-input" placeholder="Nom" value={name} onInput={(e) => setName(e.currentTarget.value)} />
      <Segmented small options={[{ id: 'reps', label: 'Répétitions' }, { id: 'time', label: 'Durée' }]} value={kind} onChange={setKind} />
      <button class="btn block" disabled={!name.trim()} onClick={create}>Créer et ajouter</button>
    </Sheet>
  );
}
