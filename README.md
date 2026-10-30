# Opération Carrefour — bataille tactique moderne sans fin

Deux forces fictives se battent sur la carte délimitée d’Opération Carrefour.
**La bataille est sans fin**, pas la carte : aucune victoire automatique, et les
combattants morts ou ayant fui sont remplacés après 10 secondes de simulation.
Les renforts sont illimités. Les cadavres restent visibles 15 secondes avant d'être
retirés pour limiter l'utilisation de mémoire ; les nouveaux soldats ont un
identifiant et un équipement neufs.

Les camps disposent de combattants à mains nues, de porteurs de lame, de pistolets,
de fusils et de grenadiers, plus un chef et un médecin. Les quatre modèles d'armes
Meshy sont intégrés. La lame utilise des frappes synchronisées et une zone de contact
tactique ; les tirs utilisent précision, portée, ligne de vue et rechargement (les
munitions ne sont pas limitées). Une grenade peut toucher les alliés. Voir
`src/assets/weapons/README.md` pour les modèles et leurs limites.

Sélectionnez des soldats au clic gauche (ou avec un cadre), donnez un ordre au clic
droit et appuyez sur **Espace** pour démarrer. Pour lancer une grenade, sélectionnez
un grenadier, appuyez sur **G** ou cliquez sur **Grenade**, puis visez au clic gauche.
Le bouton **Nouvelle bataille** redémarre la partie. La pause fige la simulation et
les délais de réapparition.

La vue 3D dispose d'une caméra pivotante (**X / V** ou ⟲ / ⟳) et de ragdolls ;
la vue 2D sert aussi de secours. Pas de véhicules, multijoueur ou contrôle direct.
Les modèles et leur placement ont été contrôlés dans Chromium sans interface ; ils n'ont pas été vérifiés dans Brave.

### Communications tactiques

Les soldats communiquent par bulles de texte et dans le journal : ils signalent un ennemi visible ou demandent du renfort lorsqu'ils sont blessés. Les alliés proches présents au moment de l'appel peuvent utiliser l'information pendant quelques secondes. Les ordres du joueur, tenir et repli restent prioritaires. Il n'y a pas encore de voix ni de dialogue libre.

### Rôles dans la mission

Chaque camp commence avec 13 combattants : un chef, trois combattants à mains
nues, deux à la lame, trois fusiliers, deux porteurs de pistolet, un grenadier et
un médecin. Le médecin soigne les vivants mais ne ressuscite pas les morts.

### Jouer sans serveur

```bash
npm install
npm run build:offline
```

Ouvrir ensuite `dist/operation-carrefour.html` dans un navigateur sur ordinateur. La souris et le clavier sont nécessaires. Le fichier est autonome et n’a pas besoin d’une connexion Internet.

---

## Documentation du prototype d’origine

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
La bataille commence en pause : sélectionnez des soldats et appuyez sur Espace pour lancer le combat. Les déplacements de groupe répartissent les soldats autour du point choisi.

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
│   │   └── ai/             #   IA en 4 couches : commandement, escouade, soldat, non-morte
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
- [docs/DEPENDENCY_SCAN.md](docs/DEPENDENCY_SCAN.md) — verdict ADOPT / STUDY / REJECT sur les bibliothèques candidates (**V0 : zéro dépendance runtime**).

## Hors périmètre volontaire (V0)

Pas de campagne, pas de sauvegarde, pas de multijoueur, pas de son, pas d'animations
squelettiques, pas d'IA tactique profonde. Le but était d'avoir **un prototype jouable
et une base saine**, pas un jeu fini. Voir le ROADMAP pour la suite.

## Licence

Projet privé, licence non définie à ce stade.

### Mode FPS (prototype)

Sélectionner un soldat puis cliquer **Mode FPS** ; sans sélection, un fusilier Aegis est choisi. Le champ de bataille et le soldat sont les mêmes qu'en mode tactique. Autoriser la capture de la souris : **ZQSD/WASD** pour bouger, souris pour viser, clic gauche pour tirer ou frapper, clic droit maintenu pour le zoom avec une arme à feu, **R** pour recharger, **Espace** pour pause. **Échap** libère la souris et met la partie en pause ; cliquer sur le terrain recapture la souris, ou cliquer **Quitter FPS** pour revenir à la vue tactique. Si le soldat meurt ou fuit, retour automatique en vue tactique et pause ; sélectionner un autre soldat pour reprendre. Le chargeur est affiché en cartouches, avec une réserve illimitée ; le fusil tire toujours trois cartouches par salve. La recharge reste automatique en plus de R.

Le FPS utilise la grille et les règles tactiques existantes : obstacles et portée bloquent le tir ; un allié dans le viseur bloque la cible sans subir de tir allié. La précision, la couverture et les dégâts restent ceux de la simulation, donc un ennemi dans le viseur ne garantit pas un impact. Il s'agit d'un prototype : les projectiles ne sont pas balistiques et la vue de l'arme n'a pas encore de bras dédiés.

L'interface FPS affiche la vie, les cartouches restantes et la progression de recharge. Une croix apparaît seulement quand une attaque du joueur touche réellement (rouge pour une élimination) ; une vignette rouge indique une perte de vie, y compris par explosion. Ces effets sont visuels et ne changent pas les dégâts.

### Collisions et chutes

Les soldats occupent un disque de collision : en vue tactique comme en FPS, ils glissent le long des obstacles sans traverser leurs coins, et les bousculades ne les poussent plus dans les murs. Les chemins et esquives tiennent compte de ce rayon. Les explosions projettent visuellement les corps depuis leur point d'impact, avec une impulsion verticale limitée ; coudes et genoux ont des limites articulaires plus serrées. Le ragdoll reste purement visuel et ne bloque pas les vivants ; il est figé après cinq secondes pour limiter le coût.

### Trajectoire des grenades

Les grenades suivent un arc calculé par la simulation, avec gravité et rebonds amortis sur le sol et les obstacles. Elles peuvent franchir un obstacle assez bas ; un mur trop haut peut les renvoyer vers le lanceur. Elles explosent à leur position réelle à la fin de la mèche, même après un rebond : attention aux alliés. Le rendu 2D et 3D suit la même trajectoire. Les obus d'artillerie conservent leur fonctionnement antérieur.

Le zoom FPS est optique : il ne change pas la probabilité de toucher, qui reste régie par la simulation tactique. Le recul, le mouvement de l'arme et le geste de recharge sont visuels ; ils ne déplacent pas le viseur. R peut démarrer une recharge dès la fin d'une salve, sans attendre le délai entre deux tirs.

### Créature indépendante

La bataille sans fin accueille une créature hostile aux deux camps : elle poursuit le soldat visible le plus proche et frappe au contact. Elle peut être blessée et tuée comme les autres unités, puis réapparaît après 10 secondes de simulation. Elle ne capture pas les objectifs et ne reçoit pas d’ordres. Le modèle fourni ne contient aucun clip d’animation : les oscillations et les attaques sont représentées par un mouvement simple de tout le modèle, sans animation des pattes ni ragdoll dédié. Les collisions restent approximatives.
