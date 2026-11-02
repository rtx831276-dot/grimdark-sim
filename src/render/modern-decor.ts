import * as THREE from 'three';
import type { GameMap } from '../sim';
import { TERRAIN, type TerrainId } from '../data/terrain';

/** Détails purement visuels : ils ne modifient ni la grille, ni les collisions. */
export interface DecorPart { x: number; y: number; z: number; sx: number; sy: number; sz: number; color: number }

export function modernDecorParts(map: GameMap): DecorPart[] {
  const parts: DecorPart[] = [];
  const at = (x: number, z: number): TerrainId | undefined =>
    x < 0 || z < 0 || x >= map.width || z >= map.height ? undefined : map.tiles[z * map.width + x]?.terrain;
  const wall = (t: TerrainId | undefined) => t === 'wall' || t === 'urbanWall' || t === 'churchWall' || t === 'tower';
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
      // Bordures très basses, peintes sur la route : aucune collision fantôme.
      for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
        if (at(x + dx, z + dz) === 'road') continue;
        add(x + 0.5 + dx * 0.465, 0.013, z + 0.5 + dz * 0.465,
          dx ? 0.07 : 0.92, 0.026, dx ? 0.92 : 0.07, 0x999c93);
      }
      if ((x * 11 + z * 13) % 23 === 0)
        add(x + 0.48, 0.014, z + 0.48, 0.30, 0.012, 0.30, 0x606966);
      // Passages piétons encadrant le grand croisement du quartier infini.
      if (map.def.id === 'carrefour-infini' && (x === 20 || x === 26) && (z === 17 || z === 18))
        for (let n = 0; n < 4; n++)
          add(x + 0.18 + n * 0.21, 0.019, z + 0.5, 0.105, 0.012, 0.72, 0xcaccc0);
    }
    // Fenêtres sombres et linteaux sur les façades exposées, visibles de tous les angles.
    if (wall(t)) {
      const h = TERRAIN[t!].height * 0.82;
      for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
        if (wall(at(x + dx, z + dz))) continue;
        const px = x + 0.5 + dx * 0.485, pz = z + 0.5 + dz * 0.485;
        add(px, h * 0.58, pz, dx ? 0.025 : 0.48, h * 0.35, dx ? 0.48 : 0.025, 0x344a4d);
        add(px, h * 0.78, pz, dx ? 0.035 : 0.56, 0.055, dx ? 0.56 : 0.035, 0xb9b9aa);
        add(px, h * 0.39, pz, dx ? 0.035 : 0.56, 0.04, dx ? 0.56 : 0.035, 0xb1b3a6);
        // Quelques fenêtres barricadées suggèrent un quartier évacué.
        if ((x * 17 + z * 11) % 4 === 0)
          add(px + dx * 0.02, h * 0.58, pz + dz * 0.02, dx ? 0.03 : 0.5, 0.055, dx ? 0.5 : 0.03, 0x8a7963);
        else
          add(px + dx * 0.015, h * 0.58, pz + dz * 0.015, dx ? 0.02 : 0.025, h * 0.34, dx ? 0.025 : 0.02, 0x77827c);
      }
    }
    // Chaque élément ci-dessous correspond à une vraie tuile solide et destructible.
    // Les volumes restent dans l'empreinte de cette tuile ; ils disparaissent dès
    // que la simulation remplace l'obstacle par des gravats.
    if (t === 'wreck') {
      const horizontal = at(x - 1, z) === 'wreck' || at(x + 1, z) === 'wreck';
      const cabin = horizontal ? at(x - 1, z) !== 'wreck' : at(x, z - 1) !== 'wreck';
      const part = (along: number, y: number, across: number, length: number, height: number, width: number, color: number) =>
        add(x + 0.5 + (horizontal ? along : across), y, z + 0.5 + (horizontal ? across : along),
          horizontal ? length : width, height, horizontal ? width : length, color);
      part(0, 0.27, 0, 0.96, 0.36, 0.76, 0x657164);
      part(0, 0.10, 0, 0.93, 0.13, 0.70, 0x424943);
      for (const side of [-1, 1]) part(0, 0.16, side * 0.39, 0.26, 0.24, 0.16, 0x303734);
      if (cabin) {
        part(0, 0.58, 0, 0.82, 0.28, 0.66, 0x3c5050);
        part(0, 0.79, 0, 0.84, 0.14, 0.68, 0x687469);
        part(0, 0.59, 0, 0.08, 0.27, 0.69, 0x59675f);
      } else {
        part(0, 0.49, 0, 0.83, 0.08, 0.70, 0x727c6d);
        part(0.35, 0.39, 0, 0.06, 0.12, 0.64, 0x434c47);
      }
    }
    if (t === 'container') {
      const h = 1.6 * 0.82;
      add(x + 0.5, h / 2, z + 0.5, 0.96, h, 0.96, 0x5d776e);
      add(x + 0.5, h - 0.03, z + 0.5, 0.96, 0.06, 0.96, 0x829084);
      for (const side of [-1, 1]) for (const n of [-0.3, 0, 0.3]) {
        add(x + 0.5 + n, h / 2, z + 0.5 + side * 0.48, 0.035, h * 0.9, 0.02, 0x809087);
        add(x + 0.5 + side * 0.48, h / 2, z + 0.5 + n, 0.02, h * 0.9, 0.035, 0x809087);
      }
    }
    if (t === 'roadblock') {
      const h = 0.9 * 0.82;
      add(x + 0.5, h / 2, z + 0.5, 0.96, h, 0.96, 0x969b90);
      add(x + 0.5, h - 0.04, z + 0.5, 0.91, 0.08, 0.91, 0xb4b4a7);
      for (const side of [-1, 1]) for (const n of [-0.23, 0.23])
        add(x + 0.5 + n, h * 0.58, z + 0.5 + side * 0.482, 0.13, 0.18, 0.02, 0xc8aa68);
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
