# grimdark-sim — v0 « Le Hameau de la Cloche »

Prototype jouable d'un **simulateur de guerre tactique isométrique 2.5D grimdark** :
un village déjà mort, une église encore debout, deux lignes de tranchées creusées dans
la même boue, et deux factions religieuses-industrielles qui se disputent un mètre de
terrain consacré. La couverture, la suppression, le moral et l'artillerie décident —
pas les points de vie.

> **Statut : V0 — fondation.** Ce n'est pas un jeu complet. C'est une base propre,
> data-driven et testée, sur laquelle la V1 peut être construite sans rien casser.

---

## Ce qui marche aujourd'hui

**Simulation (100 % sans navigateur)**
- Carte de 44 × 34 tuiles : hameau ruiné, église + beffroi, cimetière, Grand-Rue, deux lignes de tranchées, no man's land labouré d'obus.
- Deux factions de **13 unités chacune** (10 à 15 = objectif V1 atteint), 13 archétypes d'unités, 10 armes.
- **Couverture** : apportée par la tuile occupée *et* par ce que la ligne de vue traverse (gravats, clôtures, parapets).
- **Ligne de vue** réelle (traversée de grille type DDA) : un mur coupe le tir, on ne tire pas à travers une église.
- **Suppression** : les balles qui claquent pincent les nerfs même quand elles ratent ; une unité clouée au sol rompt son assaut.
- **Moral** : pertes proches, officiers tués, feu continu, isolement. En dessous du seuil, l'unité se replie et **quitte le champ** (comptée en fuyard, pas en cadavre).
- **Rechargements** et discipline de tir : les armes ont un rythme fini, ce qui crée les accalmies du champ de bataille.
- **Grenades** (capacité unitaire, arme à arc qui passe par-dessus les murs) et **barrages d'artillerie** hors-carte demandés par un observateur (dispersion, 5 obus, 6 s de vol).
- **Terrain destructible basique** : murs → gravats, boue → cratères, les tranchées se comblent ; l'église peut finir rasée.
- **Objectifs** capturés/contestés (nef, beffroi, croisement, fermes) et conditions de victoire (anéantissement ou effondrement d'un camp).
- **Déterminisme total** : même graine ⇒ même bataille au tick près (vérifié par test).

**Rendu (remplaçable, volontairement simple)**
- Projection isométrique 2:1 (48 × 24 px par tuile), murs extrudés, tri par profondeur : un mur masque bien l'unité derrière lui.
- Unités 100 % procédurales (aucun asset) : couleur de faction, arme orientée, vie/moral/suppression, état (clouée, démoralisée, à couvert, charge).
- Effets : traçants, impacts, sang, explosions, fumée, drapeaux d'objectif, textes d'état.
- Calques tactiques : couverture (touche C), lignes de vue et portées (L), chemins (P).
- HUD DOM : tableau de bord des deux camps, fiche d'unité, journal de bataille, boutons d'ordres, bandeau de fin.

**Qualité**
- **63 tests** (Vitest) : carte, ligne de vue, combat, moral, explosions, déterminisme, bataille complète de 3 minutes simulée headless.
- **Test d'architecture** : interdit par analyse statique tout import de rendu dans la simulation, et impose que le rendu passe par l'API publique `src/sim`.
- Banc d'essai **headless** : une bataille complète (~40 000 ticks/s) avec rapport détaillé, sans ouvrir de navigateur.

---

## Démarrage

```bash
npm install

npm run dev          # serveur de dev Vite (port 5183 par défaut)
npm run dev -- --host  # accessible depuis une autre machine
```

Puis ouvrir l'URL affichée (par défaut <http://localhost:5183>).
La graine est fixe (20261001) : la même bataille se rejoue à l'identique à chaque
rechargement. Le bouton **Nouvelle bataille** tire une graine aléatoire.

### Commandes

| Commande | Rôle |
| --- | --- |
| `npm run dev` | Serveur de développement (Vite). |
| `npm run build` | Typecheck **puis** build de production dans `dist/`. |
| `npm run preview` | Sert le build de production. |
| `npm run typecheck` | `tsc --noEmit` seul. |
| `npm test` | Toute la suite Vitest. |
| `npm run test:watch` | Tests en continu. |
| `npm run headless -- 777 600` | Bataille complète sans navigateur (graine, durée en secondes) + rapport. |
| `npm run map:inspect` | Imprime la carte compilée avec une règle de colonnes (outil d'édition de carte). |
| `npm run check` | typecheck + tests + build : à lancer avant tout commit. |

### Commandes en jeu

| Touche | Action |
| --- | --- |
| Clic gauche | Sélectionner une unité ; clic glissé = sélection de groupe. |
| Clic droit | Ordre de déplacement, ou d'attaque sur un ennemi. |
| Molette / clic central | Zoom / déplacement de la caméra (ou ZQSD / flèches). |
| `F` / `H` / `R` / `T` | Assaut, tenir, repli, ralliement. |
| `G` / `B` | Grenade, barrage d'artillerie (puis clic gauche sur la cible). |
| `C` / `L` / `P` | Couverture, lignes de vue, chemins. |
| `Espace`, `1`, `2`, `3` | Pause, vitesse ×1, ×2, ×4. |

Les **deux camps sont pilotables** : c'est un bac à sable. Sans ordre, chaque unité
applique sa doctrine (chercher un couvert, arroser, avancer sur les objectifs, se replier
si le moral casse).

---

## Architecture en trois phrases

1. `src/sim` **est** le jeu : état, règles, IA, ordres. Zéro DOM, zéro canvas — testable dans Node.
2. `src/data` contient tout ce qui se règle sans coder : terrains, armes, unités, factions, cartes ASCII.
3. `src/render`, `src/input`, `src/ui` ne font que **montrer** et **écouter** ; ils lisent l'état et produisent des ordres, jamais l'inverse.

Détails, schémas et recettes d'extension : [docs/TECHNICAL_ARCHITECTURE.md](docs/TECHNICAL_ARCHITECTURE.md).

```
grimdark-sim/
├── index.html              # coquille de la page + HUD statique
├── src/
│   ├── core/               # math, RNG déterministe, types partagés
│   ├── data/               # DONNÉES DU JEU (éditables sans toucher au moteur)
│   │   ├── terrain.ts      #   table des terrains (couverture, solidité, PV, rendu)
│   │   ├── weapons.ts      #   armes, cadences, rechargements, explosions
│   │   ├── units.ts        #   archétypes d'unités (13)
│   │   ├── factions.ts     #   les deux factions + composition d'armée
│   │   └── maps/village-church.ts   # la carte en ASCII
│   ├── sim/                # SIMULATION PURE (le jeu)
│   ├── render/             # rendu isométrique Canvas 2D
│   ├── input/              # souris/clavier
│   ├── ui/                 # HUD DOM
│   ├── app.ts              # boucle temps réel, seul point de contact sim <-> rendu
│   └── main.ts             # amorçage navigateur
├── scripts/                # headless-battle.ts, inspect-map.ts
├── tests/                  # 63 tests Vitest + test d'architecture
└── docs/                   # GAME_DESIGN, VIBE_PROMPT, ROADMAP, TECHNICAL_ARCHITECTURE
```

---

## Documentation

- [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md) — l'univers, les deux factions, le modèle de combat, les objectifs.
- [docs/VIBE_PROMPT.md](docs/VIBE_PROMPT.md) — la direction artistique et narrative, plus les prompts prêts à l'emploi pour des agents.
- [docs/ROADMAP.md](docs/ROADMAP.md) — ce qui est fait, ce qui vient (V1, V2), et la porte de sortie vers Godot.
- [docs/TECHNICAL_ARCHITECTURE.md](docs/TECHNICAL_ARCHITECTURE.md) — les règles d'architecture, comment ajouter une unité / une arme / une carte.

## Hors périmètre volontaire (V0)

Pas de campagne, pas de sauvegarde, pas de multijoueur, pas de son, pas d'animations
squelettiques, pas d'IA tactique profonde. Le but était d'avoir **un prototype jouable
et une base saine**, pas un jeu fini. Voir le ROADMAP pour la suite.

## Licence

Projet privé, licence non définie à ce stade.
