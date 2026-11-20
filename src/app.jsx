import { useEffect, useState } from 'preact/hooks';
import { loadFoods } from './foods.js';
import { Icon, Toaster } from './ui.jsx';
import { Nutrition } from './pages/Nutrition.jsx';
import { Effort } from './pages/Effort.jsx';
import { Bilan } from './pages/Bilan.jsx';
import { useBackupDue } from './pages/Backup.jsx';

const TABS = [
  { id: 'nutrition', label: 'Nutrition', icon: 'meal' },
  { id: 'effort', label: 'Effort', icon: 'run' },
  { id: 'bilan', label: 'Bilan', icon: 'chart' },
];

const fromHash = () => {
  const h = location.hash.slice(1);
  return TABS.some((t) => t.id === h) ? h : 'nutrition';
};

export function App() {
  const [tab, setTab] = useState(fromHash);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);
  const backupDue = useBackupDue();

  useEffect(() => {
    loadFoods().then(() => setReady(true), (e) => setError(e.message));
    const onHash = () => setTab(fromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = (id) => {
    history.replaceState(null, '', '#' + id);
    setTab(id);
    window.scrollTo(0, 0);
  };

  return (
    <>
      <main>
        {error && <p class="empty">Impossible de charger la base d'aliments : {error}</p>}
        {!ready && !error && <p class="empty">Chargement…</p>}
        {ready && tab === 'nutrition' && <Nutrition />}
        {ready && tab === 'effort' && <Effort />}
        {ready && tab === 'bilan' && <Bilan />}
      </main>
      <nav class="tabbar">
        {TABS.map((t) => (
          <button key={t.id} class={tab === t.id ? 'on' : ''} onClick={() => go(t.id)}>
            <Icon name={t.icon} size={24} />
            <span>{t.label}</span>
            {t.id === 'bilan' && backupDue && <i class="dot" aria-label="Sauvegarde à faire" />}
          </button>
        ))}
      </nav>
      <Toaster />
    </>
  );
}
