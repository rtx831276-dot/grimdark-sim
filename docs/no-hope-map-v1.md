# No Hope — Map 01: Broken Parish

## Intention

`Broken Parish` est la premiere carte jouable de No Hope.

Ce n'est pas une illustration. C'est une carte tactique 256x256 faite pour un simulateur 2.5D leger :

- combat humain d'abord ;
- escouades, suppression, moral, couverture et defilade ;
- zombies prepares, mais pas obligatoires au lancement ;
- lisibilite type Project Zomboid ;
- logique de combat type Men of War / Call to Arms.

Phrase de design :

> The front does not end when the enemy dies.

## Structure Globale

La carte est divisee en 5 grandes zones :

| Zone | Role gameplay |
| --- | --- |
| Nord | Cimetiere, foret morte, arrivees zombies futures |
| Centre | Village detruit, eglise, objectif principal |
| Ouest | Carrefour urbain, rues courtes, combats de ruines |
| Est | Depot ferroviaire brule, longues lignes de tir |
| Sud | Canal, pont casse, couloir de contournement |

La carte doit forcer trois types de combat :

- progression lente sous feu de suppression ;
- combat proche dans les ruines et tranchees ;
- decisions de repli quand les morts commencent a se relever.

## Grille

- Taille logique : `256 x 256`.
- Origine : coin nord-ouest.
- Chaque cellule logique peut devenir un tile, un chunk ou un point de navigation selon le moteur.
- Les coordonnees ci-dessous sont donnees en rectangles `x, y, w, h`.

## Objectifs

| ID | Nom | Position | Role |
| --- | --- | --- | --- |
| `obj_broken_parish` | Broken Parish | `128, 112` | objectif central, le plus dangereux |
| `obj_grandrue` | Grand-Rue Crossing | `54, 132` | controle des routes ouest |
| `obj_burned_depot` | Burned Depot | `202, 122` | controle du flanc est et rails |
| `obj_south_bridge` | South Bridge | `128, 210` | contournement sud |
| `obj_cemetery_ridge` | Cemetery Ridge | `136, 44` | zone haute, pression zombie future |

## Spawns

| Camp | Zone | Intention |
| --- | --- | --- |
| Bleu | Sud-ouest | attaque depuis ruines basses et canal |
| Rouge | Nord-est | defense depuis depot, tranchees et cimetiere |
| Zombies futurs | Cimetiere + no man's land | cadavres, morsures, reanimation |

## Lignes De Front

La carte contient deux lignes de tranchees en zigzag :

- Ligne bleue : sud-ouest vers centre-sud.
- Ligne rouge : nord-est vers centre-nord.

Entre les deux : no man's land, craters, boue, barbelés, carcasses. Traverser sans fumee, suppression ou contournement doit etre suicidaire.

## Couches Gameplay

### Terrain

| Terrain | Effet |
| --- | --- |
| `mud` | terrain normal, lent legerement |
| `road` | deplacement rapide, peu de couverture |
| `trench` | couverture forte, bonus contre tir direct |
| `rubble` | couverture moyenne, ralentit |
| `building_ruin` | bloque partiellement ligne de vue, combat proche |
| `wall` | bloque mouvement et ligne de vue |
| `water` | bloque mouvement sauf pont |
| `bridge` | chokepoint, tres dangereux |
| `crater` | couverture legere, ralentit |
| `barbed_wire` | ralentit fort, expose |

### Couverture

| Cover | Exemples |
| --- | --- |
| `light` | cratere, haie morte, debris |
| `medium` | rubble, barricade, vehicule detruit |
| `heavy` | tranchee, mur epais, angle de batiment |
| `defilade` | tranchee basse, talus, sous le niveau du feu |

### Ligne De Vue

Les blockers importants :

- clocher casse de l'eglise ;
- blocs d'immeubles effondres ;
- murs de cimetiere ;
- wagons et hangars du depot ;
- talus de tranchees.

## Pathfinding

La carte doit exposer ces routes :

| Route | Type | Risque |
| --- | --- | --- |
| `route_west_street` | rue principale ouest-centre | tirs croises |
| `route_north_trench` | tranchee rouge vers cimetiere | zombies futurs |
| `route_south_canal` | canal vers pont | chokepoint |
| `route_depot_rail` | rails est | longue ligne de tir |
| `route_church_ruins` | ruines autour eglise | combat proche |

## Zones Zombies Futures

Les zombies ne doivent pas etre un mode arcade au debut.

Ils emergent depuis :

- cadavres humains infectes ;
- morts mordus ;
- cimetiere ;
- no man's land apres bombardement ;
- hopital/chapelle si ajoute plus tard.

Premiere regle V1/V2 :

```text
humain mort + infected = corpse
corpse + reanimation_timer = undead
undead cible bruit > vivant proche > cadavre frais > objectif
```

## Prompt Court Pour Agent

```text
Implemente Map 01 Broken Parish pour No Hope comme donnees gameplay, pas comme image.
Creer une carte logique 256x256 avec objectifs, spawns, zones de terrain,
cover zones, line-of-sight blockers, no man's land, tranchees, routes,
chokepoints et zones futures zombies.
La simulation doit pouvoir charger cette map depuis un fichier JSON.
Ne pas changer le rendu sauf si necessaire pour afficher ces couches.
Ajouter tests: dimensions, objectifs, spawns, blockers, zones zombies,
et aucun objectif hors carte.
```


