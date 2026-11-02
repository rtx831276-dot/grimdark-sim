import { describe, expect, it } from 'vitest';
import { Bone, Group, Object3D } from 'three';
import { CombatAnimation, type CombatSnapshot } from '../src/render/combat-animation';

function initial(): CombatSnapshot {
  return { alive: true, hp: 100, state: 'idle', shotsFired: 0, intent: 'en attente', burstLeft: 0 };
}
function setup() {
  const body = new Group();
  const model = new Group();
  const arm = new Bone(); arm.name = 'RightArm';
  const weapon = new Group();
  const flash = new Object3D(); flash.name = 'muzzleFlash';
  weapon.add(flash); model.add(arm); body.add(model, weapon);
  const animation = new CombatAnimation(body, weapon, model, initial());
  return { body, model, arm, weapon, flash, animation };
}

describe('animations de combat', () => {
  it('lève les bras et réagit au tir sans accumuler les rotations du squelette', () => {
    const { arm, body, flash, animation } = setup();
    const state = { ...initial(), intent: 'feu', shotsFired: 3, burstLeft: 3 };
    animation.beforeMixer(); animation.update(state, 0.02);
    expect(body.rotation.x).toBeLessThan(0);
    expect(flash.visible).toBe(true);
    for (let i = 0; i < 100; i++) { animation.beforeMixer(); animation.update(state, 0.03); }
    const settled = arm.quaternion.clone();
    animation.beforeMixer(); animation.update(state, 0.03);
    expect(arm.quaternion.angleTo(settled)).toBeLessThan(0.0001);
    expect(flash.visible).toBe(false);
    expect(Math.abs(body.rotation.x)).toBeLessThan(0.001);
  });

  it('réagit aux dégâts et tombe seulement si le soldat est mort, pas s’il a fui', () => {
    const { body, animation } = setup();
    animation.beforeMixer(); animation.update({ ...initial(), hp: 70 }, 0.03);
    expect(body.rotation.x).toBeLessThan(0);
    animation.beforeMixer(); animation.update({ ...initial(), alive: false, hp: 0, state: 'dead' }, 0.35);
    expect(body.rotation.x).toBeGreaterThan(0.5);
    animation.beforeMixer(); animation.update({ ...initial(), alive: false, hp: 0, state: 'dead' }, 1);
    expect(body.rotation.x).toBeCloseTo(Math.PI / 2);
    animation.beforeMixer(); animation.update({ ...initial(), alive: false, hp: 40, state: 'dead' }, 0.1);
    expect(body.visible).toBe(false);
  });

  it('respecte la pause : pas de mouvement ni de consommation du nouveau tir', () => {
    const { body, animation } = setup();
    const shot = { ...initial(), shotsFired: 1, burstLeft: 1, intent: 'feu' };
    animation.beforeMixer(); animation.update(shot, 0);
    expect(body.rotation.x).toBe(0);
    animation.beforeMixer(); animation.update(shot, 0.02);
    expect(body.rotation.x).toBeLessThan(0);
    const before = body.rotation.x;
    animation.beforeMixer(); animation.update(shot, 0);
    expect(body.rotation.x).toBe(before);
  });
});

it('anime les bras du vrai squelette en même temps que la marche, puis revient à la pose de base', async () => {
  const { readFile } = await import('node:fs/promises');
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
  const { clone } = await import('three/examples/jsm/utils/SkeletonUtils.js');
  const { SoldierAnimator } = await import('../src/render/soldier-animation');
  const bytes = await readFile(new URL('../src/assets/soldier/soldier.glb', import.meta.url));
  const asset = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const model = clone(asset.scene);
  const body = new Group(); const weapon = new Group(); body.add(model, weapon);
  const arm = model.getObjectByName('RightArm')!;
  const animator = new SoldierAnimator(model, asset.animations);
  const combat = new CombatAnimation(body, weapon, model, initial());
  for (let i = 0; i < 30; i++) {
    combat.beforeMixer(); animator.update('walk', 0.02);
    combat.update({ ...initial(), intent: 'feu' }, 0.02);
  }
  const aimed = arm.quaternion.clone();
  combat.beforeMixer();
  expect(aimed.angleTo(arm.quaternion)).toBeGreaterThan(0.5);
  animator.dispose();
});

it('anime un coup à mains nues sans flash de tir', () => {
  const body = new Group();
  const model = new Group();
  const arm = new Bone(); arm.name = 'RightArm'; model.add(arm);
  const weapon = new Group();
  const flash = new Object3D(); flash.name = 'muzzleFlash'; weapon.add(flash);
  body.add(model, weapon);
  const animation = new CombatAnimation(body, weapon, model, initial(), true);
  const strike = { ...initial(), intent: 'mêlée', shotsFired: 1, burstLeft: 1 };
  animation.beforeMixer(); animation.update(strike, 0.08);
  expect(flash.visible).toBe(false);
  expect(body.rotation.x).toBeGreaterThan(0);
  expect(arm.quaternion.angleTo(new Bone().quaternion)).toBeGreaterThan(0.1);
});

it('déclenche un éclair sur le vrai modèle, le maintient à la pause puis le retire', () => {
  const body = new Group(), model = new Group(), weapon = new Group();
  const flash = new Object3D(); flash.name = 'muzzleFlash'; flash.visible = false;
  model.add(flash); body.add(model, weapon);
  const animation = new CombatAnimation(body, weapon, model, initial(), false, true);
  animation.update({ ...initial(), shotsFired: 1 }, 0.2);
  expect(flash.visible).toBe(true);
  animation.update({ ...initial(), shotsFired: 1 }, 0);
  expect(flash.visible).toBe(true);
  animation.update({ ...initial(), shotsFired: 1 }, 0.1);
  expect(flash.visible).toBe(false);
});
