import { useRef } from 'preact/hooks';
import { db, exportAll, importAll, setSetting, useLive } from '../db.js';
import { refreshCustom } from '../foods.js';
import { Icon, toast } from '../ui.jsx';
import { dateStr, fmtDay, today } from '../util.js';

const DAY = 86400000;

export function useBackupDue() {
  const info = useLive(async () => ({
    last: (await db.settings.get('lastExport'))?.value ?? null,
    count: await db.entries.count(),
  }), [], null);
  if (!info || !info.count) return false;
  return !info.last || Date.now() - info.last > 7 * DAY;
}

export function BackupCard() {
  const last = useLive(async () => (await db.settings.get('lastExport'))?.value ?? null, [], null);
  const due = useBackupDue();
  const fileRef = useRef();

  const doExport = async () => {
    const data = await exportAll();
    const name = `suivi-nutrition-${today()}.json`;
    const file = new File([JSON.stringify(data)], name, { type: 'application/json' });
    try {
      if (navigator.canShare?.({ files: [file] })) {
        // iPhone : feuille de partage → « Enregistrer dans Fichiers » (iCloud Drive)
        await navigator.share({ files: [file], title: name });
      } else {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(file);
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      }
      await setSetting('lastExport', Date.now());
      toast('Sauvegarde créée');
    } catch (e) {
      if (e?.name !== 'AbortError') toast('Export impossible : ' + e.message);
    }
  };

  const doImport = async (e) => {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const when = data.exportedAt ? new Date(data.exportedAt).toLocaleString('fr-FR') : '?';
      if (!confirm(`Restaurer la sauvegarde du ${when} ?\nToutes les données actuelles de l'app seront remplacées.`)) return;
      await importAll(data);
      await refreshCustom();
      toast('Données restaurées');
    } catch (err) {
      toast('Import impossible : ' + err.message);
    }
  };

  return (
    <div class={'card' + (due ? ' warn' : '')}>
      <h3>Sauvegarde</h3>
      <p class="small">
        Tes données sont uniquement dans ce téléphone.{' '}
        {last ? `Dernière sauvegarde : ${fmtDay(dateStr(new Date(last))).toLowerCase()}.` : 'Aucune sauvegarde pour l’instant.'}
        {due && <b> Pense à sauvegarder (1 fois par semaine).</b>}
      </p>
      <div class="row">
        <button class="btn primary grow" onClick={doExport}>Exporter</button>
        <button class="btn grow" onClick={() => fileRef.current.click()}>Importer</button>
      </div>
      <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={doImport} />
      <p class="muted small">Exporter → « Enregistrer dans Fichiers » (iCloud Drive). Importer remplace tout par le contenu du fichier.</p>
    </div>
  );
}
