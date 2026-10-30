import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { Bone, Group } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { SoldierAnimator } from '../src/render/soldier-animation';
import { CombatAnimation } from '../src/render/combat-animation';
import { MELEE_CLIPS, SWORD_CLIPS } from '../src/sim/melee-timing';

async function asset() {
  const bytes = await readFile(new URL('../src/assets/soldier/soldier-combat.glb', import.meta.url));
  return new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
}
const unit = { alive: true, hp: 100, maxHp: 100, shotsFired: 0 };

describe('animations de combat Meshy', () => {
  it('contient les 88 clips, un squelette allégé et des coups sans déplacement de racine', async () => {
    const gltf = await asset();
    expect(gltf.animations).toHaveLength(88);
    for (const name of ['Walking', 'Running', 'Block10', 'Leg_Sweep', 'Punch_Combo', 'Punch_Combo_1', 'Punch_Combo_2', 'Punch_Combo_3', 'Punch_Combo_4', 'Punch_Combo_5', 'Limping_Walk_1']) {
      expect(gltf.animations.find((c) => c.name === name)).toBeDefined();
    }
    for (const name of ['Alert_Quick_Turn_Right', 'Collect_Object', 'Combat_Idle_Turn_Left', 'Male_Bend_Over_Pick_Up', 'Rifle_Turn_Left', 'Run_Turn_Left', 'Run_Turn_Right', 'Walk_Turn_Left', 'Walk_Turn_Left_with_Weapon', 'Walk_Turn_Right', 'Walk_Turn_Right_Female', 'Walk_Turn_Right_Idle_Style']) {
      const clip = gltf.animations.find(c => c.name === name)!;
      expect(clip).toBeDefined();
      const hip = clip.tracks.find(t => t.name === 'mixamorigHips.position');
      if (hip) for (let i = 0; i < hip.values.length; i += 3) {
        expect(hip.values[i]).toBeCloseTo(hip.values[0]!, 5);
        expect(hip.values[i + 2]).toBeCloseTo(hip.values[2]!, 5);
      }
    }
    let bones = 0;
    gltf.scene.traverse((node) => { if (node instanceof Bone) bones++; });
    expect(bones).toBe(28);
    for (const clip of gltf.animations.filter(c => c.name.startsWith('Punch_') || c.name === 'Leg_Sweep' || c.name.startsWith('Limping'))) {
      const hip = clip.tracks.find(t => t.name === 'mixamorigHips.position');
      expect(hip).toBeDefined();
      const values = hip!.values;
      for (let i = 0; i < values.length; i += 3) {
        expect(values[i]).toBeCloseTo(values[0]!, 5);
        expect(values[i + 2]).toBeCloseTo(values[2]!, 5);
      }
    }
  });

  it('initialise une vraie pose de repos, même en pause', async () => {
    const gltf = await asset();
    for (const melee of [true, false]) {
      const model = clone(gltf.scene);
      const animator = new SoldierAnimator(model, gltf.animations, 0, unit, melee);
      const arm = model.getObjectByName('mixamorigRightArm')!;
      const hand = model.getObjectByName('mixamorigRightHand')!;
      const { Vector3 } = await import('three');
      model.updateWorldMatrix(true, true);
      const direction = hand.getWorldPosition(new Vector3()).sub(arm.getWorldPosition(new Vector3()));
      // En pose en T la main est surtout sur le côté ; ici elle est ramenée vers le corps.
      expect(Math.abs(direction.x)).toBeLessThan(0.3);
      animator.update('idle', 0, unit);
      animator.dispose();
    }
  });

  it('garde les bras armés stables pendant la course et reprend le repos', async () => {
    const gltf = await asset();
    const model = clone(gltf.scene);
    const animator = new SoldierAnimator(model, gltf.animations, 0, unit, false);
    expect(animator.hasFirearmPose).toBe(true);
    const arm = model.getObjectByName('mixamorigRightArm')!;
    const idle = arm.quaternion.clone();
    for (let i = 0; i < 15; i++) animator.update('run', 0.05, unit);
    expect(arm.quaternion.angleTo(idle)).toBeLessThan(0.01);
    for (let i = 0; i < 10; i++) animator.update('idle', 0.05, unit);
    expect(arm.quaternion.angleTo(idle)).toBeLessThan(0.01);
    animator.dispose();
  });

  it('pilote le clip depuis les ticks, fige la pause et revient au déplacement', async () => {
    const gltf = await asset();
    const model = clone(gltf.scene);
    const animator = new SoldierAnimator(model, gltf.animations, 0, unit, true);
    expect(animator.hasMeleeClips).toBe(true);
    const punch = gltf.animations.find(c => c.name === 'Punch_Combo')!;
    const walk = gltf.animations.find(c => c.name === 'Walking')!;
    const attack = { clip: 'Punch_Combo' as const, targetId: 2, facing: 0, startTick: 10, impactTick: 13, endTick: 28, resolved: false };
    const arm = model.getObjectByName('mixamorigRightArm')!;
    const original = arm.quaternion.clone();
    animator.update('walk', 0.2, unit);
    animator.update('idle', 0.2, { ...unit, meleeAttack: attack }, 13);
    const action = animator.mixer.clipAction(punch);
    expect(action.getEffectiveWeight()).toBeGreaterThan(0);
    expect(action.time).toBeCloseTo(punch.duration * 3 / 18);
    expect(arm.quaternion.angleTo(original)).toBeGreaterThan(0.05);
    const time = action.time;
    animator.update('idle', 0, { ...unit, meleeAttack: attack }, 13);
    expect(action.time).toBe(time);
    animator.update('walk', 0.2, { ...unit, meleeAttack: null }, 28);
    expect(animator.mixer.clipAction(walk).isRunning()).toBe(true);
    animator.dispose();
  });

  it('aligne chaque clip sur son tick d’impact et reprend au bon temps après un changement de vue', async () => {
    const gltf = await asset();
    for (const spec of MELEE_CLIPS) {
      const model = clone(gltf.scene);
      const animator = new SoldierAnimator(model, gltf.animations, 0, unit, true);
      const clip = gltf.animations.find(c => c.name === spec.name)!;
      const attack = { clip: spec.name, targetId: 2, facing: 0, startTick: 100, impactTick: 100 + spec.impactOffset,
        endTick: 100 + spec.durationTicks, resolved: false };
      // Entrée en 3D au milieu de l'attaque, pas au tick de départ.
      animator.update('idle', 0.016, { ...unit, meleeAttack: attack }, attack.impactTick);
      const action = animator.mixer.clipAction(clip);
      expect(action.time).toBeCloseTo(clip.duration * spec.impactOffset / spec.durationTicks);
      const before = action.time;
      animator.update('idle', 0, { ...unit, meleeAttack: attack }, attack.impactTick);
      expect(action.time).toBe(before);
      animator.dispose();
    }
  });

  it('synchronise les trois clips de lame sur le tick d’impact', async () => {
    const gltf = await asset();
    for (const spec of SWORD_CLIPS) {
      const animator = new SoldierAnimator(clone(gltf.scene), gltf.animations, 0, unit, true);
      const clip = gltf.animations.find(c => c.name === spec.name)!;
      expect(clip).toBeDefined();
      const attack = { clip: spec.name, targetId: 2, facing: 0, startTick: 10,
        impactTick: 10 + spec.impactOffset, endTick: 10 + spec.durationTicks, resolved: false };
      animator.update('idle', 0.1, { ...unit, meleeAttack: attack }, attack.impactTick);
      expect(animator.mixer.clipAction(clip).time).toBeCloseTo(clip.duration * spec.impactOffset / spec.durationTicks);
      animator.dispose();
    }
  });

  it('synchronise les neuf esquives avec les ticks et fige les clips en pause', async () => {
    const { DODGE_CLIPS } = await import('../src/sim/ai/meleeDodge');
    const gltf = await asset();
    for (const spec of DODGE_CLIPS) {
      const model = clone(gltf.scene);
      const animator = new SoldierAnimator(model, gltf.animations, 0, unit, true);
      const clip = gltf.animations.find(c => c.name === spec.name)!;
      expect(clip).toBeDefined();
      const dodge = { clip: spec.name, startTick: 10, endTick: 10 + spec.durationTicks, stepX: 0, stepY: 0.23 };
      animator.update('walk', 0.1, { ...unit, meleeDodge: dodge }, 13);
      const action = animator.mixer.clipAction(clip);
      expect(action.time).toBeCloseTo(clip.duration * 3 / spec.durationTicks);
      const paused = action.time;
      animator.update('walk', 0, { ...unit, meleeDodge: dodge }, 13);
      expect(action.time).toBe(paused);
      animator.dispose();
    }
  });

  it('prépare une chute Meshy avant de transférer la pose au ragdoll', async () => {
    const { RagdollWorld } = await import('../src/render/ragdoll');
    const { createSimulation } = await import('../src/sim');
    const { OPERATION_CARREFOUR } = await import('../src/data/maps/operation-carrefour');
    const gltf = await asset();
    const model = clone(gltf.scene), body = new Group();
    model.scale.setScalar(1.06 / 1.7); body.position.set(15.5, 0, 17.5); body.add(model); body.updateWorldMatrix(true, true);
    const animator = new SoldierAnimator(model, gltf.animations, 0, unit, true);
    expect(animator.beginDeath(1)).toBe(true);
    const death = gltf.animations.find(c => c.name === 'dying_backwards')!;
    animator.updateDeath(0.4);
    expect(animator.mixer.clipAction(death).time).toBeCloseTo(0.4);
    animator.updateDeath(0);
    expect(animator.mixer.clipAction(death).time).toBeCloseTo(0.4);
    animator.updateDeath(0.35);
    body.updateWorldMatrix(true, true);
    const world = new RagdollWorld(createSimulation({ map: OPERATION_CARREFOUR, seed: 1 }).map);
    const ragdoll = world.create(model, { x: 1, y: 0 }, 1);
    expect(ragdoll).not.toBeNull();
    for (let i = 0; i < 60; i++) world.step(1 / 60);
    expect(ragdoll!.segments.every(part => Number.isFinite(part.body.position.y))).toBe(true);
    world.dispose(); animator.dispose();
  });

  it('utilise la réaction Meshy aux dégâts, la boiterie, puis arrête les clips à la mort', async () => {
    const gltf = await asset();
    const model = clone(gltf.scene);
    const animator = new SoldierAnimator(model, gltf.animations, 0, unit, true);
    const block = gltf.animations.find(c => c.name === 'Hit_Reaction_to_Waist')!;
    const limp = gltf.animations.find(c => c.name === 'Limping_Walk_1')!;
    animator.update('idle', 0.1, { ...unit, hp: 40 });
    expect(animator.mixer.clipAction(block).isRunning()).toBe(true);
    animator.update('idle', block.duration + 0.1, { ...unit, hp: 40 });
    animator.update('run', 0.2, { ...unit, hp: 40 });
    expect(animator.mixer.clipAction(limp).isRunning()).toBe(true);
    animator.update('idle', 0.3, { ...unit, hp: 0, alive: false });
    expect(animator.mixer.clipAction(limp).getEffectiveWeight()).toBe(0);
    animator.dispose();
  });

  it('anime le rechargement des porteurs d’arme selon la récupération et la pause', async () => {
    const gltf = await asset();
    const animator = new SoldierAnimator(clone(gltf.scene), gltf.animations, 0, unit, false);
    const clip = gltf.animations.find(c => c.name === 'Standing_Reload')!;
    animator.update('idle', 0.1, { ...unit, reloading: true, cooldown: 2 });
    const action = animator.mixer.clipAction(clip);
    expect(action.getEffectiveWeight()).toBeGreaterThan(0);
    animator.update('idle', 0.1, { ...unit, reloading: true, cooldown: 1 });
    expect(action.time).toBeCloseTo(clip.duration / 2);
    const time = action.time;
    animator.update('idle', 0, { ...unit, reloading: true, cooldown: 1 });
    expect(action.time).toBe(time);
    animator.update('idle', 0.2, { ...unit, reloading: true, cooldown: 0 });
    expect(action.getEffectiveWeight()).toBe(0);
    animator.dispose();
  });

  it('joue les pivots appropriés et les fige en pause', async () => {
    const gltf = await asset();
    for (const [motion, facing, name] of [
      ['idle', 1, 'Alert_Quick_Turn_Right'], ['idle', -1, 'Combat_Idle_Turn_Left'],
      ['walk', 1, 'Walk_Turn_Right'], ['walk', -1, 'Walk_Turn_Left'],
      ['run', 1, 'Run_Turn_Right'], ['run', -1, 'Run_Turn_Left'],
    ] as const) {
      const model = clone(gltf.scene);
      const animator = new SoldierAnimator(model, gltf.animations, 0, { ...unit, facing: 0 }, true);
      const clip = gltf.animations.find(c => c.name === name)!;
      expect(clip).toBeDefined();
      animator.update(motion, 0.1, { ...unit, facing });
      const action = animator.mixer.clipAction(clip);
      expect(action.isRunning()).toBe(true);
      const before = action.time;
      animator.update(motion, 0, { ...unit, facing });
      expect(action.time).toBe(before);
      animator.dispose();
    }
  });

  it('utilise les deux gestes de ramassage comme soins visuels, sans les relancer en boucle', async () => {
    const gltf = await asset();
    for (const [phase, name] of [[0, 'Male_Bend_Over_Pick_Up'], [0.73, 'Collect_Object']] as const) {
      const animator = new SoldierAnimator(clone(gltf.scene), gltf.animations, phase, unit, true);
      animator.update('idle', 0.1, { ...unit, intent: 'soins' });
      const action = animator.mixer.clipAction(gltf.animations.find(c => c.name === name)!);
      expect(action.isRunning()).toBe(true);
      const before = action.time;
      animator.update('idle', 0, { ...unit, intent: 'soins' });
      expect(action.time).toBe(before);
      animator.update('idle', 1, { ...unit, intent: 'soins' });
      animator.update('idle', 0.2, { ...unit, intent: 'soins' });
      expect(action.isRunning()).toBe(false);
      animator.dispose();
    }
  });

  it('joue la célébration lors du ralliement sans la relancer à chaque frame', async () => {
    const gltf = await asset();
    const model = clone(gltf.scene);
    const animator = new SoldierAnimator(model, gltf.animations, 0, unit, true);
    const clip = gltf.animations.find(c => c.name === 'Chest_Pound_Taunt')!;
    animator.update('idle', 0.1, { ...unit, intent: 'ralliement' });
    const action = animator.mixer.clipAction(clip);
    expect(action.isRunning()).toBe(true);
    const before = action.time;
    animator.update('idle', 0, { ...unit, intent: 'ralliement' });
    expect(action.time).toBe(before);
    animator.update('idle', 0.2, { ...unit, intent: 'ralliement' });
    expect(action.time).toBeGreaterThan(before);
    animator.update('idle', 1.5, { ...unit, intent: 'ralliement' });
    animator.update('idle', 0.1, { ...unit, intent: 'ralliement' });
    expect(action.isRunning()).toBe(false);
    animator.dispose();
  });

  it('ne superpose pas les coups procéduraux aux clips importés', async () => {
    const gltf = await asset();
    const model = clone(gltf.scene), body = new Group(), weapon = new Group();
    body.add(model, weapon);
    const combat = new CombatAnimation(body, weapon, model, { ...unit, state: 'idle', intent: 'mêlée', burstLeft: 0 }, true, true);
    const animator = new SoldierAnimator(model, gltf.animations, 0, unit, true);
    const arm = model.getObjectByName('mixamorigRightArm')!;
    combat.beforeMixer();
    animator.update('idle', 0.2, { ...unit, meleeAttack: { clip: 'Punch_Combo', targetId: 2, facing: 0, startTick: 0, impactTick: 3, endTick: 18, resolved: false } }, 3);
    const animated = arm.quaternion.clone();
    combat.update({ ...unit, shotsFired: 1, state: 'idle', intent: 'mêlée', burstLeft: 0 }, 0.2);
    expect(arm.quaternion.angleTo(animated)).toBeLessThan(0.0001);
    combat.beforeMixer();
    expect(arm.quaternion.angleTo(animated)).toBeLessThan(0.0001);
    animator.dispose();
  });
});

it('reprend un rechargement en cours à la bonne progression lors du passage en 3D', async () => {
  const gltf = await asset();
  const animator = new SoldierAnimator(clone(gltf.scene), gltf.animations, 0, unit, false, 2.2);
  const clip = gltf.animations.find(c => c.name === 'Standing_Reload')!;
  animator.update('idle', 0.1, { ...unit, reloading: true, cooldown: 1.1 });
  expect(animator.mixer.clipAction(clip).time).toBeCloseTo(clip.duration / 2);
  animator.dispose();
});
