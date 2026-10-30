import * as THREE from 'three';
import type { GameMap } from '../sim';
import type { TerrainId } from '../data/terrain';

/** Détails purement visuels : ils ne modifient ni la grille, ni les collisions. */
export interface DecorPart { x: number; y: number; z: number; sx: number; sy: number; sz: number; color: number }

export function modernDecorParts(map: GameMap): DecorPart[] {
  const parts: DecorPart[] = [];
  const at = (x: number, z: number): TerrainId | undefined =>
    x < 0 || z < 0 || x >= map.width || z >= map.height ? undefined : map.tiles[z * map.width + x]?.terrain;
  const wall = (t: TerrainId | undefined) => t === 'wall' || t === 'churchWall' || t === 'tower';
  const add = (x: number, y: number, z: number, sx: number, sy: number, sz: number, color: number) =>
    parts.push({ x, y, z, sx, sy, sz, color });
  for (let z = 0; z < map.height; z++) for (let x = 0; x < map.width; x++) {
    const t = at(x, z);
    // Ligne discontinue à la jonction des deux voies, uniquement sur l'asphalte.
    if (t === 'road') {
      if (at(x, z + 1) === 'road' && at(x, z - 1) !== 'road' && x % 3 !== 0)
        add(x + 0.5, 0.009, z + 0.94, 0.65, 0.012, 0.055, 0xd2cfb6);
      if (at(x + 1, z) === 'road' && at(x - 1, z) !== 'road' && z % 3 !== 0)
        add(x + 0.94, 0.01, z + 0.5, 0.055, 0.012, 0.65, 0xd2cfb6);
    }
    // Fenêtres sombres et linteaux sur les façades exposées, visibles de tous les angles.
    if (wall(t)) {
      const h = t === 'wall' ? 1.23 : t === 'churchWall' ? 1.97 : 3.44;
      for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
        if (wall(at(x + dx, z + dz))) continue;
        const px = x + 0.5 + dx * 0.485, pz = z + 0.5 + dz * 0.485;
        add(px, h * 0.58, pz, dx ? 0.025 : 0.48, h * 0.35, dx ? 0.48 : 0.025, 0x344a4d);
        add(px, h * 0.78, pz, dx ? 0.035 : 0.56, 0.055, dx ? 0.56 : 0.035, 0xb9b9aa);
      }
    }
    // Sacs superposés plutôt qu'un bloc uniforme ; l'empreinte reste celle de la tuile.
    if (t === 'sandbag') {
      for (let row = 0; row < 2; row++) for (let n = 0; n < 3; n++)
        add(x + 0.18 + n * 0.31, 0.075 + row * 0.14, z + 0.5 + (row ? 0.045 : -0.045), 0.29, 0.14, 0.44, row ? 0xada27d : 0x968a69);
    }
    // Petits débris de béton sur les tuiles déjà définies comme gravats.
    if (t === 'rubble') {
      add(x + 0.3, 0.12, z + 0.35, 0.24, 0.24, 0.33, 0x858b86);
      add(x + 0.65, 0.08, z + 0.67, 0.3, 0.16, 0.2, 0x737b77);
    }
    // Les arbres existants servent de poteaux utilitaires dans la mission moderne.
    if (t === 'tree') {
      add(x + 0.5, 1.36, z + 0.5, 0.7, 0.08, 0.09, 0x6d7370);
      add(x + 0.5, 1.49, z + 0.5, 0.1, 0.25, 0.1, 0x858a83);
    }
  }
  return parts;
}

/** Maillage instancié unique, reconstruit seulement si le terrain change. */
export class ModernDecor {
  private mesh: THREE.InstancedMesh | null = null;
  private readonly geometry = new THREE.BoxGeometry(1, 1, 1);
  private readonly material = new THREE.MeshLambertMaterial({ color: 0xffffff });
  private signature = '';
  constructor(private readonly scene: THREE.Scene) {}
  update(map: GameMap): void {
    const signature = map.tiles.map(tile => tile.terrain).join('|');
    if (signature === this.signature) return;
    this.signature = signature;
    if (this.mesh) { this.scene.remove(this.mesh); this.mesh.dispose(); }
    const parts = modernDecorParts(map);
    const mesh = new THREE.InstancedMesh(this.geometry, this.material, parts.length);
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    parts.forEach((p, i) => {
      dummy.position.set(p.x, p.y, p.z);
      dummy.scale.set(p.sx, p.sy, p.sz);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, color.setHex(p.color));
    });
    this.mesh = mesh;
    this.scene.add(mesh);
  }
  dispose(): void {
    if (this.mesh) { this.scene.remove(this.mesh); this.mesh.dispose(); }
    this.geometry.dispose();
    this.material.dispose();
  }
}

/** Grain discret généré localement ; aucun fichier ou service externe requis. */
export function makeGroundTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#e2e2e2';
  ctx.fillRect(0, 0, 128, 128);
  let seed = 17391;
  for (let i = 0; i < 2600; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const x = seed % 128;
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const y = (seed >>> 8) % 128;
    const shade = 165 + ((seed >>> 16) % 75);
    ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
    ctx.fillRect(x, y, 1 + (seed % 3), 1);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}
