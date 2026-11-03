# NO HOPE — Meshy 3D assets

Two source GLB files have been supplied by the project owner for incorporation:

| Destination | Original filename | Approx. size | Status |
|---|---|---:|---|
| `assets/characters/Meshy_AI_Last_Stand_in_Neon_Ru_All_Animations.glb` | `Meshy_AI_Last_Stand_in_Neon_Ru_All_Animations.glb` | 10.4 MB | Pending binary upload |
| `assets/environment/Meshy_AI_map_scene_preview_1009123249_image-to-3d-texture.glb` | `Meshy_AI_map_scene_preview_1009123249_image-to-3d-texture.glb` | 96.6 MB | Pending binary upload |

## Import procedure

Download the prepared archive from the ChatGPT conversation: `no-hope-meshy-assets.zip`.
Extract its `assets/` directory into the repository root. Review GLB geometry, scale, textures, animations and Meshy license before wiring into a game scene.

The 96.6 MB GLB is near GitHub's 100 MiB hard limit; prefer Git LFS for 3D binary assets. Do not commit generated derivatives or replace existing source assets without review.

### Git LFS (if enabled on your machine)

```sh
git lfs install
git lfs track "*.glb"
git add .gitattributes assets/
git commit -m "assets: import Meshy 3D source models"
```

**Note:** These instructions do not indicate that the binaries have already been pushed. This branch currently documents the pending import only.
