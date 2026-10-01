# ROADMAP — grimdark-sim

Une seule règle : **on n'ajoute pas une couche avant que la précédente soit jouable et
mesurable**. Chaque étape a une « preuve » : ce qui doit être vrai pour la considérer finie.

---

## V0 — Fondation *(livrée, branche `feat/grimdark-sim-v0-foundation`)*

| Élément | État | Preuve |
| --- | --- | --- |
| Base projet installable (Vite + TypeScript + Vitest) | ✅ | `npm install && npm run build` |
| Simulation séparée du rendu | ✅ | `tests/architecture.test.ts` |
| Carte village + église + tranchées + no man's land | ✅ | `npm run map:inspect`, `tests/map.test.ts` |
| Deux factions, 13 unités par camp | ✅ | `tests/simulation.test.ts` |
| Caméra isométrique 2.5D, murs extrudés, tri de profondeur | ✅ | rendu navigateur |
| Déplacement, couverture, tir, morale, suppression | ✅ | tests combat/moral + headless |
| Grenades et artillerie simple | ✅ | `tests/explosion.test.ts`, `tests/simulation.test.ts` |
| Terrain destructible basique (murs → gravats, boue → cratères) | ✅ | `tests/explosion.test.ts` |
| Déterminisme (même graine ⇒ même bataille) | ✅ | `tests/simulation.test.ts` |
| Documentation (README + 4 documents) | ✅ | `docs/` |

**Ce qui a été appris en V0** : sans rechargements, sans discipline de tir et sans réflexe
de mise à couvert, une bataille se termine en 23 secondes par extermination mutuelle.
Le moral n'est pas un supplément : c'est le système principal. Voir `docs/GAME_DESIGN.md` §6.

---

## V1 — Le jeu qu'on veut jouer

### 1. Vision et information (priorité haute)

- [ ] **Brouillard de guerre** par faction : on ne voit que ce que nos unités voient (l'IA triche raisonnablement, pas totalement).
- [ ] Cônes/cercles de vision affichés en permanence pour la sélection.
- [ ] Dernière position connue des ennemis (marqueurs fantômes qui vieillissent).
- *Preuve* : une unité isolée ne « sait » plus ce qui se passe à l'autre bout du hameau.

### 2. Temps et décision

- [ ] Limite de temps (ex. 12 min) puis victoire aux objectifs pondérés — les batailles peuvent s'enliser (mesuré : jusqu'à 10 min sans décision).
- [ ] Ordres différés : un ordre met quelques secondes à atteindre l'unité quand elle est sous le feu (le « runner » du sergent).
- [ ] Pause tactique avec file d'ordres (donner des ordres en pause, les exécuter en reprenant).
- *Preuve* : la fin de partie est décidée dans 100 % des cas en moins de 12 minutes.

### 3. Combat et logistique

- [ ] **Munitions** : `WeaponDef.ammo` existe déjà et n'est pas consommé. Le consommer, ajouter le ravitaillement (caisson, porteur) et le rechargement à l'abri.
- [ ] **Blessés** : un état intermédiaire entre vivant et mort — un blessé consomme du moral et des hommes pour le traîner.
- [ ] **Corps à corps réel** : mêlée résolue au contact, avec panique des témoins.
- [ ] **Infiltration / furtivité** : un éclaireur accroupi en tranchée est difficile à repérer.
- *Preuve* : une bataille peut se gagner par épuisement logistique, pas seulement par le feu.

### 4. Terrain

- [ ] **Hauteur réelle** : toits, étages, clocher occupable (le beffroi est aujourd'hui un simple mur plein).
- [ ] **Obstacles posés** : barbelés, mines, chevaux de frise (constructibles par un sapeur).
- [ ] **Fumigènes** : couper une ligne de vue pendant 20 secondes pour traverser une rue.
- [ ] **Incendies** : un bâtiment qui brûle éclaire et bloque le passage.
- *Preuve* : deux parties sur la même carte se jouent différemment selon le terrain transformé.

### 5. Campagne et méta

- [ ] Sauvegarde/rejeu : `hashState` et le déterminisme existent déjà ; il manque la sérialisation et le rejeu depuis un journal d'ordres.
- [ ] Escarmouche à objectifs variables (génération de carte à partir d'une graine).
- [ ] Progression : survivre à N batailles avec les mêmes hommes (noms, blessures, décorations).
- *Preuve* : on peut rejouer une bataille d'hier, tick par tick, et obtenir le même résultat.

### 6. Présentation

- [ ] Sons : tirs, cloches, obus, cris d'ordres (aucun son aujourd'hui).
- [ ] Animations discrètes : recul du tireur, chute, ruines qui s'effondrent par morceaux.
- [ ] Écran de briefing/débriefing avec le rapport de bataille (déjà produit en texte par `summarize`).

### 7. Équilibrage (chantier permanent)

- [ ] Outil de comparaison : 50 batailles headless, statistiques agrégées par faction (taux de victoire, morts, fuyards, obus).
- [ ] Objectif : **50 % ± 10 %** de victoires par camp sur 50 graines, et **6 à 10 morts par camp** en moyenne.
- *Preuve* : `npm run bisect:balance` (à écrire) affiche le tableau.

---

## V2 — Envisager le vrai jeu

- [ ] **Multi-niveaux de terrain** (vespasiennes, étages, caves) — c'est le vrai saut de complexité.
- [ ] **Véhicules/marcheurs** lourds (la Sentinelle mécanisée n'est qu'un fantassin blindé aujourd'hui).
- [ ] **Doctrine d'IA par faction** (agressive Pénitents, méthodique Ordre), avec préférences d'objectifs.
- [ ] **Météo et cycle jour/nuit** (pluie qui masque, boue qui ralentit, nuit qui réduit la portée).
- [ ] **Éditeur de carte in-game** (l'ASCII est déjà un format d'édition : en faire un outil).

### La porte de sortie : Godot

Si le gameplay « prend » (c'est-à-dire si vous jouez encore après trois semaines), la
migration se fera vers **Godot 4** :

- La simulation est **déjà portable** telle quelle : c'est du TypeScript pur sans DOM. Elle peut être traduite en GDScript, ou rester en TypeScript via une compilation, ou être réimplémentée en gardant les mêmes données (`src/data` est du JSON déguisé).
- Le rendu Canvas 2D est **jetable par conception** : tout passe par `src/render/iso.ts` (projection) et `src/app.ts` (boucle). Remplacer le rendu ne touche ni `src/sim` ni `src/data`.
- Les tests (`tests/`) deviennent la spécification de la réimplémentation.

**Critère de décision** : on migre quand on veut du 2.5D en perspective réelle, des
animations squelettiques ou un export desktop — pas avant. Tant que la question est
« est-ce que le jeu est amusant ? », Vite + Canvas est plus rapide à itérer.

---

## Dettes techniques connues (assumées)

| Dette | Pourquoi c'est acceptable en V0 | Quand la payer |
| --- | --- | --- |
| `summarize()` et le rendu lisent des champs non indexés (`state.units[id-1]`) | l'invariant « id = index + 1 » est maintenu à la création | avant un système de sauvegarde/chargement |
| Pas de collision physique entre unités (simple séparation) | 26 unités, ça suffit visuellement | si l'on passe à 60+ unités |
| Rendu : tout est redessiné chaque frame (pas de cache de tuiles) | la carte fait 1 496 tuiles et tourne à 60 fps | si l'on zoome sur de très grandes cartes |
| Pas de brouillard de guerre | le prototype doit être lisible d'abord | V1 §1 |
| Aucun son | le gameplay d'abord | V1 §6 |
| Équilibrage « à la main » sur 4 graines | les outils de mesure existent (`headless`) | V1 §7 |
