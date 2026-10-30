# IA, moveset et hitboxes de mêlée

Dans la mission sans fin, les combattants à mains nues conservent ce moveset ;
les porteurs de lame utilisent trois clips distincts et une portée de 1,7 tuile.

L'IA choisit ses cibles selon la distance, les menaces et les alliés engagés,
recherche une position de contact, contourne les obstacles et respecte les ordres.
Elle fonctionne indépendamment du rendu, y compris en mode headless.

## Moveset à mains nues

Trente techniques utilisent les clips Meshy : directs, crochets, uppercuts,
coups de pied, enchaînements et balayages. Elles ont des portées, angles,
durées, repères d'impact et multiplicateurs de dégâts propres dans `melee-timing.ts`.
L'IA alterne les techniques et privilégie régulièrement le balayage face à plusieurs
ennemis ; elles ne sont pas choisies directement au clavier. Certains balayages peuvent
toucher jusqu'à deux ennemis, les autres techniques au maximum un. Les longs clips
`Dodge_and_Counter` et `Boxing_Practice` sont utilisés comme des combinaisons à une
seule fenêtre de contact, et non comme des enchaînements multi-impacts.

## Esquives

Neuf clips `Stand_Dodge*` et `Roll_Dodge*` accompagnent une esquive latérale
simulée, déterministe, limitée à quatre pas et bloquée par les obstacles. L'IA
peut annuler un coup encore en préparation pour esquiver, mais pas pendant la
récupération après impact ; un ordre de déplacement ou la posture tenir est
respecté. Un ordre direct interrompt une esquive. La récupération est de 30 ticks.
L'esquive n'accorde **aucune invulnérabilité** : seule la position réelle peut
permettre de sortir de la hitbox, et une esquive peut donc échouer.

## Zones de contact et synchronisation

- L'événement `melee` annonce le début du combo. L'unité conserve `meleeAttack`
  (cible initiale, orientation verrouillée, clip, ticks de départ, d'impact et de fin).
  L'attaquant ne suit pas automatiquement les déplacements de sa cible pendant le geste.
- Au tick d'impact, après les déplacements, la simulation teste un secteur orienté
  contre le disque vulnérable de chaque ennemi vivant. La portée et l'angle du secteur
  dépendent de la technique ; un obstacle bloque le contact. Les ennemis les plus
  proches interceptent le coup, même si ce n'est pas la cible initiale ; les alliés ne
  sont jamais blessés. Une intersection valide inflige des dégâts, sans jet de précision.
- `meleeImpact` et `hit` ne sont émis que lors d'un contact valide. Chaque clip contient
  **une seule fenêtre de contact**, même s'il comporte plusieurs gestes ; la garde est
  cosmétique, sans parade ni réduction des dégâts. Les secteurs et disques sont des
  approximations tactiques 2D, pas des collisions 3D des membres ou des meshes.
- Les repères proviennent d'extensions des mains ou du pied mesurées sur les courbes
  du GLB, arrondies au tick de 100 ms. Ils n'ont pas été validés visuellement. Le rendu
  lit le temps depuis les ticks et l'interpolation, y compris après une pause ou un
  retour en vue 3D. Les cadavres en 3D utilisent un ragdoll visuel indépendant ;
  il n'y a pas de combat à deux chorégraphié.
- La séquence se termine avant la prochaine attaque. Un décès, une démoralisation ou
  un ordre direct interrompant la séquence annule l'impact restant. Le joueur peut
  activer **Hitboxes** ou K : disques bleus = zones vulnérables, secteur orange =
  préparation, rouge = tick d'impact, gris = récupération. Les zones restent visibles
  en 2D comme en 3D, sans changer la simulation.
- Les autres armes de mêlée de l'ancien scénario conservent leur résolution immédiate.

Les tests `melee-hitbox.test.ts`, `melee-sync.test.ts`, `combat-clips.test.ts`,
`melee-dodge.test.ts` et `melee-ai.test.ts` couvrent géométrie, esquive, interceptions, dégâts alliés,
synchronisation, interruptions et combats de groupe. Ils ne remplacent pas une
vérification visuelle des contacts.

## Ragdoll des soldats éliminés

En vue 3D, jusqu’à 0,75 seconde d’un clip de chute Meshy précède le
transfert de la pose vers onze corps rigides et dix articulations. La gravité et la direction du coup animent la chute ; les corps
rencontrent le sol et le décor. Cette physique est uniquement visuelle : elle ne
modifie ni les positions tactiques ni les dégâts, et les cadavres ne collisionnent
pas entre eux ni avec les soldats vivants. Après cinq secondes de simulation
visuelle, leur pose est figée et les corps physiques sont libérés pour réduire
le coût. La pause fige la chute. En 2D, ou en cas de modèle incompatible, le
rendu existant sert de secours. Pas de validation visuelle navigateur à ce stade.

## Clips contextuels

Le GLB contient 88 clips, dont 68 importés des cinq nouveaux fichiers. Les
réactions à un coup utilisent `Hit_Reaction_to_Waist` quand aucun coup ni esquive
ne joue, sinon elles restent procédurales. Le ralliement peut utiliser
`Chest_Pound_Taunt`. Six pivots accompagnent les changements d’orientation et
les deux gestes de ramassage peuvent illustrer un soin (sans ramasser d’objet).
Ils sont cosmétiques et ne modifient pas la simulation. Trois clips de lame et le
rechargement debout sont utilisés avec les équipements correspondants ; les autres
clips d'armes sans contexte, ainsi que les chutes par électrocution ou étranglement,
restent conservés mais inactifs.

## Renforts

La mission principale utilise une carte délimitée avec des renforts **illimités** :
un remplacement de même rôle apparaît dix secondes après un décès ou une fuite.
Il a un nouvel identifiant ; les cadavres sont retirés après 15 secondes de simulation
pour éviter une accumulation infinie. Il n'y a pas de victoire automatique. Les tests
couvrent aussi le scénario d'origine, où les renforts restent limités.
