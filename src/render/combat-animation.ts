import { Bone, Group, Object3D, Quaternion, Vector3 } from 'three';
import type { Unit } from '../sim';

export type CombatSnapshot = Pick<Unit, 'alive' | 'hp' | 'state' | 'shotsFired' | 'intent' | 'burstLeft'> & Partial<Pick<Unit, 'maxHp'>>;
interface TrackedBone { bone: Bone; base: Quaternion }
interface ArmChain { upper: TrackedBone; hand: Bone; side: number }

/** Réactions visuelles procédurales superposées aux clips, sans modifier la simulation. */
export class CombatAnimation {
  private readonly bones: TrackedBone[] = [];
  private readonly arms: TrackedBone[] = [];
  private readonly deathArms: ArmChain[] = [];
  private spine: TrackedBone | undefined;
  private head: TrackedBone | undefined;
  private leftForearm: TrackedBone | undefined;
  private rightForearm: TrackedBone | undefined;
  private readonly worldAxis = new Vector3();
  private readonly parentRotation = new Quaternion();
  private readonly rootRotation = new Quaternion();
  private readonly offset = new Quaternion();
  private readonly targetRotation = new Quaternion();
  private readonly inverseParent = new Quaternion();
  private readonly pointA = new Vector3();
  private readonly pointB = new Vector3();
  private readonly direction = new Vector3();
  private readonly desired = new Vector3();
  private readonly identity = new Quaternion();
  private aim = 0;
  private recoil = 0;
  private flashTime = 0;
  private readonly flash: Object3D | undefined;
  private hurt = 0;
  private wounded = 0;
  private death = 0;
  private lastHp: number;
  private lastShots: number;
  private readonly bodyRestY: number;
  private readonly weaponRestY: number;
  private readonly weaponRestZ: number;

  constructor(private readonly body: Group, private readonly weapon: Group, model: Object3D | null, initial: CombatSnapshot, private readonly melee = false, private readonly clipDriven = false) {
    this.flash = model?.getObjectByName('muzzleFlash') ?? weapon.getObjectByName('muzzleFlash');
    this.lastHp = initial.hp;
    this.lastShots = initial.shotsFired;
    this.death = !initial.alive && initial.hp <= 0 ? 1 : 0;
    this.wounded = initial.alive && initial.maxHp && initial.hp < initial.maxHp * 0.45 ? 1 : 0;
    this.bodyRestY = body.position.y;
    this.weaponRestY = weapon.position.y;
    this.weaponRestZ = weapon.position.z;
    const track = (...names: string[]): TrackedBone | undefined => {
      for (const name of names) {
        const bone = model?.getObjectByName(name);
        if (!(bone instanceof Bone)) continue;
        const tracked = this.bones.find(entry => entry.bone === bone);
        if (tracked) return tracked;
        const entry = { bone, base: bone.quaternion.clone() };
        this.bones.push(entry);
        return entry;
      }
      return undefined;
    };
    this.spine = track('mixamorigSpine2', 'Spine');
    this.head = track('mixamorigHead', 'Head');
    this.leftForearm = track('mixamorigLeftForeArm', 'LeftForeArm');
    this.rightForearm = track('mixamorigRightForeArm', 'RightForeArm');
    for (const [sideName, side] of [['Left', -1], ['Right', 1]] as const) {
      const upper = track(`mixamorig${sideName}Arm`, `${sideName}Arm`);
      const hand = model?.getObjectByName(`mixamorig${sideName}Hand`) ?? model?.getObjectByName(`${sideName}Hand`);
      if (upper && !clipDriven) this.arms.push(upper);
      if (upper && hand instanceof Bone) this.deathArms.push({ upper, hand, side });
    }
    if (this.death) this.body.rotation.x = Math.PI / 2;
  }

  /** Restaurer la pose non modifiée AVANT le mixer pour éviter toute accumulation. */
  beforeMixer(): void {
    for (const { bone, base } of this.bones) bone.quaternion.copy(base);
  }

  private rotateLocal(entry: TrackedBone | undefined, x: number, y: number, z: number, angle: number): void {
    if (!entry || Math.abs(angle) < 0.0001) return;
    this.worldAxis.set(x, y, z).normalize();
    this.offset.setFromAxisAngle(this.worldAxis, angle);
    entry.bone.quaternion.multiply(this.offset);
  }

  /** Amène progressivement les mains le long du corps pendant la chute. */
  private relaxArm(chain: ArmChain, amount: number): void {
    const { bone } = chain.upper;
    if (!bone.parent || amount <= 0) return;
    bone.getWorldPosition(this.pointA);
    chain.hand.getWorldPosition(this.pointB);
    this.direction.subVectors(this.pointB, this.pointA);
    if (this.direction.lengthSq() < 1e-10) return;
    this.direction.normalize();
    this.desired.set(chain.side * 0.3, -0.9, 0.25).normalize().applyQuaternion(this.rootRotation);
    this.targetRotation.setFromUnitVectors(this.direction, this.desired);
    this.offset.copy(this.identity).slerp(this.targetRotation, amount);
    bone.parent.getWorldQuaternion(this.parentRotation);
    // Conjugaison monde -> parent : préserve l'orientation propre à chaque rig.
    this.offset.premultiply(this.inverseParent.copy(this.parentRotation).invert()).multiply(this.parentRotation);
    bone.quaternion.premultiply(this.offset);
  }

  update(unit: CombatSnapshot, dt: number): void {
    const dead = !unit.alive && unit.hp <= 0;
    const escaped = !unit.alive && unit.hp > 0;
    if (dt > 0) {
      this.flashTime = Math.max(0, this.flashTime - dt);
      if (unit.shotsFired > this.lastShots && unit.alive) { this.recoil = 1; this.flashTime = 0.09; }
      if (unit.hp < this.lastHp && unit.alive) this.hurt = 1;
      this.lastShots = unit.shotsFired;
      this.lastHp = unit.hp;
      const desiredAim = unit.alive && (unit.intent === 'feu' || unit.intent === 'mêlée' || unit.burstLeft > 0) ? 1 : 0;
      this.aim += (desiredAim - this.aim) * Math.min(1, dt * 8);
      const wounded = unit.alive && unit.maxHp && unit.hp < unit.maxHp * 0.45 ? 1 : 0;
      this.wounded += (wounded - this.wounded) * Math.min(1, dt * 3);
      this.recoil = Math.max(0, this.recoil - dt * 5);
      this.hurt = Math.max(0, this.hurt - dt * 2.5);
      if (dead) this.death = Math.min(1, this.death + dt / 0.7);
    }
    const collapse = 1 - Math.pow(1 - this.death, 2);
    const aliveWeight = unit.alive ? 1 : 0;
    this.body.visible = !escaped;
    const swing = this.melee && !this.clipDriven ? Math.sin(Math.PI * (1 - this.recoil)) * (this.recoil > 0 ? 1 : 0) : 0;
    this.body.rotation.x = collapse * Math.PI / 2 + swing * 0.18 - (this.melee ? 0 : this.recoil * 0.14) - this.hurt * 0.22 * aliveWeight + this.wounded * 0.1 * aliveWeight;
    this.body.rotation.z = this.hurt * 0.12 * aliveWeight;
    // Évite que le torse allongé soit coupé par le sol (pivot du corps aux pieds).
    this.body.position.y = this.bodyRestY + collapse * 0.09;
    this.weapon.position.y = this.weaponRestY - (1 - this.aim) * 0.2;
    this.weapon.position.z = this.weaponRestZ - this.recoil * 0.06;
    this.weapon.rotation.x = (1 - this.aim) * 0.65 + this.recoil * 0.2;
    if (this.flash) this.flash.visible = !this.melee && unit.alive && this.flashTime > 0;

    // Capturer la pose du mixer avant toute superposition, puis la restaurer au frame suivant.
    for (const entry of this.bones) entry.base.copy(entry.bone.quaternion);
    this.body.updateWorldMatrix(true, true);
    this.body.getWorldQuaternion(this.rootRotation);
    for (const arm of this.arms) {
      if (!arm.bone.parent || this.aim < 0.001 || dead) continue;
      arm.bone.parent.getWorldQuaternion(this.parentRotation).invert();
      this.worldAxis.set(-1, 0, 0).applyQuaternion(this.rootRotation).applyQuaternion(this.parentRotation).normalize();
      const punch = this.melee && (arm.bone.name === 'RightArm' || arm.bone.name === 'mixamorigRightArm') ? swing * 0.7 : 0;
      this.offset.setFromAxisAngle(this.worldAxis, (this.melee ? 0.75 : 1.05) * this.aim + punch);
      arm.bone.quaternion.premultiply(this.offset);
    }
    // L'impact et la posture blessée restent purement visuels : aucun blocage de dégâts.
    this.rotateLocal(this.spine, 1, 0, 0, aliveWeight * (this.hurt * -0.24 + this.wounded * 0.12));
    this.rotateLocal(this.head, 1, 0, 0, aliveWeight * (this.hurt * 0.28 + this.wounded * 0.10) + collapse * 0.16);
    this.rotateLocal(this.leftForearm, 0, 1, 0, aliveWeight * this.hurt * 0.22 + collapse * 0.18);
    this.rotateLocal(this.rightForearm, 0, 1, 0, -aliveWeight * this.hurt * 0.22 - collapse * 0.18);
    for (const arm of this.deathArms) this.relaxArm(arm, collapse * 0.9);
  }
}
