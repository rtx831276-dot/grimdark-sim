import * as CANNON from 'cannon-es';
import { Bone, Object3D, Quaternion, Vector3 } from 'three';
import { TERRAIN } from '../data/terrain';
import type { GameMap } from '../sim';

// Physique visuelle uniquement : ni ces corps ni leurs collisions ne modifient la simulation.
const GROUND_GROUP = 1;
const RAGDOLL_GROUP = 2;
const STEP = 1 / 60;

interface SegmentSpec { name: string; end: string; mass: number; radius: number; sphere?: boolean }
const SEGMENTS: readonly SegmentSpec[] = [
  { name: 'mixamorigHips', end: 'mixamorigSpine', mass: 1.6, radius: 0.09 },
  { name: 'mixamorigSpine', end: 'mixamorigNeck', mass: 2.5, radius: 0.12 },
  { name: 'mixamorigHead', end: 'mixamorigHeadTop_End', mass: 0.7, radius: 0.09, sphere: true },
  { name: 'mixamorigLeftArm', end: 'mixamorigLeftForeArm', mass: 0.35, radius: 0.045 },
  { name: 'mixamorigLeftForeArm', end: 'mixamorigLeftHand', mass: 0.25, radius: 0.04 },
  { name: 'mixamorigRightArm', end: 'mixamorigRightForeArm', mass: 0.35, radius: 0.045 },
  { name: 'mixamorigRightForeArm', end: 'mixamorigRightHand', mass: 0.25, radius: 0.04 },
  { name: 'mixamorigLeftUpLeg', end: 'mixamorigLeftLeg', mass: 0.75, radius: 0.06 },
  { name: 'mixamorigLeftLeg', end: 'mixamorigLeftFoot', mass: 0.45, radius: 0.05 },
  { name: 'mixamorigRightUpLeg', end: 'mixamorigRightLeg', mass: 0.75, radius: 0.06 },
  { name: 'mixamorigRightLeg', end: 'mixamorigRightFoot', mass: 0.45, radius: 0.05 },
];

// Parent, enfant, os représentant l'articulation : épaule, coude, hanche, genou…
const JOINTS = [
  ['mixamorigHips', 'mixamorigSpine', 'mixamorigSpine'],
  ['mixamorigSpine', 'mixamorigHead', 'mixamorigHead'],
  ['mixamorigSpine', 'mixamorigLeftArm', 'mixamorigLeftArm'],
  ['mixamorigLeftArm', 'mixamorigLeftForeArm', 'mixamorigLeftForeArm'],
  ['mixamorigSpine', 'mixamorigRightArm', 'mixamorigRightArm'],
  ['mixamorigRightArm', 'mixamorigRightForeArm', 'mixamorigRightForeArm'],
  ['mixamorigHips', 'mixamorigLeftUpLeg', 'mixamorigLeftUpLeg'],
  ['mixamorigLeftUpLeg', 'mixamorigLeftLeg', 'mixamorigLeftLeg'],
  ['mixamorigHips', 'mixamorigRightUpLeg', 'mixamorigRightUpLeg'],
  ['mixamorigRightUpLeg', 'mixamorigRightLeg', 'mixamorigRightLeg'],
] as const;

interface Segment {
  bone: Bone;
  body: CANNON.Body;
  relativeRotation: Quaternion;
  rootPivot: CANNON.Vec3;
}

/** Un squelette physique séparé, appliqué après l'animation des vivants. */
export class Ragdoll {
  elapsed = 0;
  frozen = false;
  private readonly worldPoint = new Vector3();
  private readonly worldRotation = new Quaternion();
  private readonly parentRotation = new Quaternion();
  constructor(readonly segments: Segment[], readonly constraints: CANNON.Constraint[]) {}

  sync(): void {
    for (const [index, segment] of this.segments.entries()) {
      const { bone, body, relativeRotation, rootPivot } = segment;
      if (!bone.parent) continue;
      if (index === 0) {
        const pivot = body.pointToWorldFrame(rootPivot);
        this.worldPoint.set(pivot.x, pivot.y, pivot.z);
        bone.parent.worldToLocal(this.worldPoint);
        bone.position.copy(this.worldPoint);
      }
      this.worldRotation.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w).multiply(relativeRotation);
      bone.parent.getWorldQuaternion(this.parentRotation).invert();
      bone.quaternion.copy(this.parentRotation.multiply(this.worldRotation));
      bone.updateWorldMatrix(true, false);
    }
  }
}

/** Monde physique partagé par les cadavres ; aucune collision avec les unités vivantes. */
export class RagdollWorld {
  readonly world: CANNON.World;
  private readonly terrain = new Map<number, { type: string; body: CANNON.Body }>();
  private readonly ragdolls = new Set<Ragdoll>();
  private readonly ground: CANNON.Body;

  constructor(map: GameMap) {
    this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.81, 0), allowSleep: true });
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    this.world.defaultContactMaterial.friction = 0.7;
    this.world.defaultContactMaterial.restitution = 0;
    this.ground = new CANNON.Body({ mass: 0, shape: new CANNON.Plane(), collisionFilterGroup: GROUND_GROUP, collisionFilterMask: RAGDOLL_GROUP });
    this.ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.world.addBody(this.ground);
    this.syncMap(map);
  }

  /** Les obstacles reflètent les tuiles visibles, y compris après leur destruction. */
  syncMap(map: GameMap): void {
    for (let i = 0; i < map.tiles.length; i++) {
      const tile = map.tiles[i]!;
      const def = TERRAIN[tile.terrain];
      const existing = this.terrain.get(i);
      if (existing?.type === tile.terrain) continue;
      if (existing) { this.world.removeBody(existing.body); this.terrain.delete(i); }
      const h = def.height * 0.82;
      if (h < 0.08) continue;
      const width = tile.terrain === 'tree' ? 0.18 : 0.96;
      const height = tile.terrain === 'tree' ? Math.max(h, 1.2) : h;
      const body = new CANNON.Body({ mass: 0, shape: new CANNON.Box(new CANNON.Vec3(width / 2, height / 2, width / 2)),
        position: new CANNON.Vec3(i % map.width + 0.5, height / 2, Math.floor(i / map.width) + 0.5),
        collisionFilterGroup: GROUND_GROUP, collisionFilterMask: RAGDOLL_GROUP });
      this.world.addBody(body);
      this.terrain.set(i, { type: tile.terrain, body });
    }
  }

  /** Crée les corps à partir de la pose actuelle, ou null si le rig n'est pas compatible. */
  create(model: Object3D, impulse: { x: number; y: number; lift?: number } | null, id: number): Ragdoll | null {
    model.updateWorldMatrix(true, true);
    const boneByName = new Map<string, Bone>();
    for (const spec of SEGMENTS) {
      for (const name of [spec.name, spec.end]) {
        const bone = model.getObjectByName(name);
        if (!(bone instanceof Bone)) return null;
        boneByName.set(name, bone);
      }
    }
    const segments: Segment[] = [];
    const byName = new Map<string, Segment>();
    for (const spec of SEGMENTS) {
      const bone = boneByName.get(spec.name)!;
      const end = boneByName.get(spec.end)!;
      const a = bone.getWorldPosition(new Vector3());
      const b = end.getWorldPosition(new Vector3());
      const direction = b.clone().sub(a);
      const length = direction.length();
      if (length < 0.001) { for (const part of segments) this.world.removeBody(part.body); return null; }
      const orientation = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), direction.normalize());
      const center = a.clone().add(b).multiplyScalar(0.5);
      const shape = spec.sphere ? new CANNON.Sphere(spec.radius) : new CANNON.Box(new CANNON.Vec3(spec.radius, Math.max(length / 2, spec.radius), spec.radius));
      const body = new CANNON.Body({ mass: spec.mass, shape, position: new CANNON.Vec3(center.x, center.y, center.z),
        quaternion: new CANNON.Quaternion(orientation.x, orientation.y, orientation.z, orientation.w),
        linearDamping: 0.18, angularDamping: 0.72, allowSleep: true, sleepSpeedLimit: 0.12, sleepTimeLimit: 1.5,
        collisionFilterGroup: RAGDOLL_GROUP, collisionFilterMask: GROUND_GROUP });
      // La direction du dernier coup pousse le corps ; variation déterministe légère.
      body.velocity.set((impulse?.x ?? 0) * 0.8, 0.1 + (impulse?.lift ?? 0), (impulse?.y ?? 0) * 0.8);
      body.angularVelocity.set(0.15, (id % 2 ? 1 : -1) * 0.4, -0.12);
      const worldBoneRotation = bone.getWorldQuaternion(new Quaternion());
      const relativeRotation = orientation.clone().invert().multiply(worldBoneRotation);
      const rootPivot = body.pointToLocalFrame(new CANNON.Vec3(a.x, a.y, a.z));
      const segment = { bone, body, relativeRotation, rootPivot };
      this.world.addBody(body);
      segments.push(segment);
      byName.set(spec.name, segment);
    }
    const constraints: CANNON.Constraint[] = [];
    for (const [parentName, childName, jointName] of JOINTS) {
      const parent = byName.get(parentName)!.body;
      const child = byName.get(childName)!.body;
      const joint = boneByName.get(jointName)!.getWorldPosition(new Vector3());
      const p = new CANNON.Vec3(joint.x, joint.y, joint.z);
      const worldAxis = child.quaternion.vmult(new CANNON.Vec3(0, 1, 0));
      // Les genoux et les coudes tournent moins que les épaules et les hanches.
      const limbEnd = childName.includes('ForeArm') || childName === 'mixamorigLeftLeg' || childName === 'mixamorigRightLeg';
      const neck = childName === 'mixamorigHead';
      const constraint = new CANNON.ConeTwistConstraint(parent, child, {
        pivotA: parent.pointToLocalFrame(p), pivotB: child.pointToLocalFrame(p),
        axisA: parent.vectorToLocalFrame(worldAxis), axisB: child.vectorToLocalFrame(worldAxis),
        angle: limbEnd ? Math.PI / 4 : neck ? Math.PI / 3.2 : Math.PI / 2.4,
        twistAngle: limbEnd ? Math.PI / 5 : neck ? Math.PI / 4 : Math.PI / 3,
        maxForce: 120, collideConnected: false,
      });
      this.world.addConstraint(constraint);
      constraints.push(constraint);
    }
    const ragdoll = new Ragdoll(segments, constraints);
    this.ragdolls.add(ragdoll);
    return ragdoll;
  }

  step(dt: number): void {
    const advance = Math.max(0, Math.min(dt, 0.25));
    if (advance > 0 && [...this.ragdolls].some(ragdoll => !ragdoll.frozen)) this.world.step(STEP, advance, 15);
    for (const ragdoll of this.ragdolls) {
      if (ragdoll.frozen) continue;
      ragdoll.sync();
      ragdoll.elapsed += advance;
      // Les corps ne collisionnent pas entre eux ; après la chute, figer la pose évite
      // que les cadavres continuent à coûter du temps de calcul pendant toute la partie.
      if (ragdoll.elapsed >= 5) {
        for (const constraint of ragdoll.constraints) this.world.removeConstraint(constraint);
        for (const segment of ragdoll.segments) this.world.removeBody(segment.body);
        ragdoll.frozen = true;
      }
    }
  }

  remove(ragdoll: Ragdoll): void {
    if (!this.ragdolls.delete(ragdoll)) return;
    for (const constraint of ragdoll.constraints) this.world.removeConstraint(constraint);
    for (const segment of ragdoll.segments) this.world.removeBody(segment.body);
  }

  dispose(): void {
    for (const ragdoll of [...this.ragdolls]) this.remove(ragdoll);
    for (const entry of this.terrain.values()) this.world.removeBody(entry.body);
    this.terrain.clear();
    this.world.removeBody(this.ground);
  }
}
