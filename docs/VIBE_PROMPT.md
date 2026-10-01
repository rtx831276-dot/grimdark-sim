# VIBE PROMPT — la direction du projet, et comment la transmettre à un agent

Ce document a deux usages :

1. **Fixer le ton** (univers, écriture, direction artistique) pour que tout ajout — carte, unité, texte, effet — aille dans le même sens.
2. **Servir de prompt prêt à coller** pour un agent (humain ou IA) qui travaille sur ce dépôt.

---

## 1. Le pitch à garder en tête

> Une guerre industrielle et religieuse, déjà perdue par tout le monde, se joue dans un
> hameau de boue. On s'y bat pour une église à moitié démolie, un cimetière et un
> croisement de route. Les hommes sont du carburant ; ce qui compte, c'est ce qui reste
> debout quand la poussière retombe.

**Mots-clés d'ambiance** : boue, cendre, fer rouillé, cloches fêlées, machine sainte,
litanie, obus, rats, pluie, fumée, silence après la salve, ordres criés, mains sales.

### À faire

- Décrire des **conséquences matérielles** : un mur tombé change la ligne de tir ; une tranchée comblée tue.
- Nommer les choses **comme des gens de l'époque** : « parapet », « boyau », « Grand-Rue », « Broyeuse », « Long-Vue ».
- Textes courts, secs, sans adjectifs triomphants. Une phrase par idée.
- La violence est **administrative et sale**, jamais glorieuse. On ne montre pas un héros, on montre un régiment qui cède.

### À éviter absolument

- Héroïsme individuel, « unités légendaires », répliques badass.
- Esthétique propre / néon / cyber / fantasy lumineuse.
- Humour méta, références modernes, clins d'œil.
- Anglais dans les identifiants et l'interface : **le jeu est en français** (les identifiants de code restent en anglais, les libellés affichés sont en français).

### Nuancier et rendu

- Palette : ocres sales, brun-vert de boue, gris de pierre, rouille `#b4623a` (Pénitents), acier `#4a7f9c` (Ordre), jaune pâle `#c9a227` pour l'artillerie.
- Fond très sombre (`#0a0b09`) : la nuit tombe sur la guerre.
- Formes lisibles plutôt que jolies : un soldat = un ovale + un casque + une arme orientée.
- L'information passe **avant** l'esthétique : on doit lire vie/moral/suppression d'un coup d'œil.

### Écriture des libellés

| Registre | Exemple |
| --- | --- |
| Unité | « Sapeur de tranchée », « Prédicateur de la Cendre », « Sentinelle mécanisée » |
| Arme | « Mitrailleuse Broyeuse », « Fusil à verrou Mle-9 », « Long-Vue » |
| Terrain | « Boue inondée », « Beffroi », « Cimetière » |
| Journal | « mort », « démoralisé », « structure effondrée », « fuite hors du champ » |
| Jamais | « +10 dégâts ! », « GG », « Super tir ! » |

---

## 2. Les invariants non négociables

Tout agent qui touche à ce dépôt doit respecter ces règles. Elles sont **testées
automatiquement** (`tests/architecture.test.ts`) : les casser fait échouer la suite.

1. **La simulation ne connaît pas le rendu.** `src/sim`, `src/core`, `src/data` : aucun DOM, aucun canvas, aucune dépendance à `src/render|ui|input`.
2. **Le rendu n'a aucun pouvoir sur le jeu.** Il lit l'état, il dessine ; il ne mute jamais une unité.
3. **Déterminisme.** Tout hasard de simulation passe par le `Rng` de l'état, dans un ordre d'appel stable. Interdit : `Math.random()` dans `src/sim`. Le rendu a son propre RNG.
4. **Pas de valeur de gameplay en dur dans la simulation.** Chiffres, noms, couleurs, composition d'armée, carte : dans `src/data`.
5. **Pas de dépendance à un autre projet.** Ce dépôt est autonome : rien de Master Copilot, rien d'externe au dépôt.
6. **Pas d'IA profonde sans nécessité.** L'IA est une cascade courte et lisible, découpée en quatre couches nommées (`src/sim/ai/` : commandement, escouade, soldat, non-morte) — si elle a besoin d'un planificateur, c'est une décision d'architecture, pas un ajout discret.
7. **Aucun modèle de langage dans la boucle de jeu.** Pas de LLM pour décider ce que fait une unité : les décisions tactiques sont déterministes et testables. Un LLM n'intervient qu'au-dessus (doctrine de faction, génération de scénario, briefing), et ne produit jamais un ordre direct à un soldat.

---

## 3. Prompts prêts à coller

Format conseillé pour un agent qui travaille ici : *livrable, contrainte d'architecture,
preuve de validation*.

### Ajouter une unité

```
Ajoute une unité « [NOM] » à grimdark-sim :
- rôle et faction (commune, Pénitents, ou Ordre du Marteau) ;
- données dans src/data/units.ts, ajout au roster de src/data/factions.ts ;
- capacités éventuelles parmi : grenade, artillery, rally, charge ;
- apparence lisible en 3 coups de pinceau (pas d'asset externe).
Contraintes : aucune modification de src/sim nécessaire si l'unité n'apporte pas de
mécanique nouvelle ; la simulation doit rester déterministe.
Validation : npm run check, puis npm run headless -- 777 300 pour vérifier que la bataille
ne part pas en boucherie (viser 5-12 morts par camp, au moins un fuyard).
```

### Ajouter une carte

```
Ajoute une carte « [NOM] » dans src/data/maps/ :
- 3 zones minimales : deux zones de déploiement, un no man's land avec des structures à couvert ;
- 3 à 6 objectifs avec valeur, une ligne de repli par faction ;
- format ASCII avec légende, glyphes harmonisés aux caractères déjà utilisés.
Validation : npm run map:inspect (vérifier que chaque ligne fait bien la largeur déclarée),
puis npm test (tests/data.test.ts vérifie la cohérence).
```

### Ajouter une mécanique de combat

```
Implémente [MÉCANIQUE] dans src/sim :
- respecte la frontière simulation/rendu et le déterminisme (aucun Math.random) ;
- expose les réglages dans src/data, pas dans la logique ;
- ajoute les événements nécessaires au rendu (types dans src/sim/types.ts) ;
- écris au moins un test unitaire (tests/) et vérifie que le test d'architecture passe.
Validation : npm run check && npm run headless -- 12345 300
```

### Refaire l'apparence

```
Améliore le rendu de [ÉLÉMENT] dans src/render :
- aucun asset externe : tout est procédural ;
- l'information de gameplay doit rester lisible (état, moral, suppression, couverture) ;
- ne touche pas à src/sim : si tu as besoin d'une donnée absente, ajoute-la à l'état
  dans src/sim/types.ts et remplis-la dans la simulation — jamais en la devinant côté rendu.
Validation : npm run check, puis capture visuelle dans le navigateur.
```

---

## 4. Ce qui doit rester vrai après chaque session

- `npm run check` passe (typecheck + 63 tests + build).
- `npm run headless -- 777 300` produit un rapport **cohérent avec la doctrine** : les officiers meurent et les lignes cassent, l'artillerie détruit du terrain, il y a des fuyards.
- On peut toujours lancer une bataille **sans navigateur** : c'est la garantie que le jeu n'a pas été kidnappé par son rendu.
- Le jeu parle français, et il parle comme un vétéran qui n'a plus rien à prouver.
