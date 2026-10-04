# DEPENDENCY SCAN — grimdark-sim

> **But de ce document** : décider, preuve à l'appui, quelles bibliothèques externes
> méritent d'entrer dans ce dépôt — et surtout lesquelles n'y entreront pas.
> Le coût d'une dépendance n'est pas sa taille : c'est ce qu'elle nous empêche de
> comprendre, de tester et de migrer plus tard.

**Périmètre** : les six dépôts imposés par la mission V0.
**Mesuré le** : 2026-10-01, via l'API GitHub (`gh api repos/…`) et le registre npm
(`registry.npmjs.org`). Tous les chiffres ci-dessous sont **issus de ces appels**, pas de
souvenirs. La commande de rafraîchissement est donnée au §4.

---

## 0. Verdict d'ensemble

| Dépendance runtime en V0 | **0** |
| Dépendances de développement | 5 (`vite`, `vitest`, `typescript`, `tsx`, `@types/node`) |

Vérifiable : `npm ls --omit=dev --depth=0` → *(empty)*.

Décision V0 retenue par la mission, et **respectée à la lettre** :

| Dépôt | Rôle | Verdict V0 | Verdict visé par la mission |
| --- | --- | --- | --- |
| `qiao/PathFinding.js` | A\* de grille | **STUDY** | optionnel ✔ |
| `prettymuchbryce/easystarjs` | A\* asynchrone | **STUDY** | optionnel ✔ |
| `ondras/rot.js` | boîte à outils roguelike (FOV, LOS) | **STUDY** | à étudier pour le FOV ✔ |
| `pixijs/pixijs` | moteur de rendu WebGL | **STUDY — reporté** | reporté jusqu'au goulot de rendu ✔ |
| `straker/kontra` | micro-framework de jeu | **STUDY** | optionnel/étude ✔ |
| `excaliburjs/Excalibur` | moteur de jeu complet | **REJECT** | rejeté sauf justification forte ✔ |

**Aucun ADOPT en V0.** C'est un choix, pas un oubli : le prototype n'a rencontré aucun
mur technique que nos 207 lignes de pathfinding et 79 lignes de ligne de vue ne
franchissent. Une bibliothèque s'adopte pour résoudre un problème mesuré.

---

## 1. Données brutes (mesurées le 2026-10-01)

| Projet | Étoiles | Licence | Dernier push | Version npm | Publiée le | Non compressé | Dépendances | Types TS |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| qiao/PathFinding.js | 8 716 | **aucune** | 2024-06-20 | `pathfinding` 0.4.18 | **2016-05-10** | — | 1 | non |
| prettymuchbryce/easystarjs | 1 938 | MIT | 2024-01-23 | `easystarjs` 0.4.4 | 2020-10-18 | 859 KB | 1 | oui |
| ondras/rot.js | 2 719 | BSD-3-Clause | 2024-11-13 | `rot-js` 2.2.1 | 2024-11-13 | 2,5 MB | **0** | oui |
| pixijs/pixijs | 48 249 | MIT | 2026-09-30 | `pixi.js` 8.21.0 | 2026-09-17 | 73,5 MB | 10 | oui |
| straker/kontra | 1 072 | MIT | 2026-01-30 | `kontra` 10.0.2 | 2024-08-25 | 532 KB | **0** | oui |
| excaliburjs/Excalibur | 2 347 | BSD-2-Clause | 2026-10-01 | `excalibur` 0.32.0 | 2025-12-23 | 8,7 MB | **0** | oui |

> Repères internes, pour comparer : notre build complet pèse **75,7 KB minifiés
> (24,3 KB gzip)**, pour 1 496 tuiles, 26 unités, effets et HUD.

---

## 2. Verdicts détaillés

### 2.1 `qiao/PathFinding.js` — **STUDY** (ne pas adopter en l'état)

- **Ce que c'est** : A\*, Jump Point Search, Bi-A\*, IDA\*, Dijkstra sur grille, avec matrices de coût. La référence historique du pathfinding JS.
- **Ce qu'il apporterait** : JPS (utile sur de grandes grilles ouvertes) et des variantes d'algorithmes prêtes à comparer.
- **Ce qui bloque une adoption immédiate** :
  1. **Aucune licence déclarée** (l'API GitHub renvoie `license = null`). Sans licence, le code est « tous droits réservés » : on ne peut pas en embarquer des morceaux dans un dépôt privé sans clarification de l'auteur. C'est un risque juridique, pas un détail.
  2. Dernière publication npm : **2016**. Dix ans. Aucun type TypeScript fourni (il faudrait écrire et maintenir un `@types` maison).
  3. Nos besoins sont déjà couverts, mesurés : A\* 8 directions **sans coupe de coin**, coût par terrain (boue lente, tranchée très lente), lissage par ligne de vue, et *throttle* de recalcul (`src/sim/pathfinding.ts`, 207 lignes, testé). Le budget de recherche est plafonné à 4 000 nœuds ; une bataille complète de 5 minutes coûte ~80 ms de calcul.
- **Déclencheur de réévaluation** : (a) l'auteur publie une licence explicite, **et** (b) on mesure un besoin réel de JPS (carte ouverte bien plus grande, > 100×100 avec beaucoup d'unités).
- **En attendant** : on garde notre A\* maison, qui est déterministe (exigence d'architecture) et testé.

### 2.2 `prettymuchbryce/easystarjs` — **STUDY** (optionnel)

- **Ce que c'est** : API A\* **asynchrone** (calcul étalé dans le temps, à base de `calculate()` par frame), avec coûts de terrain et couches (`avoidAdditionalPoint`).
- **Ce qu'il apporterait** : si le pathfinding devait un jour sortir de la boucle de simulation (calcul étalé, Web Worker, très grandes cartes), son modèle « on calcule un peu à chaque frame » est exactement la bonne forme.
- **Pourquoi pas maintenant** :
  - MIT, typé, propre : techniquement adoptable sans risque.
  - Mais son asynchronisme **casserait notre déterminisme** tel qu'il est posé : la simulation avance à pas fixe et doit produire le même résultat à chaque exécution. Un chemin qui arrive « un peu plus tard » selon la charge machine change la bataille. L'intégrer exigerait de lui donner un budget de nœuds par tick **et** de prouver l'égalité des chemins — un travail qui n'a de sens que si l'A\* devient un goulot mesuré, ce qu'il n'est pas.
- **Déclencheur de réévaluation** : cartes > 200×200, ou > 150 unités, ou mesure montrant l'A\* > 20 % du budget d'un tick.
- **En attendant** : notre A\* synchrone à coût borné, dont le recalcul est throttlé (1,2 à 2,2 s par unité).

### 2.3 `ondras/rot.js` — **STUDY** (concepts de FOV/LOS, comme demandé)

- **Ce que c'est** : la boîte à outils roguelike de référence — FOV (shadowcasting récursif, « precise permissive »), schedulers, génération de donjons, bruit, pathfinding.
- **À étudier précisément, pour la V1** :
  1. **Ses algorithmes de FOV** : quand le brouillard de guerre arrivera (roadmap V1 §1), il faudra calculer, pour chaque unité, l'ensemble des tuiles visibles. Le shadowcasting récursif est le bon outil conceptuel — mais il répond à « vu / pas vu », alors que notre `lineOfSight` répond en plus « avec quelle couverture » (obstruction partielle d'une clôture, de gravats). On gardera donc notre modèle et l'on s'inspirera de ROT pour l'agrégation par faction.
  2. **Sa notion de bruit** : directement utile à `undeadAI` (attraction par le son et les cadavres), déjà spécifiée mais non câblée.
  3. **Son scheduler** : si l'on passe à l'initiative ou au tour par tour pour une vue « escarmouche », c'est là que ça se regarde.
- **Pourquoi pas d'adoption** : BSD-3-Clause et **zéro dépendance** (excellent), mais 2,5 MB non compressés pour utiliser 2 modules, et surtout aucun de ses algorithmes ne remplace ce que nous avons : notre LOS appartient au gameplay (elle nourrit la couverture et la chance de toucher), pas seulement à l'affichage.
- **Déclencheur de réévaluation** : le jour du brouillard de guerre, on compare honnêtement notre DDA au shadowcasting avec un test de performance sur 1 496 tuiles × 26 unités.
- **En attendant** : rien à faire, on lit leurs articles et on garde notre implémentation (79 lignes).

### 2.4 `pixijs/pixijs` — **STUDY — reporté** (jusqu'au goulot de rendu)

- **Ce que c'est** : le moteur de rendu 2D le plus utilisé du web (48 249 étoiles, poussé **hier**), WebGL/WebGPU, batching de sprites, filtres, particules.
- **Ce qu'il apporterait** : des milliers de sprites à 60 fps, des particules GPU, des shaders (brouillard, lumière, fumée volumétrique) — c'est-à-dire la couche « joli » de la V2.
- **Pourquoi reporté (et non adopté)** :
  - **Aucun goulot mesuré.** Le rendu actuel dessine ~1 500 entrées triées par profondeur par frame, à 60 fps, sans cache. Un Canvas 2D nu suffit.
  - **Le batching ne sert à rien tant que le rendu est procédural** : nous dessinons des formes (pas de textures), donc il n'y a rien à batcher. Une texture atlas + des sprites est un prérequis *avant* PixiJS — sinon on paie 73,5 MB de paquet pour redessiner des ronds.
  - **Inversion de dépendance à éviter** : PixiJS possède sa propre boucle et son propre graphe de scène. L'introduire demande de garder fermement la frontière actuelle (`renderBattle()` est le seul point d'entrée, 484 lignes dans `src/render/`), sinon le rendu commence à dicter des choses à la simulation.
- **Déclencheur d'adoption** : mesure explicite d'un budget de frame dépassé (par exemple > 8 ms de rendu à 1 500 entrées), ou besoin d'effets impossibles en Canvas 2D (lumière dynamique, milliers de particules).
- **Coût de migration, estimé honnêtement** : faible sur le papier (remplacer `src/render/renderer.ts` derrière l'appel existant) mais réel en pratique (toute la logique de tri par profondeur, de caméra et de picking est à réécrire). À faire en une fois, pas en coexistence.

### 2.5 `straker/kontra` — **STUDY** (optionnel)

- **Ce que c'est** : micro-bibliothèque de jeu (boucle, sprites, entrées, tuiles), MIT, **zéro dépendance**, 532 KB.
- **Ce qu'elle apporterait** : une boucle de jeu et un gestionnaire d'entrées prêts, et un excellent support d'entrée/sortie pour un prototype « fait en une soirée ».
- **Pourquoi pas maintenant** : notre boucle est déjà là et déjà juste — pas fixe de 100 ms, accumulateur, interpolation du rendu, vitesse ×1/×2/×4, plafond de 60 ticks par frame (40 lignes dans `src/app.ts`). Kontra apporterait surtout… à peu près ce que nous venons d'écrire, et sa boucle devrait de toute façon être adaptée à notre pas fixe.
- **Déclencheur de réévaluation** : un second prototype (hors-série, jam, test de gameplay isolé) où l'on veut aller vite sans traîner la structure actuelle.
- **En attendant** : rien. **Mais** c'est la dépendance la plus « acceptable » de la liste si l'on doit en prendre une : MIT, sans dépendance, et elle ne prétend pas posséder la simulation.

### 2.6 `excaliburjs/Excalibur` — **REJECT** (pour ce projet)

- **Ce que c'est** : un moteur de jeu 2D complet et sérieux en TypeScript (BSD-2, très actif, poussé aujourd'hui même), avec graphe de scène, physique, tuiles, son, ressources.
- **Pourquoi un rejet franc, et pas un « plus tard »** :
  1. **Il remplacerait l'architecture, pas une brique.** Excalibur possède la boucle, l'`Actor` et son cycle de vie. Notre invariant central est que **la simulation possède les règles et ne dépend de rien** : un moteur qui impose son modèle d'objet revient à réécrire `src/sim` sous sa dictée, et à rendre les tests headless beaucoup plus difficiles (le test d'architecture deviendrait impossible à tenir).
  2. **Le goulot d'étranglement de ce projet n'est pas le rendu, c'est la vitesse d'itération sur le gameplay.** Un moteur de 8,7 MB ajoute un vocabulaire à apprendre pour chaque modification de règle, sans rien apporter à la question « est-ce que le jeu est amusant ? ».
  3. **La porte de sortie existe déjà et n'est pas Excalibur.** Si l'on veut un vrai 2.5D en perspective, des animations squelettiques et un export desktop, la cible documentée au ROADMAP est **Godot**, pas un moteur web (la mission V0 interdit d'ailleurs explicitement Godot *pour l'instant* — mais elle reste la destination prévue, et elle est plus adaptée que n'importe quelle bibliothèque web pour ce besoin précis).
- **Justification forte qui pourrait inverser la décision** : si le projet devenait un jeu d'arcade 2D à sprites/tuiles riche (plateforme, shmup), Excalibur serait un excellent choix. Ce n'est pas ce jeu.
- **Verdict** : REJECT pour grimdark-sim. Un plaisir à recommander à un autre projet.

---

## 3. Ce que ce scan protège vraiment

Trois invariants du dépôt seraient cassés par une mauvaise adoption :

| Invariant | Menace identifiée | Ce que le scan décide |
| --- | --- | --- |
| **Déterminisme** (même graine ⇒ même bataille) | A\* asynchrone, boucle de moteur externe, RNG d'une bibliothèque | easyStar (async) et moteur complet → refusés en V0 |
| **Simulation sans DOM, testable en Node** | tout moteur qui impose son propre cycle de vie à la simulation | Excalibur → REJECT ; PixiJS → strictement derrière `src/render/` |
| **Le gameplay avant le rendu** | payer une couche graphique avant d'avoir un goulot mesuré | PixiJS → reporté, avec un déclencheur chiffré |

---

## 4. Rafraîchir ce scan (à refaire tous les 6 mois)

```bash
# Faits GitHub (étoiles, licence, dernier push, issues)
for r in qiao/PathFinding.js prettymuchbryce/easystarjs ondras/rot.js \
         pixijs/pixijs straker/kontra excaliburjs/Excalibur; do
  printf "%-32s " "$r"
  gh api "repos/$r" --jq '"stars=\(.stargazers_count) license=\(.license.spdx_id) pushed=\(.pushed_at[0:10])"'
done

# Faits npm (version, date, taille, dépendances, types)
for p in pathfinding easystarjs rot-js pixi.js kontra excalibur; do
  printf "%-14s " "$p"
  curl -s "https://registry.npmjs.org/$p" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);const v=j['dist-tags'].latest;console.log('latest='+v+' published='+j.time[v].slice(0,10)+' deps='+Object.keys(j.versions[v].dependencies||{}).length)})"
done
```

**Critères d'adoption d'une nouvelle dépendance** (proposition de règle de maison) :

1. Elle résout un **problème mesuré**, avec le chiffre dans la PR.
2. Licence explicite et compatible (MIT / BSD / Apache-2) — pas de « pas de licence ».
3. Elle **ne possède pas la boucle de jeu ni l'état** : elle rend un service, elle ne prend pas la direction.
4. Elle ne compromet ni le déterminisme, ni la simulation sans DOM (le test d'architecture doit continuer de passer).
5. Si elle double une fonctionnalité maison de moins de 250 lignes **déjà testée**, la charge de la preuve est sur elle.
