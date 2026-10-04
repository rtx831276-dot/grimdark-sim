# GAME DESIGN — grimdark-sim

> Version V0. Ce document décrit l'intention de jeu et le modèle tel qu'il est
> **réellement implémenté** dans `src/sim` et `src/data`. Chaque valeur citée existe dans
> le code : si le document et le code divergent, c'est le code qui a raison, et le
> document qu'il faut corriger.

---

## 1. Le jeu en une phrase

Deux camps d'une douzaine d'hommes s'affrontent pour un hameau en ruine ; **on ne gagne
pas en tuant tout le monde, on gagne en brisant la volonté de l'autre de rester sur le
terrain** — la mitrailleuse ne tue pas beaucoup, elle cloue ; l'artillerie ne gagne pas,
elle rend le terrain intenable.

### Piliers

1. **Le sol décide.** Couverture, boue, cratères, tranchées. Se déplacer coûte du temps, être à découvert coûte des hommes.
2. **Le moral est la vraie barre de vie.** Une unité démoralisée fuit et sort du champ : elle est perdue pour la bataille sans être morte. Un camp qui perd ses sergents et ses prédicateurs s'effondre.
3. **Le feu lourd dégrade le terrain.** Barrages et grenades rasent les murs, comblent les tranchées et suppriment les couverts : on se bat pour un décor qui disparaît.
4. **Personne n'est un héros.** Un fusilier isolé meurt. Les pertes sont rapides, anonymes, et la ligne tient par le nombre et la discipline.

### Inspirations assumées

Première Guerre mondiale (tranchées, artillerie, no man's land), grimdark industriel-religieux
(guerre sainte, machines, superstition), tactiques lentes et sales. **À éviter** : le
héroïsme aérien, le sci-fi propre, la fantasy lumineuse, les unités « signature » qui
gagnent seules.

---

## 2. Les deux factions

| | **Pénitents de la Cendre** | **Ordre du Marteau Noir** |
| --- | --- | --- |
| Idée | Fanatiques endurants, morale inépuisable, vague humaine | Industrie mécanisée, feu écrasant, peu d'hommes |
| Couleur | Rouille / ochre (`#b4623a`) | Acier froid (`#4a7f9c`) |
| Forces | Moral (prédicateur), flagellants increvables, sergents | 2 mitrailleuses, marcheur mécanisé quasi insensible à la panique |
| Faiblesses | Armes légères, discipline moyenne, lenteur à manœuvrer | Effectifs fragiles, dépendance au feu de suppression |
| Doctrine | Avancer en s'abritant, charger quand ça craque | Clouer au sol, puis avancer sous couvert de la mitraille |

Les deux camps alignent **13 unités** (roster déclaré dans `src/data/factions.ts`).

### Rôles

| Rôle | Unités | Ce qu'elles apportent |
| --- | --- | --- |
| Ligne | Fusilier, Milice levée | Le volume de feu, la tenue du terrain. La milice se brise vite. |
| Précision | Tireur à verrou | Punition à 15 tuiles, très sensible à la suppression. |
| Suppression | Mitrailleur | Ne tue pas beaucoup, cloue et démoralise. |
| Assaut | Grenadier, Sapeur de tranchée | Ouvrent les trous (grenades, fusil de tranchée) pour les autres. |
| Reconnaissance | Éclaireur | Voit tout (22 tuiles), encaisse rien. |
| Commandement | Sergent, Prédicateur | Ralliement (+25 à +55 de moral autour d'eux) : tuer l'officier fait tomber un flanc. |
| Appui feu | Observateur d'artillerie | 2 barrages par bataille, à désigner sur un groupe ennemi. |
| Choc | Flagellant, Frère de l'Engin | Corps à corps, capacité de charge (8 s de furie, immunité à la suppression). |
| Appui lourd | Sentinelle mécanisée | Marcheur : suppression plafonnée à 40 — elle n'est jamais clouée au sol. |

---

## 3. Le modèle de combat

### Boucle d'engagement

```
1. REPÉRAGE   l'ennemi le plus « intéressant » dans le rayon de vision
2. ARBITRAGE  à couvert ? sinon, chercher un abri (priorité haute dès qu'on est visé)
3. TIR        salve si la cible est à portée, visible, et la chance de toucher >= 8 %
4. RECHARGE   après N salves, l'arme se tait 1,8 à 4,2 s (accalmie exploitable)
5. CONTRECOUP suppression + moral + pertes ; si ça casse, l'unité fuit
```

### Chance de toucher

```
précision = arme.accuracy
          × chute de portée (linéaire au-delà de la portée optimale, plancher 15 %)
          × compétence de l'unité (0,5 recrue → 0,95 tireur d'élite)
          × 1,12 si « tireur d'élite »
          × 0,72 si l'unité se déplace (annulé par les troupes de choc)
          × (1 − 0,55 × suppression/100)
          × 0,78 si moral <= 45
          × (1 − 0,78 × couverture de la cible)
          × 0,88 si la cible se déplace
```

Plafonnée entre **2 % et 95 %**. La couverture est la variable la plus chère : bien
placée, elle divise la létalité par 3 à 4.

### Couverture

`couverture = terrain de la tuile (0..0,78) + 0,55 × obstruction de la ligne de vue`,
plafonnée à **0,85**.

| Terrain | Couverture | Note |
| --- | --- | --- |
| Tranchée | 0,78 | le meilleur abri du jeu, mais lent (coût 1,55) |
| Sacs de sable | 0,80 | destructibles (90 PV) |
| Ruines | 0,46 | destructibles |
| Cratère | 0,38 | l'artillerie finit par en créer partout |
| Pierre tombale | 0,32 | le cimetière est un bon poste de tir couvert |
| Boue / route | 0,05 / 0,02 | se faire tirer dessus ici, c'est mourir |
| Eau / boue inondée | 0 | et très lent (coût 3,1) |

Les murs (ruines 160 PV, église 460 PV, beffroi 1400 PV) **bloquent la vue** : ils ne
protègent pas celui qui est derrière, ils rendent l'angle de tir impossible. Détruits, ils
deviennent des gravats praticables et couvrants.

### Suppression

- Chaque projectile qui rate **près** de la cible ajoute `arme.suppression × 0,55` ; chaque touche `× 0,8`.
- Les unités collées à la cible encaissent 35 % de cette suppression (zone battue) : les mitrailleuses punissent les groupes.
- Décrue : `(3 + discipline × 4,5) × (1 + couverture × 0,5)` par seconde.
- **Seuil : 55** ⇒ `pinned`. Une unité clouée annule son assaut (elle perd son ordre), se déplace à 45 % de sa vitesse et tire moins bien (—55 % de précision).
- Traits particuliers : `mechanical` plafonne la suppression à 40 (jamais clouée), `fearless` garantit un moral minimum de 55.

### Moral

Réserve de **0 à 100**, base 45 (milice) à 100 (flagellant).

| Cause de perte | Effet |
| --- | --- |
| Dégâts subis | −45 % des dégâts (×0,7 pour une explosion) |
| Camarade tué dans 8 tuiles | −(17 × proximité + 5) |
| Officier tué | −(28 × proximité + 5) |
| Sous le feu | −(1,5 + suppression/100 × 4) par seconde |
| Hors du feu | +0,9 + discipline × 2,2 par seconde, +3 avec un officier à 8 tuiles |

- **`broken` à 30 ou moins** (ou suppression ≥ 92 avec moral < 40) : l'unité perd tout ordre, se replie vers sa ligne arrière et **quitte le champ** une fois arrivée (comptée `fled`, distincte des morts).
- Reprise : au-dessus de **50** grâce à un ralliement, ou progressivement hors du feu.
- Les officiers (`rally`, 3 charges) rendent **+25 à +55** de moral et −30 à −70 de suppression dans un rayon de 8 tuiles : c'est la seule façon rapide de sauver une ligne qui craque.

### Armes

| Arme | Portée | Précision | Dégâts | Salve | Recharge |
| --- | --- | --- | --- | --- | --- |
| Fusil semi-auto Vrille | 12 | 0,34 | 8 | 2 | 6 salves / 2,2 s |
| Fusil à verrou Mle-9 | 15 | 0,50 | 22 | 1 | 5 salves / 2,6 s |
| PM Cendre | 6 | 0,32 | 5 | 5 | 5 salves / 1,8 s |
| Fusil de tranchée | 4 | 0,60 | 26 | 1 | 4 salves / 2,4 s |
| Mitrailleuse Broyeuse | 16 | 0,22 | 6 | 7 | 8 salves / 4,2 s |
| Long-Vue | 24 | 0,52 | 38 | 1 | 3 salves / 3,0 s |
| Pioche de guerre (mêlée) | 1,4 | 0,78 | 21 | 2 | — |
| Grenade Fumigène-Frag | 11 (arc) | — | 38 (rayon 2,6) | 1 | 4 charges |
| Barrage du Grand Moteur | hors-carte | — | 42 (rayon 3,0) | 5 obus | 2 charges / 20 s |

> Les valeurs ont été **mesurées** avec `npm run headless`, pas devinées. Voir la note
> d'équilibrage au §6.

### Armes à arc et artillerie

- Grenade : vol 1,3 s, dispersion ±0,7 tuile, passe **par-dessus les murs** — c'est le seul moyen de déloger une unité terrée hors de vue.
- Barrage : 5 obus, 6 s de vol, dispersion croissante (±1,8 → ±4,6 tuiles), dégâts de structure 230 : **230 points suffisent à faire tomber un mur d'église (460 PV) en deux impacts, et un mur de ruine en un seul**.
- Le terrain nu est retourné en cratère dans 45 % du rayon : un champ de bataille bombardé devient un champ de cratères.

### Terrain destructible

Chaque structure a des PV et sait en quoi elle se transforme quand elle tombe :

```
mur de ruine (160) → gravats (140) → cratère
mur d'église (460) → gravats
beffroi (1400)     → gravats
sacs de sable (90) → boue
clôture (40)       → boue
pierre tombale(60) → gravats
```

Le rendu affiche des fissures proportionnelles aux dégâts : le joueur voit un mur
« presque tombé ».

---

## 4. La carte — « Le Hameau de la Cloche »

44 × 34 tuiles. Lisible en ASCII dans `src/data/maps/village-church.ts`.

- **Ouest (colonnes 0-8)** : arrière des Pénitents — routes, gravats, arbres morts.
- **Ligne de tranchées Pénitents (9-11)** : tranchée + parapet de sacs de sable.
- **No man's land (12-32)** : labouré d'obus, hameau ruiné, cimetière clos, **l'église au centre-nord** (nef de dalle claire, murs épais, beffroi quasi indestructible au nord-ouest).
- **Ligne de tranchées de l'Ordre (33-35)** : symétrique.
- **Est (36-43)** : arrière de l'Ordre.
- **Grand-Rue (lignes 17-18)** : route rapide qui traverse tout — donc axe d'assaut évident, et cimetière à balles.

### Objectifs

| Objectif | Position | Valeur |
| --- | --- | --- |
| Nef de l'église | (23, 8) | 4 |
| Croisement de la Grand-Rue | (23, 17,5) | 3 |
| Beffroi | (20,5 ; 5,5) | 2 |
| Cimetière, Ferme ouest, Ferme est, Réservoir nord | dispersés | 1 chacun |

Un objectif est **détenu** si une seule faction y a des unités en état de combattre ;
à égalité il est **contesté**. Le score est la somme des valeurs détenues.

### Conditions de fin

- Un camp n'a plus **aucune unité effective** (vivante et non démoralisée) ⇒ l'autre gagne.
- Les deux camps sont à zéro ⇒ match nul.
- Pas de limite de temps : une bataille peut s'enliser (mesuré : jusqu'à 10 minutes sans décision). Une limite de temps et la victoire aux objectifs sont au programme de la V1.

---

## 5. Boucle de jeu et lisibilité

Ce que le joueur doit pouvoir lire **sans cliquer** :

- Couleur de faction et rôle au premier regard.
- Barre de vie, barre de moral, barre de suppression au-dessus de chaque unité.
- Trois états visuels : *clouée* (cercle pointillé jaune), *démoralisée* (point d'exclamation rouge), *en charge* (éclair).
- Le journal de bataille nomme les morts, les objectifs pris, les structures effondrées, les barrages demandés.

Ce que le joueur doit pouvoir faire en moins de deux secondes : sélectionner un groupe,
l'envoyer sur un couvert, le faire tirer, le rallier, demander un barrage.

---

## 6. Note d'équilibrage (leçons du banc d'essai)

État initial mesuré : **17 morts en 23 secondes**, zéro fuyard, zéro barrage (les
observateurs mouraient avant d'avoir pu demander une frappe). Trois corrections,
mesurées à nouveau avec `npm run headless` sur 4 graines :

1. **Rechargements** (`reloadEvery` / `reloadTime`) : le feu devient discontinu, les assauts ont des fenêtres.
2. **Discipline de tir** (on ne tire pas sous 8 % de chance de toucher) : fin du gaspillage à bout de portée.
3. **IA qui se met à couvert** dès qu'elle est visée à découvert, et **morale beaucoup plus collant** (suppression qui se dissipe 3× moins vite, récupération du moral 3× plus lente).

Résultat : batailles de **45 s à 10 min**, **5 à 12 morts par camp**, **0 à 3 fuyards**,
10 à 15 obus tirés, 20 à 48 structures détruites. Les deux camps gagnent selon les graines.

**Réglages à disposition** (aucun code à écrire) :

| Levier | Fichier | Effet |
| --- | --- | --- |
| Précision, dégâts, cadence, rechargement | `src/data/weapons.ts` | létalité globale |
| PV, armure, vitesse, discipline, portée de vue | `src/data/units.ts` | robustesse et rôle |
| Couverture, PV, transformation | `src/data/terrain.ts` | valeur du terrain |
| Seuils de rupture et de panique | `src/sim/morale.ts` (constantes en tête de fichier) | nervosité des troupes |
| Composition des armées, barrages | `src/data/factions.ts` | équilibre des camps |
| Dispersion et dégâts d'artillerie | `src/data/weapons.ts` | puissance de feu hors-carte |
