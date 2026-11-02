import * as THREE from 'three';
import type { Unit } from '../sim';
import { lerp } from '../core/math';

/** Ombres de contact synthétiques : peu coûteuses, purement visuelles, sans shadow map. */
export class UnitShadows {
  private readonly texture: THREE.DataTexture;
  private readonly geometry = new THREE.PlaneGeometry(1, 1);
  private readonly material: THREE.MeshBasicMaterial;
  private readonly mesh: THREE.InstancedMesh;
  private readonly dummy = new THREE.Object3D();
  constructor(private readonly scene: THREE.Scene) {
    const side = 32, pixels = new Uint8Array(side * side * 4);
    for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
      const distance = Math.hypot((x + 0.5 - side / 2) / (side / 2), (y + 0.5 - side / 2) / (side / 2));
      const fade = Math.max(0, 1 - distance);
      const i = (y * side + x) * 4;
      pixels[i] = pixels[i + 1] = pixels[i + 2] = 255;
      pixels[i + 3] = Math.round(255 * fade * fade);
    }
    this.texture = new THREE.DataTexture(pixels, side, side, THREE.RGBAFormat);
    this.texture.needsUpdate = true;
    this.material = new THREE.MeshBasicMaterial({color: 0x101310, map: this.texture, transparent: true, opacity: 0.65, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1});
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, 96);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.dummy.rotation.x = -Math.PI / 2;
    scene.add(this.mesh);
  }
  update(units: readonly Unit[], alpha: number, fpsUnitId?: number): void {
    let count = 0;
    for (const unit of units) {
      if (!unit.alive || unit.id === fpsUnitId || count >= 96) continue;
      const size = unit.defId === 'creature' ? 2.4 : 0.67;
      this.dummy.position.set(lerp(unit.prevX, unit.x, alpha), 0.014, lerp(unit.prevY, unit.y, alpha));
      this.dummy.scale.set(size, size * 0.7, 1);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(count++, this.dummy.matrix);
    }
    this.mesh.count = count;
    if (count) this.mesh.instanceMatrix.needsUpdate = true;
  }
  clear(): void { this.mesh.count = 0; }
  dispose(): void { this.clear(); this.scene.remove(this.mesh); this.mesh.dispose(); this.geometry.dispose(); this.material.dispose(); this.texture.dispose(); }
}
