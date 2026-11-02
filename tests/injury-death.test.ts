import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { Group, Quaternion, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { CombatAnimation } from '../src/render/combat-animation';
import { SoldierAnimator } from '../src/render/soldier-animation';

const alive = { alive: true, hp: 100, maxHp: 100, state: 'idle' as const, shotsFired: 0, intent: 'en attente', burstLeft: 0 };
const dead = { ...alive, alive: false, hp: 0, state: 'dead' as const };
async function setup(phase = 0) {
  const bytes = await readFile(new URL('../src/assets/soldier/soldier-combat.glb', import.meta.url));
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const model = clone(gltf.scene), body = new Group(), weapon = new Group();
  body.add(model, weapon);
  const animator = new SoldierAnimator(model, gltf.animations, phase, alive, true);
  const combat = new CombatAnimation(body, weapon, model, alive, true, true);
  return { gltf, model, body, animator, combat };
}

describe('réactions de blessure et de mort', () => {
  it('anime le squelette sur un impact, se rétablit et ne change pas les PV', async () => {
    const { model, body, animator, combat } = await setup();
    const head = model.getObjectByName('mixamorigHead')!;
    const injured = { ...alive, hp: 70 };
    const initial = head.quaternion.clone();
    combat.beforeMixer(); animator.update('idle', 0.04, injured); combat.update(injured, 0.04);
    expect(head.quaternion.angleTo(initial)).toBeGreaterThan(0.03);
    expect(body.rotation.x).toBeLessThan(0);
    expect(injured.hp).toBe(70);
    for (let i = 0; i < 40; i++) {
      combat.beforeMixer(); animator.update('idle', 0.05, injured); combat.update(injured, 0.05);
    }
    expect(head.quaternion.angleTo(initial)).toBeLessThan(0.01);
    expect(Math.abs(body.rotation.x)).toBeLessThan(0.01);
    animator.dispose();
  });

  it('incline un blessé grave, puis retrouve une posture normale après soins', async () => {
    const { body, animator, combat } = await setup();
    const injured = { ...alive, hp: 40 };
    for (let i = 0; i < 25; i++) { combat.beforeMixer(); animator.update('idle', 0.05, injured); combat.update(injured, 0.05); }
    expect(body.rotation.x).toBeGreaterThan(0.08);
    const healed = { ...alive, hp: 80 };
    for (let i = 0; i < 50; i++) { combat.beforeMixer(); animator.update('idle', 0.05, healed); combat.update(healed, 0.05); }
    expect(Math.abs(body.rotation.x)).toBeLessThan(0.01);
    animator.dispose();
  });

  it('utilise les deux animations de boiterie Meshy en conservant la pause', async () => {
    for (const [phase, name] of [[0, 'Limping_Walk_1'], [0.73, 'Limping_Walk_2']] as const) {
      const { gltf, animator } = await setup(phase);
      const injured = { ...alive, hp: 30 };
      animator.update('idle', 0.9, injured); // laisse finir la réaction visuelle déclenchée par la blessure
      animator.update('walk', 0.2, injured);
      const clip = gltf.animations.find(c => c.name === name)!;
      expect(animator.mixer.clipAction(clip).isRunning()).toBe(true);
      const time = animator.mixer.time;
      animator.update('walk', 0, injured);
      expect(animator.mixer.time).toBe(time);
      animator.dispose();
    }
  });

  it('fait tomber le soldat et replie progressivement les bras, sans dérive du squelette', async () => {
    const { model, body, animator, combat } = await setup();
    const upper = model.getObjectByName('mixamorigRightArm')!;
    const hand = model.getObjectByName('mixamorigRightHand')!;
    combat.beforeMixer(); animator.update('idle', 0.1, dead); combat.update(dead, 0.1);
    expect(body.rotation.x).toBeGreaterThan(0);
    expect(body.rotation.x).toBeLessThan(Math.PI / 2);
    for (let i = 0; i < 40; i++) { combat.beforeMixer(); animator.update('idle', 0.05, dead); combat.update(dead, 0.05); }
    expect(body.rotation.x).toBeCloseTo(Math.PI / 2);
    expect(body.position.y).toBeCloseTo(0.09);
    body.updateWorldMatrix(true, true);
    const a = upper.getWorldPosition(new Vector3()), b = hand.getWorldPosition(new Vector3());
    const localDirection = b.sub(a).normalize().applyQuaternion(body.getWorldQuaternion(new Quaternion()).invert());
    expect(localDirection.y).toBeLessThan(-0.6);
    const settled = upper.quaternion.clone();
    for (let i = 0; i < 20; i++) { combat.beforeMixer(); animator.update('idle', 0.05, dead); combat.update(dead, 0.05); }
    expect(upper.quaternion.angleTo(settled)).toBeLessThan(0.001);
    animator.dispose();
  });

  it('superpose la blessure au combo sans modifier son temps synchronisé', async () => {
    const { gltf, animator, combat, model } = await setup();
    const attack = { clip: 'Punch_Combo' as const, targetId: 2, facing: 0, startTick: 10, impactTick: 13, endTick: 28, resolved: false };
    const hit = { ...alive, hp: 70, meleeAttack: attack };
    const forearm = model.getObjectByName('mixamorigRightForeArm')!;
    combat.beforeMixer(); animator.update('idle', 0.1, hit, 13);
    const fromClip = forearm.quaternion.clone();
    combat.update(hit, 0.1);
    expect(forearm.quaternion.angleTo(fromClip)).toBeGreaterThan(0.01);
    const action = animator.mixer.clipAction(gltf.animations.find(c => c.name === attack.clip)!);
    const time = action.time, posed = forearm.quaternion.clone();
    combat.beforeMixer(); animator.update('idle', 0, hit, 13); combat.update(hit, 0);
    expect(action.time).toBe(time);
    expect(forearm.quaternion.angleTo(posed)).toBeLessThan(0.0001);
    animator.dispose();
  });

  it('fige la chute en pause et ne fait pas tomber une unité qui a fui', async () => {
    const { body, animator, combat } = await setup();
    combat.beforeMixer(); animator.update('idle', 0.1, dead); combat.update(dead, 0.1);
    const rotation = body.rotation.x;
    combat.beforeMixer(); animator.update('idle', 0, dead); combat.update(dead, 0);
    expect(body.rotation.x).toBe(rotation);
    const escaped = { ...alive, alive: false, state: 'dead' as const };
    combat.beforeMixer(); animator.update('idle', 0.1, escaped); combat.update(escaped, 0.1);
    expect(body.visible).toBe(false);
    animator.dispose();
  });
});
