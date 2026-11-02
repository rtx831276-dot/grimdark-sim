import * as THREE from 'three';
import { Rng } from '../core/rng';
import type { SimEvent } from '../sim';

/** Particules uniquement décoratives, sans collision ni effet sur la simulation. */
interface Particle {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  age: number; life: number; size: number; growth: number; gravity: number;
  color: number;
}
export const MAX_BATTLE_PARTICLES = 180;

/** Une seule géométrie instanciée et une texture générée en mémoire. */
export class BattleParticles {
  private readonly rng = new Rng(0xc3141);
  private readonly particles: Particle[] = [];
  private readonly texture: THREE.DataTexture;
  private readonly geometry = new THREE.PlaneGeometry(1, 1);
  private readonly material: THREE.MeshBasicMaterial;
  private readonly mesh: THREE.InstancedMesh;
  private readonly dummy = new THREE.Object3D();
  private readonly tint = new THREE.Color();
  private readonly rotation = new THREE.Quaternion();
  constructor(private readonly scene: THREE.Scene) {
    const side = 64, data = new Uint8Array(side * side * 4);
    for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
      const d = Math.hypot((x + 0.5 - side / 2) / (side / 2), (y + 0.5 - side / 2) / (side / 2));
      const alpha = Math.max(0, 1 - d);
      const offset = (y * side + x) * 4;
      data[offset] = data[offset + 1] = data[offset + 2] = 255;
      data[offset + 3] = Math.round(alpha * alpha * 255);
    }
    this.texture = new THREE.DataTexture(data, side, side, THREE.RGBAFormat);
    this.texture.needsUpdate = true;
    this.material = new THREE.MeshBasicMaterial({map: this.texture, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide});
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, MAX_BATTLE_PARTICLES);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    scene.add(this.mesh);
  }
  get count(): number { return this.particles.length; }

  private add(x: number, y: number, z: number, kind: 'smoke' | 'dust' | 'spark' | 'flash'): void {
    const r = this.rng;
    const smoke = kind === 'smoke', dust = kind === 'dust', flash = kind === 'flash';
    this.particles.push({x, y, z,
      vx: r.spread(smoke ? 0.16 : dust ? 0.8 : 1.7),
      vy: flash ? 0.15 : smoke ? r.range(0.22, 0.65) : r.range(0.4, dust ? 1.6 : 2.6),
      vz: r.spread(smoke ? 0.16 : dust ? 0.8 : 1.7), age: 0,
      life: flash ? 0.14 : smoke ? r.range(1.4, 2.8) : dust ? r.range(0.45, 1.1) : r.range(0.18, 0.55),
      size: flash ? 0.8 : smoke ? r.range(0.32, 0.60) : dust ? r.range(0.12, 0.27) : r.range(0.04, 0.10),
      growth: smoke ? r.range(0.3, 0.65) : dust ? 0.22 : 0,
      gravity: smoke || flash ? 0 : dust ? 1.1 : 4,
      color: flash ? 0xffb65b : smoke ? 0x7b776d : dust ? 0xb0a38a : 0xffc46b,
    });
  }

  /** Les événements arrivent une fois par tick ; ignorer le tir FPS du joueur dont
   * l'éclair de bouche est déjà dessiné devant la caméra. */
  ingest(events: readonly SimEvent[], skipShooterId?: number): void {
    let accepted = 0;
    // Traiter les explosions avant les salves dans les scènes très chargées.
    const relevant = events.filter(e => e.type === 'explosion' || e.type === 'terrainDestroyed' || e.type === 'impact' || e.type === 'shot');
    relevant.sort((a, b) => (a.type === 'explosion' ? -1 : 0) - (b.type === 'explosion' ? -1 : 0));
    for (const e of relevant) {
      if (accepted >= 28 || !Number.isFinite(e.x) || !Number.isFinite(e.y)) continue;
      if (e.type === 'shot' && skipShooterId !== undefined && e.unitId === skipShooterId) continue;
      accepted++;
      const x = e.x!, z = e.y!, h = Number.isFinite(e.height) ? Math.max(0.03, e.height!) : 0.06;
      if (e.type === 'explosion') {
        this.add(x, 0.3, z, 'flash');
        for (let i = 0; i < 9; i++) this.add(x + this.rng.spread(0.4), 0.18 + this.rng.next() * 0.5, z + this.rng.spread(0.4), 'smoke');
        for (let i = 0; i < 9; i++) this.add(x, 0.12, z, 'dust');
        for (let i = 0; i < 8; i++) this.add(x, 0.25, z, 'spark');
      } else if (e.type === 'terrainDestroyed') {
        for (let i = 0; i < 5; i++) this.add(x, 0.2, z, 'dust');
      } else if (e.type === 'impact') {
        for (let i = 0; i < 3; i++) this.add(x, h, z, 'dust');
        if (h > 0.1) for (let i = 0; i < 2; i++) this.add(x, h, z, 'spark');
      } else if (e.type === 'shot') {
        const dx = (e.tx ?? x) - x, dz = (e.ty ?? z) - z, len = Math.hypot(dx, dz) || 1;
        const mx = x + dx / len * 0.35, mz = z + dz / len * 0.35;
        this.add(mx, 0.83, mz, 'smoke');
        this.add(mx, 0.83, mz, 'spark');
      }
    }
    if (this.particles.length > MAX_BATTLE_PARTICLES) this.particles.splice(0, this.particles.length - MAX_BATTLE_PARTICLES);
  }

  /** dt nul fige la scène pendant la pause ; la caméra peut toujours tourner. */
  update(dt: number, camera: THREE.Camera): void {
    const delta = Number.isFinite(dt) ? Math.max(0, Math.min(dt, 1)) : 0;
    camera.getWorldQuaternion(this.rotation);
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]!;
      p.age += delta;
      if (p.age >= p.life) { this.particles.splice(i, 1); continue; }
      p.x += p.vx * delta; p.z += p.vz * delta;
      p.y = Math.max(0.02, p.y + p.vy * delta - 0.5 * p.gravity * delta * delta);
      p.vy -= p.gravity * delta;
    }
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i]!;
      const fade = Math.min(1, (p.life - p.age) / (p.life * 0.3));
      const size = (p.size + p.growth * p.age) * Math.max(0, fade);
      this.dummy.position.set(p.x, p.y, p.z); this.dummy.quaternion.copy(this.rotation);
      this.dummy.scale.set(size, size, 1); this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      this.mesh.setColorAt(i, this.tint.setHex(p.color));
    }
    this.mesh.count = this.particles.length;
    if (this.mesh.count) { this.mesh.instanceMatrix.needsUpdate = true; if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true; }
  }
  clear(): void { this.particles.length = 0; this.mesh.count = 0; }
  dispose(): void { this.clear(); this.scene.remove(this.mesh); this.mesh.dispose(); this.geometry.dispose(); this.material.dispose(); this.texture.dispose(); }
}
