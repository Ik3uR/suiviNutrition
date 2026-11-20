import { useEffect, useRef, useState } from 'preact/hooks';
import { db } from '../db.js';
import { getFood, offByBarcode, refreshCustom, saveCustomFood } from '../foods.js';
import { NumInput, Sheet } from '../ui.jsx';

let detectorPromise = null;
async function getDetector() {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      const [{ BarcodeDetector, prepareZXingModule }, wasm] = await Promise.all([
        import('barcode-detector/ponyfill'),
        import('zxing-wasm/reader/zxing_reader.wasm?url'),
      ]);
      // Le moteur de lecture est embarqué dans l'app (aucun appel externe).
      prepareZXingModule({
        overrides: { locateFile: (path, prefix) => (path.endsWith('.wasm') ? wasm.default : prefix + path) },
        fireImmediately: true,
      });
      return new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
    })();
  }
  return detectorPromise;
}

export function ScanSheet({ open, onClose, onFood, onUnknown }) {
  const video = useRef();
  const [status, setStatus] = useState('');
  const [manual, setManual] = useState('');
  const busy = useRef(false);

  const lookup = async (code) => {
    if (busy.current) return;
    busy.current = true;
    setStatus(`Code ${code} : recherche…`);
    try {
      // déjà connu ?
      const known = (await db.customFoods.where('barcode').equals(code).first()) ?? null;
      if (known) {
        await refreshCustom();
        onFood(getFood(known.id));
        return;
      }
      const f = await offByBarcode(code);
      if (f) onFood(await saveCustomFood(f));
      else onUnknown(code);
    } catch {
      setStatus('Pas de connexion à Open Food Facts. Réessaie ou saisis le produit à la main.');
    } finally {
      busy.current = false;
    }
  };

  useEffect(() => {
    if (!open) return;
    let stream;
    let stop = false;
    setStatus('Ouverture de la caméra…');
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (stop) return;
        video.current.srcObject = stream;
        await video.current.play();
        const detector = await getDetector();
        setStatus('Vise le code-barres');
        const loop = async () => {
          if (stop) return;
          try {
            const codes = await detector.detect(video.current);
            if (codes.length && !busy.current) {
              navigator.vibrate?.(50);
              await lookup(codes[0].rawValue);
              return;
            }
          } catch {}
          setTimeout(loop, 200);
        };
        loop();
      } catch {
        setStatus("Caméra indisponible : autorise-la dans Réglages, ou tape le code ci-dessous.");
      }
    })();
    return () => {
      stop = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [open]);

  return (
    <Sheet open={open} title="Scanner un code-barres" onClose={onClose} full>
      <div class="scan-box">
        <video ref={video} playsInline muted />
        <div class="scan-frame" />
      </div>
      <p class="center muted">{status}</p>
      <div class="row">
        <NumInput value={manual} onInput={setManual} placeholder="ou tape le code" inputMode="numeric" />
        <button class="btn" disabled={manual.length < 8} onClick={() => lookup(manual.trim())}>Chercher</button>
      </div>
      <p class="muted small">Valeurs issues d'Open Food Facts (base collaborative, d'après l'étiquette du produit).</p>
    </Sheet>
  );
}
