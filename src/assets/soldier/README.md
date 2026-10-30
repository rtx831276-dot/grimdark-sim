# Soldat Meshy

Les modèles et textures proviennent des fichiers fournis par l'utilisateur dans le dépôt GitHub.

- `soldier.glb` et `diffuse.jpg` sont la première version optimisée du FBX, conservée pour référence et ses tests de déplacement.
- `soldier-combat.glb` provient du modèle `Meshy_AI_Last_Stand_in_Neon_Ru_All_Animations.glb` et des cinq nouveaux GLB : il possède **88 clips uniques** (20 d'origine et 68 ajoutés), avec les mêmes 28 os. La géométrie originale a été simplifiée de 68 394 à 8 206 triangles. `combat-diffuse.jpg` est la texture diffuse réduite à 1024 px, intégrée au build hors ligne.
- `scripts/import-meshy-animations.mjs` ajoute les clips sans recopier les meshes ni textures. Il exige des noms d'os compatibles ; la compatibilité des poses de repos et de la hiérarchie doit aussi être vérifiée avant import.
- La translation horizontale du bassin des clips ajoutés et des clips de combat d'origine est neutralisée : la simulation contrôle la position, en conservant le mouvement vertical. Les clips de marche et de course originaux ne sont pas modifiés.

En jeu, Walking et Running accompagnent les déplacements ; Limping_Walk_1 ou Limping_Walk_2 est utilisé pour un soldat très blessé. **30 techniques de mêlée** et **9 esquives latérales** sont sélectionnées par l'IA et synchronisées sur les ticks de simulation. Les esquives ne rendent pas invulnérable. Six clips de pivot accompagnent les changements de direction au repos, à la marche et à la course ; les deux gestes de ramassage peuvent illustrer les soins, sans objet ramassé. `Hit_Reaction_to_Waist` peut jouer lors de dégâts et `Chest_Pound_Taunt` lors d'un ralliement ; les réactions non couvertes restent procédurales.

Une seule fenêtre de contact est programmée au repère d'impact de chaque combo : un secteur au sol est testé contre le disque de l'adversaire. Certains balayages peuvent toucher deux ennemis. Ces repères sont estimés depuis les courbes d'animation, avec une précision de 100 ms, sans collision 3D main/corps ni validation visuelle dans un navigateur.

En 3D, une chute Meshy de 0,75 seconde au maximum précède le transfert de pose au ragdoll physique, avec gravité et collision sol/décor ; la pose est figée après cinq secondes de physique. Les cadavres ne collisionnent ni entre eux ni avec les vivants, et ne modifient ni les PV ni la simulation. La pause fige la chute. Si le modèle ne possède pas le rig attendu, la chute procédurale sert de secours.

Trois clips de lame et le rechargement debout sont désormais utilisés lorsque le soldat dispose de l’équipement correspondant ; les variantes de pivot et les autres clips d’armes sans contexte adapté restent inactifs ; de même, électrocution et étranglement n'ont pas de mécanisme dans la mission. Les clips disponibles ne sont donc pas tous déclenchés automatiquement. Les poses à l'arrêt, en course et au combat ont fait l'objet d'un contrôle dans Chromium sans interface ; le rendu n'a pas été vérifié dans Brave.
