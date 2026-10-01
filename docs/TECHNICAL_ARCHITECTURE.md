# ARCHITECTURE TECHNIQUE — grimdark-sim

> Objectif de ce document : qu'un agent (humain ou IA) puisse modifier n'importe quelle
> partie du projet **sans casser les invariants**, et sache où poser un nouveau morceau.

---

## 1. Vue d'ensemble

```
                        ┌─────────────────────────────────────────┐
                        │              DONNÉES (src/data)         │
                        │  terrains · armes · unités · factions   │
                        │  cartes ASCII (village-church.ts)       │
                        └───────────────┬─────────────────────────┘
                                        │ lu par (jamais l'inverse)
                        ┌───────────────▼─────────────────────────┐
                        │            SIMULATION (src/sim)         │
                        │  état · LOS · couverture · pathfinding  │
                        │  combat · morale · explosions · IA      │
                        │  AUCUN DOM, AUCUN CANVAS, DÉTERMINISTE  │
                        └───────────────┬─────────────────────────┘
                          état (lecture) │ ▲ ordres (écriture)
                        ┌───────────────▼─┴───────────────────────┐
                        │           APPLICATION (src/app.ts)      │
                        │  boucle temps réel, pas fixe de 100 ms  │
                        │  SEUL point de contact sim <-> rendu    │
                        └───┬─────────────┬───────────────┬───────┘
                            │             │               │
              ┌─────────────▼──┐  ┌───────▼──────┐  ┌─────▼─────────┐
              │ RENDU          │  │ ENTRÉES      │  │ UI / HUD      │
              │ src/render     │  │ src/input    │  │ src/ui        │
              │ Canvas 2D iso  │  │ souris/clavier│ │ DOM           │
              └────────────────┘  └──────────────┘  └───────────────┘
```

### Règles de dépendance (vérifiées automatiquement)

| Règle | Vérifiée par |
| --- | --- |
| `src/sim`, `src/core`, `src/data` n'importent ni `render`/`ui`/`input`, ni `document`, ni `window`, ni `requestAnimationFrame`, ni `getContext` | `tests/architecture.test.ts` |
| `src/render`, `src/ui`, `src/input` n'importent la simulation que par son **API publique** (`../sim`) — jamais un module interne | `tests/architecture.test.ts` |
| Le rendu ne mute jamais une unité : il lit et dessine | revue + usage de `ReadonlySet`, d'API de lecture |
| Tout hasard de simulation passe par `state.rng` (mulberry32) dans un ordre d'appel stable | `tests/simulation.test.ts` (déterminisme) + `tests/map.test.ts` (carte) |

**Ces tests ne vérifient pas un comportement, ils vérifient une frontière.** C'est le
garde-fou qui empêche (à 3 h du matin, par un agent pressé) de faire fuir du code de rendu
dans la simulation et de rendre le jeu intestable.

---

## 2. La boucle de jeu

```ts
// src/app.ts (résumé)
accumulateur += dtRéel * vitesse;                // vitesse ∈ {1, 2, 4}
while (accumulateur >= SIM_DT && steps < 60) {  // SIM_DT = 0,1 s  → 10 ticks/s
  const events = stepSimulation(state);          // la simulation avance d'un cran
  effects.spawnFromEvents(state, events);        // les événements deviennent du visuel
  for (const e of events) hud.logEvent(e);       // et du texte dans le journal
  accumulateur -= SIM_DT;
}
renderBattle({ ...état, alpha: accumulateur / SIM_DT });
```

- **Pas fixe** : la simulation ne dépend jamais de la vitesse d'affichage. Un ordinateur lent et un ordinateur rapide produisent la même bataille.
- **Interpolation** : le rendu mélange `unit.prevX/prevY` (position au tick précédent) et `unit.x/y` par `alpha`. C'est ce qui rend le mouvement fluide à 60 fps alors que la simulation tourne à 10 Hz.
- **Vitesse ×4** : on exécute simplement 4 fois plus de ticks par seconde réelle (plafonné à 60 ticks par frame pour éviter la spirale de la mort).

---

## 3. Déterminisme : comment il est obtenu

| Source de non-déterminisme | Traitement |
| --- | --- |
| Hasard | `Rng` (mulberry32) par état, jamais `Math.random()` dans `src/sim` |
| `Date.now()` / `performance.now()` | interdits dans `src/sim` |
| Itération d'objets | les factions sont ordonnées par `FACTION_IDS`, les unités par index de tableau |
| Tri | tris explicites et stables (`sort` avec comparaison numérique) |
| Nombres flottants | les mêmes opérations dans le même ordre ⇒ les mêmes bits ; `hashState` compare des valeurs arrondies |
| Rendu | RNG séparé (`Effects`) : les particules ne peuvent pas influencer le combat |
| Carte | « dégâts de guerre » générés par un RNG dédié à graine fixe (`scatter.seed`) |

`hashState(state)` produit une empreinte de l'état complet (tick, unités, positions, moral,
suppression, PV des structures). Test : deux simulations à graine 4242 sur 500 ticks
donnent **exactement** le même hash.

> Conséquence directe : le multijoueur « lockstep » et le rejeu de bataille sont possibles
> sans refonte. C'est pour ça que cette contrainte a été posée dès la V0, alors qu'elle
> n'était pas demandée.

---

## 4. Carte du code (où poser les choses)

| Fichier | Lignes | Responsabilité |
| --- | --- | --- |
| `src/core/rng.ts` | 67 | RNG déterministe, `hashString` |
| `src/core/math.ts` | 28 | `clamp`, `lerp`, `distance` |
| `src/data/terrain.ts` | 251 | **Table des terrains** : solidité, couverture (tuile + LOS), coût, PV, transformation, couleurs |
| `src/data/weapons.ts` | 263 | **Armes** : portée, précision, dégâts, salve, rechargement, suppression, explosion |
| `src/data/units.ts` | 275 | **13 archétypes** : PV, armure, vitesse, compétence, moral, discipline, vision, capacités, traits |
| `src/data/factions.ts` | 82 | **Factions** : couleurs, doctrine, composition d'armée, zone de déploiement |
| `src/data/maps/village-church.ts` | 107 | **Carte ASCII** + objectifs + déploiements + dégâts de guerre |
| `src/sim/types.ts` | 219 | Tout l'état (`SimState`, `Unit`, `Projectile`, `SimEvent`, `Order`) |
| `src/sim/map.ts` | 195 | Compilation de la carte, accès aux tuiles, destruction, objectifs |
| `src/sim/los.ts` | 79 | Ligne de vue « supercover » (DDA) + couverture |
| `src/sim/pathfinding.ts` | 207 | A\* 8 directions sans coupe de coin, lissage, recherche de couverture |
| `src/sim/movement.ts` | 115 | Suivi de chemin, coût du terrain, séparation des unités, throttle de repath |
| `src/sim/combat.ts` | 257 | Précision, choix de cible, résolution de salve, rechargement, dégâts, mort |
| `src/sim/morale.ts` | 151 | Suppression, moral, transitions d'état, ralliement, aura de commandement |
| `src/sim/explosion.ts` | 89 | Point unique de résolution des explosions (dégâts + terrain + moral) |
| `src/sim/abilities.ts` | 160 | Grenades, barrages d'artillerie, charge, temps de recharge |
| `src/sim/ai.ts` | 348 | IA légère : couvert, capacités, engagement, posture |
| `src/sim/simulation.ts` | 467 | Création, déploiement, boucle `stepSimulation`, ordres, objectifs, victoire, `hashState` |
| `src/render/iso.ts` | 45 | Projection isométrique 2:1 et son inverse (utilisée par la souris) |
| `src/render/camera.ts` | 95 | Zoom, déplacement, cadrage, culling |
| `src/render/renderer.ts` | 454 | Tri par profondeur, tuiles extrudées, objectifs, projectiles, calques tactiques |
| `src/render/sprites.ts` | 161 | Unités et cadavres procéduraux, barres d'état |
| `src/render/effects.ts` | 324 | Traçants, impacts, sang, explosions, fumée, textes |
| `src/input/controls.ts` | 253 | Gestes souris/clavier (ne connaît ni le jeu ni la simulation) |
| `src/ui/hud.ts` | 332 | Tableau de bord, fiche d'unité, journal |
| `src/app.ts` | 332 | Boucle, sélection, traduction gestes → ordres |
| `scripts/headless-battle.ts` | 69 | Bataille complète en Node avec rapport |
| `scripts/inspect-map.ts` | 69 | Outil d'édition de carte (règle de colonnes) |

### Le patron « événement » (simulation → présentation)

La simulation ne connaît personne ; elle publie des `SimEvent` :

```ts
state.events.push({ tick, type: 'kill', unitId, faction, x, y });
```

`stepSimulation()` vide `state.events` à chaque tick et retourne le tableau. L'application
les distribue : `Effects` (visuel) et `Hud` (texte). **Pour ajouter un retour visuel ou
sonore, on ajoute un type d'événement dans `src/sim/types.ts` et on l'émet depuis la
règle de jeu concernée** — jamais en fouillant l'état depuis le rendu.

---

## 5. Recettes d'extension

### Ajouter un terrain

1. `src/data/terrain.ts` : ajouter l'entrée (`solid`, `tileCover`, `losCover`, `moveCost`, `hp`, `becomes`, `height`, couleurs).
2. `src/data/maps/*.ts` : ajouter le glyphe dans la légende et semer le terrain dans les rangées.
3. C'est tout. Rendu, LOS, pathfinding et destruction s'adaptent automatiquement.

### Ajouter une arme

`src/data/weapons.ts` puis référencer son `id` dans un `UnitDef.weapon`. Les champs
`kind`, `reloadEvery/reloadTime`, `splashRadius` et `arcTime` suffisent à couvrir : tir
direct, rafale, tir de suppression, arc (grenade) et artillerie hors-carte.

### Ajouter une unité

`src/data/units.ts` (statistiques + `abilities` + `traits`) puis `src/data/factions.ts`
(composition, c'est ce qui décide qui l'aligne). Si la capacité est nouvelle, il faut
aussi : le type d'`AbilityId`, sa résolution (`src/sim/abilities.ts`), son usage par l'IA
(`src/sim/ai.ts`) et éventuellement un bouton dans le HUD.

### Ajouter une carte

Créer `src/data/maps/<nom>.ts` (module `MapDefinition`), la déclarer là où
`createSimulation()` choisit la carte, puis `npm run map:inspect` pour vérifier
l'alignement des colonnes. Les tests `tests/data.test.ts` valident la cohérence
(glyphes, objectifs dans les bornes, zones de déploiement praticables, lignes de repli).

### Ajouter une mécanique de combat

1. Champs dans `src/data` si c'est un réglage.
2. Règle dans le module `src/sim` concerné (`combat`, `morale`, `explosion`, `movement`).
3. Événement(s) dans `src/sim/types.ts` si le rendu/le HUD doit le montrer.
4. Test unitaire dans `tests/` **et** vérification headless (`npm run headless`).

---

## 6. Performance

Mesurée par le banc headless, sur une machine de développement standard :

| Mesure | Valeur |
| --- | --- |
| Simulation | **3 800 à 40 000 ticks/s** selon la phase (contact ou non) |
| Une bataille de 5 minutes de jeu | ~80 ms de calcul total |
| Budget d'un tick à 26 unités | < 1 ms : largement dans les 100 ms disponibles |
| Rendu | 1 496 tuiles + 26 unités + effets, tri par profondeur à chaque frame, 60 fps confortables |

Points chauds identifiés :

- **A\*** : coûteux s'il est recalculé à chaque tick. D'où le *throttle* dans `src/sim/movement.ts` (`nextRepathTick`) : un chemin est recalculé au plus toutes les 1,2 à 2,2 secondes, ou si la destination a bougé de plus de 2,5 tuiles.
- **Tri par profondeur** : ~1 500 entrées par frame ; acceptable. Si la carte grandit, découper en chunks.
- **`separateUnits`** : O(n²) sur 26 unités = 325 paires ; à revoir au-delà de ~80 unités (grille spatiale).

---

## 7. Stratégie de test

| Fichier | Ce qu'il protège |
| --- | --- |
| `tests/map.test.ts` | compilation, église/beffroi/tranchées, déterminisme de la carte, déploiement |
| `tests/los.test.ts` | ligne de vue bloquée/partielle, couverture des tranchées vs boue |
| `tests/combat.test.ts` | bornes de précision, effet du couvert, suppression, mort, deuil des camarades |
| `tests/morale.test.ts` | seuils de clouage et de rupture, fanatiques, récupération, ralliement |
| `tests/explosion.test.ts` | mur → gravats, boue → cratère, dégâts ami/ennemi, mort par grenade |
| `tests/simulation.test.ts` | déploiement 13/13, déterminisme, ordres (acceptés/refusés), artillerie jusqu'à l'impact, 3 min de bataille sans casser d'invariant, victoire |
| `tests/data.test.ts` | cohérence des données (rosters, armes, terrains, carte) |
| `tests/architecture.test.ts` | **la frontière simulation/rendu et le déterminisme par analyse statique** |
| `npm run headless` | validation « vivante » : une bataille doit produire des pertes, des fuyards, des obus, des ruines |

Le test le plus utile du dépôt est peut-être `simulation.test.ts` : il simule **3 minutes de
guerre** et vérifie qu'aucun invariant ne casse (PV ≥ 0, moral ∈ [0,100], unités dans les
bornes, etc.). C'est le filet de sécurité des changements d'équilibrage.

---

## 8. Choix techniques — et pourquoi

| Choix | Raison | Alternative écartée |
| --- | --- | --- |
| **Vite + TypeScript** | Build en ~300 ms, HMR instantané, la simulation tourne aussi dans Node pour les tests | Next.js : SSR/hydratation inutiles pour une boucle de jeu |
| **Canvas 2D** | Zéro dépendance, un canvas, lisible, suffisant pour 1 500 tuiles et 26 unités | PixiJS/WebGL : à ajouter seulement si le nombre de sprites explose |
| **Pas de framework UI** | Le HUD est du DOM simple, réécrit 5 fois par seconde | React : re-rendu inutile d'une boucle de jeu |
| **Projection iso faite main** | `worldToIso`/`isoToWorld` tiennent en 10 lignes et donnent le picking souris gratuitement | bibliothèque iso : boîte noire pour un besoin trivial |
| **Données en TypeScript** (pas JSON) | autocomplétion, typage fort, valeurs partagées (couleurs, ids) | CSV/JSON : perte du typage, chargement asynchrone |
| **Carte en ASCII** | le format le plus rapide à éditer pour un humain *et* pour un agent | éditeur visuel (V2) |
| **IA en cascade** | 60 lignes lisibles, comportement prévisible et débuggable | arbre de comportement / GOAP : complexité prématurée |
| **Vitest, environnement node** | impose que la simulation tourne sans DOM — **le test est l'architecture** | jsdom : masquerait les fuites de dépendance |

---

## 9. Migration future (si le jeu prend)

Le projet est structuré pour que **le rendu soit la seule chose jetable** :

1. `src/sim` + `src/data` : aucune dépendance au navigateur → portables tels quels (GDScript, C#, ou TypeScript compilé).
2. `src/render/iso.ts` : seule connaissance de la projection. Un passage en 3D/perspective se fait là.
3. `src/app.ts` : seul endroit qui connaît la boucle temps réel.
4. `tests/` : devient la **spécification exécutable** de la réimplémentation (c'est déjà le cas aujourd'hui).

La porte de sortie est décrite dans `docs/ROADMAP.md` (section « La porte de sortie : Godot »).
