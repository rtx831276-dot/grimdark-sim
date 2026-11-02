import { Bone, Group, Object3D, Quaternion, Vector3 } from 'three';
import type { Unit } from '../sim';

/** Le GLB fourni contient un squelette mais aucun clip : gestes procéduraux purement visuels. */
type CreatureSnapshot = Pick<Unit, 'alive' | 'hp' | 'shotsFired' | 'x' | 'y' | 'prevX' | 'prevY'>;
interface Joint { bone: Bone; rest: Quaternion; axis: Vector3; pitchAxis: Vector3 }

export class CreatureAnimator {
  private readonly joints = new Map<string, Joint>();
  private readonly rotation = new Quaternion();
  private lastShots: number;
  private lastHp: number;
  private attackTick = -Infinity;
  private hitTick = -Infinity;
  private deathTick: number | null = null;
  private movement = 0;

  constructor(private readonly body: Group, model: Object3D, initial: CreatureSnapshot) {
    this.lastShots = initial.shotsFired;
    this.lastHp = initial.hp;
    model.updateWorldMatrix(true, true);
    const modelRotation = model.getWorldQuaternion(new Quaternion());
    // Axes définis dans le repère du modèle, convertis dans le repère du parent à la pose de repos.
    const track = (name: string, x: number, y: number, z: number): void => {
      const bone = model.getObjectByName(name);
      if (!(bone instanceof Bone) || !bone.parent) return;
      const parentInverse = bone.parent.getWorldQuaternion(new Quaternion()).invert();
      const axis = new Vector3(x, y, z).applyQuaternion(modelRotation).applyQuaternion(parentInverse).normalize();
      const pitchAxis = new Vector3(1, 0, 0).applyQuaternion(modelRotation).applyQuaternion(parentInverse).normalize();
      this.joints.set(name, { bone, rest: bone.quaternion.clone(), axis, pitchAxis });
    };
    // Ailes, pattes avant et arrière, cou et colonne/tail. Le rig d'origine nomme ses os par numéro.
    track('Bone_026', 0, 0, 1); track('Bone_028', 0, 0, 1);
    for (const name of ['Bone_038', 'Bone_044', 'Bone_010', 'Bone_016', 'Bone_022', 'Bone_024', 'Bone_004']) track(name, 1, 0, 0);
    track('Bone_002', 0, 1, 0);
  }

  private rotate(name: string, angle: number, pitch = 0): void {
    const joint = this.joints.get(name);
    if (!joint) return; // Le modèle de secours n'a pas nécessairement tous les os.
    this.rotation.setFromAxisAngle(joint.axis, angle);
    joint.bone.quaternion.copy(joint.rest).premultiply(this.rotation);
    if (pitch) joint.bone.quaternion.premultiply(this.rotation.setFromAxisAngle(joint.pitchAxis, pitch));
    joint.bone.quaternion.normalize();
  }

  /** renderTick suit la simulation : la pause fige aussi respiration, réaction et chute. */
  update(unit: CreatureSnapshot, renderTick: number, dt: number): void {
    const tick = Number.isFinite(renderTick) ? renderTick : 0;
    if (unit.alive && unit.shotsFired > this.lastShots) this.attackTick = tick;
    if (unit.alive && unit.hp < this.lastHp) this.hitTick = tick;
    if (!unit.alive && this.deathTick === null) this.deathTick = tick;
    if (unit.alive) this.deathTick = null;
    this.lastShots = unit.shotsFired; this.lastHp = unit.hp;

    const moving = unit.alive && Math.hypot(unit.x - unit.prevX, unit.y - unit.prevY) > 0.005 ? 1 : 0;
    if (dt > 0) this.movement += (moving - this.movement) * Math.min(1, dt * 6);
    const phase = tick * 0.64;
    const stride = Math.sin(phase) * this.movement;
    const breathe = Math.sin(tick * 0.13);
    const attackAge = tick - this.attackTick;
    const attack = unit.alive && attackAge >= 0 && attackAge < 7 ? Math.sin(Math.PI * attackAge / 7) : 0;
    const hitAge = tick - this.hitTick;
    const hit = unit.alive && hitAge >= 0 && hitAge < 5 ? (1 - hitAge / 5) : 0;
    const collapse = this.deathTick === null ? 0 : Math.min(1, Math.max(0, (tick - this.deathTick) / 10));
    const fallen = collapse * collapse * (3 - 2 * collapse);
    const alive = 1 - fallen;
    const wing = (0.055 * breathe + 0.22 * Math.sin(phase * 0.5) * this.movement + 0.16 * attack) * alive;
    this.rotate('Bone_026', wing + 0.42 * fallen, 0.9 * alive);
    this.rotate('Bone_028', -wing - 0.42 * fallen, 0.9 * alive);
    this.rotate('Bone_038', (0.24 * stride - 0.35 * attack + 0.13 * hit) * alive + 0.25 * fallen);
    this.rotate('Bone_044', (-0.24 * stride + 0.32 * attack - 0.13 * hit) * alive + 0.25 * fallen);
    this.rotate('Bone_010', (-0.20 * stride + 0.10 * attack) * alive + 0.15 * fallen);
    this.rotate('Bone_016', (0.20 * stride - 0.10 * attack) * alive + 0.15 * fallen);
    this.rotate('Bone_022', (-0.12 * stride) * alive + 0.12 * fallen);
    this.rotate('Bone_024', (0.035 * breathe - 0.22 * attack + 0.15 * hit) * alive + 0.18 * fallen);
    // Redresse la partie avant du rig quadrupède : les pattes avant deviennent des bras.
    this.rotate('Bone_004', (-0.9 + 0.02 * breathe - 0.10 * attack + 0.08 * hit) * alive);
    this.rotate('Bone_002', (0.04 * breathe + 0.09 * stride) * alive);
    // Affaissement progressif sans physique : le rig reste proche du sol.
    this.body.scale.y = 1 - fallen * 0.65;
    this.body.position.set(0, alive * (0.018 * (1 + breathe) + Math.abs(stride) * 0.025) + 0.12 * fallen, alive * attack * 0.12);
    this.body.rotation.set(alive * (stride * 0.035 - attack * 0.09 + hit * 0.12) - fallen * 0.15,
      0, alive * stride * 0.025 + fallen * 0.15);
  }
}
