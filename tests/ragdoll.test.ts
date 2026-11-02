import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { Group, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { OPERATION_CARREFOUR } from '../src/data/maps/operation-carrefour';
import { applyDamage, createSimulation } from '../src/sim';
import { RagdollWorld } from '../src/render/ragdoll';

async function setup() {
  const bytes = await readFile(new URL('../src/assets/soldier/soldier-combat.glb', import.meta.url));
  const asset = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const model = clone(asset.scene);
  model.scale.setScalar(1.06 / 1.7);
  const parent = new Group(); parent.position.set(15.5, 0, 17.5); parent.add(model); parent.updateWorldMatrix(true, true);
  const state = createSimulation({ map: OPERATION_CARREFOUR, seed: 7 });
  const world = new RagdollWorld(state.map);
  return { model, parent, state, world };
}

describe('physique ragdoll visuelle', () => {
  it('crée des corps articulés depuis la vraie pose et les fait tomber sur le sol', async () => {
    const { model, world } = await setup();
    const head = model.getObjectByName('mixamorigHead')!;
    const before = head.getWorldPosition(new Vector3()).y;
    const ragdoll = world.create(model, { x: 1, y: 0 }, 1)!;
    expect(ragdoll.segments).toHaveLength(11);
    expect(ragdoll.constraints).toHaveLength(10);
    for (let i = 0; i < 180; i++) world.step(1 / 60);
    const after = head.getWorldPosition(new Vector3()).y;
    expect(after).toBeLessThan(before - 0.4);
    for (const part of ragdoll.segments) {
      expect(Number.isFinite(part.body.position.x)).toBe(true);
      expect(Number.isFinite(part.body.position.y)).toBe(true);
      expect(part.body.position.y).toBeGreaterThan(-0.08);
      expect(part.body.position.y).toBeLessThan(0.7);
      expect(Number.isFinite(part.bone.quaternion.w)).toBe(true);
    }
    world.dispose();
    expect(world.world.bodies).toHaveLength(0);
    expect(world.world.constraints).toHaveLength(0);
  });

  it('fige la physique en pause puis reprend et libère tous les corps', async () => {
    const { model, world } = await setup();
    const staticCount = world.world.bodies.length;
    const ragdoll = world.create(model, { x: 1, y: 0 }, 1)!;
    const first = ragdoll.segments[0]!.body.position.clone();
    const t = world.world.time;
    world.step(0);
    expect(world.world.time).toBe(t);
    expect(ragdoll.segments[0]!.body.position.distanceTo(first)).toBe(0);
    world.step(0.1);
    expect(ragdoll.segments[0]!.body.position.distanceTo(first)).toBeGreaterThan(0.01);
    world.remove(ragdoll);
    expect(world.world.bodies.length).toBe(staticCount);
    expect(world.world.constraints).toHaveLength(0);
    world.dispose();
  });

  it('fige et libère la physique du corps après sa chute pour limiter le coût', async () => {
    const { model, world } = await setup();
    const staticCount = world.world.bodies.length;
    const ragdoll = world.create(model, { x: 1, y: 0 }, 1)!;
    for (let i = 0; i < 310; i++) world.step(1 / 60);
    expect(ragdoll.frozen).toBe(true);
    expect(world.world.bodies.length).toBe(staticCount);
    expect(world.world.constraints).toHaveLength(0);
    const head = model.getObjectByName('mixamorigHead')!;
    const pose = head.getWorldPosition(new Vector3());
    world.step(0.2);
    expect(head.getWorldPosition(new Vector3()).distanceTo(pose)).toBeLessThan(0.00001);
    world.remove(ragdoll);
    world.dispose();
  });

  it('ne modifie pas la simulation et utilise la direction de l’attaquant pour la chute', async () => {
    const { model, state, world } = await setup();
    const a = state.units.find(u => u.faction === 'penitents')!;
    const b = state.units.find(u => u.faction === 'marteau')!;
    Object.assign(a, { x: 15, y: 17.5 }); Object.assign(b, { x: 16, y: 17.5 });
    applyDamage(state, b, 1000, { sourceId: a.id, kind: 'melee' });
    expect(b.deathImpulse?.x).toBeCloseTo(1);
    expect(b.deathImpulse?.y).toBeCloseTo(0);
    const position = { x: b.x, y: b.y, hp: b.hp };
    const ragdoll = world.create(model, b.deathImpulse, b.id)!;
    expect(ragdoll.segments[0]!.body.velocity.x).toBeGreaterThan(0);
    for (let i = 0; i < 60; i++) world.step(1 / 60);
    expect({ x: b.x, y: b.y, hp: b.hp }).toEqual(position);
    world.dispose();
  });

  it('les corps rencontrent les murs du terrain', async () => {
    const { model, state, world } = await setup();
    const index = 17 * state.map.width + 16;
    state.map.tiles[index]!.terrain = 'wall';
    world.syncMap(state.map);
    const ragdoll = world.create(model, { x: 4, y: 0 }, 2)!;
    for (let i = 0; i < 180; i++) world.step(1 / 60);
    // Le mur commence à x ≈ 16, et le corps est parti de x = 15,5.
    for (const segment of ragdoll.segments) expect(segment.body.position.x).toBeLessThan(16.1);
    world.dispose();
  });

  it('met à jour les obstacles détruits et refuse un squelette incompatible proprement', async () => {
    const { state, world } = await setup();
    const idx = Math.floor(17.5) * state.map.width + Math.floor(15.5);
    state.map.tiles[idx]!.terrain = 'wall'; world.syncMap(state.map);
    const count = world.world.bodies.length;
    state.map.tiles[idx]!.terrain = 'road'; world.syncMap(state.map);
    expect(world.world.bodies.length).toBe(count - 1);
    expect(world.create(new Group(), null, 1)).toBeNull();
    expect(world.world.bodies.length).toBe(count - 1);
    world.dispose();
  });
});

it('donne une impulsion verticale bornée aux victimes d’explosion et limite davantage coudes et genoux', async () => {
  const { model, state, world } = await setup();
  const target = state.units.find(u => u.faction === 'penitents')!;
  const attacker = state.units.find(u => u.faction === 'marteau')!;
  Object.assign(target, { x: 15.5, y: 17.5, hp: 1 });
  Object.assign(attacker, { x: 18, y: 17.5 });
  applyDamage(state, target, 80, { sourceId: attacker.id, kind: 'explosive', blastOrigin: { x: 15, y: 17.5 } });
  const ragdoll = world.create(model, target.deathImpulse, target.id)!;
  expect(ragdoll.segments[0]!.body.velocity.x).toBeGreaterThan(0.8);
  expect(ragdoll.segments[0]!.body.velocity.y).toBeGreaterThan(0.3);
  const { ConeTwistConstraint } = await import('cannon-es');
  const shoulder = ragdoll.constraints[2] as InstanceType<typeof ConeTwistConstraint>;
  const elbow = ragdoll.constraints[3] as InstanceType<typeof ConeTwistConstraint>;
  expect(elbow.angle).toBeLessThan(shoulder.angle);
  for (let i = 0; i < 180; i++) world.step(1 / 60);
  for (const part of ragdoll.segments) {
    expect(Number.isFinite(part.body.position.x)).toBe(true);
    expect(part.body.position.y).toBeGreaterThan(-0.1);
  }
  world.dispose();
});
