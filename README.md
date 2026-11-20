# Suivi Nutrition

Application personnelle (PWA iPhone) de suivi nutrition et effort physique.
Toutes les données restent **dans le téléphone** : aucun compte, aucun serveur, aucune donnée dans ce dépôt.

**Adresse :** https://ik3ur.github.io/suiviNutrition/

## Installer sur l'iPhone

1. Ouvrir l'adresse ci-dessus dans **Safari**.
2. Bouton Partager → **Sur l'écran d'accueil** → Ajouter.
3. Toujours ouvrir l'app depuis cette icône (Safari garde une mémoire séparée).

L'app fonctionne ensuite hors connexion. Seuls la recherche Open Food Facts et le code-barres demandent du réseau.

## Ce que fait la v1

| Page | Contenu |
|---|---|
| **Nutrition** | Recherche instantanée dans Ciqual (tolère fautes et accents, cru et cuit séparés), favoris et récents en premier, portion petite / normale / grosse en 1 tap, repas types, photo analysée via l'app Claude (copier-coller), code-barres Open Food Facts, aliment perso depuis l'étiquette |
| **Effort** | Renfo maison (haltères, traction, dips, poids du corps) prérempli avec la dernière séance, course, natation, dépense estimée **à titre indicatif** |
| **Bilan** | Jour (écarts à la cible, conseils), semaine (tableau 7 jours, moyennes), poids en moyenne sur 7 jours, sauvegarde |

Cible fixe : **2 000 kcal · 130 g protéines · 225 g glucides · 65 g lipides**. Elle ne varie jamais avec l'effort.

## Sources des valeurs nutritionnelles

- **ANSES, Table Ciqual 2025** (licence CC-BY 4.0), https://zenodo.org/records/17550133. Converti par `scripts/build_ciqual.py` en `public/ciqual.json`.
- **Open Food Facts** (licence ODbL) pour les produits emballés.
- Les aliments « perso » reprennent les valeurs de l'étiquette saisies à la main.

L'IA ne fournit jamais de calories : elle donne seulement des noms d'aliments et des grammes, et les valeurs viennent de Ciqual.

## Sauvegarde

Bilan → **Exporter** → « Enregistrer dans Fichiers » (iCloud Drive). Un point orange sur l'onglet Bilan rappelle de sauvegarder chaque semaine.
**Importer** remplace toutes les données par celles du fichier.

## Développement

```bash
npm install
npm run dev      # serveur local (accessible depuis le téléphone sur le même Wi-Fi)
npm run build    # version de production dans dist/
```

Chaque push sur `main` est publié automatiquement sur GitHub Pages (`.github/workflows/deploy.yml`).

Mise à jour de la table Ciqual :

```bash
python3 scripts/build_ciqual.py <dossier contenant alim.xml, alim_grp.xml, compo.xml> public/ciqual.json
```

Stack : Vite, Preact, Dexie (IndexedDB), vite-plugin-pwa, barcode-detector (lecteur de code-barres embarqué).

## Pour plus tard

Import Strava, courbes (poids, macros), bilan mensuel, analyse photo directe par API (payante), déverrouillage Face ID,
synchronisation entre appareils, rappel de pesée, copier la journée d'hier.
