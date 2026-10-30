# Armes fournies par l'utilisateur

Les quatre GLB viennent des fichiers ajoutés sur GitHub, optimisés pour la vue 3D :

| Asset intégré | Fichier source | Utilisation |
| --- | --- | --- |
| `pistol.glb` | `Meshy_AI_ARME_1030013849_texture.glb` | pistolet tenu à la main |
| `rifle.glb` | `Meshy_AI_ARME_1030013905_texture.glb` | fusil tenu à la main |
| `blade.glb` | `Meshy_AI_sword_1029124438_texture.glb` | lame tenue à la main |
| `grenade.glb` | `Meshy_AI_Pin_of_Ruin_1030013948_texture.glb` | grenade pendant le vol |

Les meshes ont été simplifiés à environ
26 661, 10 012, 9 000 et 9 000 triangles ; seules les textures couleur réduites à
512 pixels sont conservées ; le facteur métallique est réduit pour éviter que les armes apparaissent noires sans éclairage d’environnement. La géométrie et les textures sont partagées entre les
instances. Les armes tenues suivent l'os de la main droite. Leur placement est une approximation : les poses à l'arrêt, en course et à la lame ont été contrôlées dans Chromium sans interface ; elles n'ont pas été vérifiées dans Brave. Le système de tir utilise
le comportement existant (précision, ligne de vue et rechargement) ; le nombre de
munitions n'est pas encore limité. La lame utilise une hitbox tactique 2D ; ses
contacts ne sont pas des collisions 3D du mesh. Les grenades peuvent blesser les alliés.
