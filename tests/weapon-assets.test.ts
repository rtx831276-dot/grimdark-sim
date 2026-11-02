import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { Bone, Group, Quaternion } from 'three';
import { NodeIO } from '@gltf-transform/core';
import { mountWeapon, stabilizeFirearm } from '../src/render/weapon-mount';

describe('modèles d’armes optimisés', () => {
  it('contient les quatre modèles texturés dans des GLB autonomes et allégés', async () => {
    const io = new NodeIO();
    for (const name of ['pistol', 'rifle', 'blade', 'grenade']) {
      const bytes = await readFile(new URL(`../src/assets/weapons/${name}.glb`, import.meta.url));
      const doc = await io.readBinary(bytes);
      const root = doc.getRoot();
      expect(root.listMeshes()).toHaveLength(1);
      expect(root.listTextures()[0]?.getImage()?.length).toBeGreaterThan(1000);
      expect(root.listMaterials()[0]!.getMetallicFactor()).toBeLessThan(0.3);
      const primitive = root.listMeshes()[0]!.listPrimitives()[0]!;
      expect(primitive.getIndices()!.getCount() / 3).toBeLessThan(30000);
    }
  });

  it('ne confond pas la lame et la grenade', async () => {
    const io = new NodeIO();
    const getWidth = async (name: string) => {
      const bytes = await readFile(new URL(`../src/assets/weapons/${name}.glb`, import.meta.url));
      const doc = await io.readBinary(bytes);
      const positions = doc.getRoot().listMeshes()[0]!.listPrimitives()[0]!.getAttribute('POSITION')!;
      return positions.getMax([])[0]! - positions.getMin([])[0]!;
    };
    expect(await getWidth('blade')).toBeGreaterThan(1.6);
    expect(await getWidth('grenade')).toBeLessThan(1.1);
  });

  it('stabilise les armes à feu lorsque la main tourne, sans figer la lame', () => {
    const model = new Group(), hand = new Bone(); hand.name = 'mixamorigRightHand'; model.add(hand);
    const mount = mountWeapon(model, new Group(), 'rifle')!;
    hand.rotation.set(0.9, 0.4, 0.2);
    stabilizeFirearm(model);
    model.updateWorldMatrix(true, true);
    const actual = mount.getWorldQuaternion(new Quaternion());
    const expected = model.getWorldQuaternion(new Quaternion()).multiply(new Quaternion().fromArray(mount.userData.aimAlignment));
    expect(actual.angleTo(expected)).toBeLessThan(0.0001);
    mount.removeFromParent();
    const blade = mountWeapon(model, new Group(), 'blade')!;
    const original = blade.quaternion.clone();
    hand.rotation.x += 0.4;
    stabilizeFirearm(model);
    expect(blade.quaternion.angleTo(original)).toBeLessThan(0.0001);
  });

  it('attache chaque arme à la main droite et suit son mouvement', () => {
    const model = new Group(), hand = new Bone(); hand.name = 'mixamorigRightHand'; model.add(hand);
    const source = new Group(); source.name = 'mesh';
    for (const type of ['pistol', 'rifle', 'blade'] as const) {
      const mount = mountWeapon(model, source, type)!;
      expect(mount.parent).toBe(hand);
      expect(mount.getObjectByName('mesh')).toBeDefined();
      expect(Number.isFinite(mount.quaternion.w)).toBe(true);
      mount.removeFromParent();
    }
    expect(mountWeapon(new Group(), source, 'rifle')).toBeNull();
  });
});

it('les éclairs appartiennent au porteur, sont placés au canon et libérés sans détruire le modèle partagé', async () => {
  const { BufferGeometry, Mesh, MeshBasicMaterial } = await import('three');
  const { disposeMountedWeapon } = await import('../src/render/weapon-mount');
  const model = new Group(), hand = new Bone(); hand.name = 'mixamorigRightHand'; model.add(hand);
  const source = new Group(), geometry = new BufferGeometry(), material = new MeshBasicMaterial();
  source.add(new Mesh(geometry, material));
  const mount = mountWeapon(model, source, 'rifle')!;
  const flash = model.getObjectByName('muzzleFlash')!;
  expect(flash.visible).toBe(false);
  expect(flash.position.x).toBeLessThan(-0.9);
  let destroyed = false;
  geometry.addEventListener('dispose', () => { destroyed = true; });
  disposeMountedWeapon(model);
  expect(model.getObjectByName('muzzleFlash')).toBeUndefined();
  expect(destroyed).toBe(false);
  mount.removeFromParent();
  geometry.dispose(); material.dispose();
});

it('fait suivre le poignet pendant le rechargement avec des transitions bornées', async () => {
  const { reloadHandWeight } = await import('../src/render/weapon-mount');
  expect(reloadHandWeight(2.2, 2.2)).toBe(0);
  expect(reloadHandWeight(1.1, 2.2)).toBe(1);
  expect(reloadHandWeight(0.09, 2.2)).toBeCloseTo(0.5);
  expect(reloadHandWeight(0, 2.2)).toBe(0);
  const model = new Group(), hand = new Bone(); hand.name = 'mixamorigRightHand'; model.add(hand);
  const mount = mountWeapon(model, new Group(), 'rifle')!;
  const grip = new Quaternion().fromArray(mount.userData.gripRotation);
  hand.rotation.set(0.8, 0.3, 0.2);
  stabilizeFirearm(model, 1);
  expect(mount.quaternion.angleTo(grip)).toBeLessThan(0.0001);
  stabilizeFirearm(model, 0);
  expect(mount.quaternion.angleTo(grip)).toBeGreaterThan(0.1);
});

it('dimensionne les armes selon les proportions du soldat et conserve le point de prise', async () => {
  const { WEAPON_DISPLAY } = await import('../src/render/weapon-mount');
  const io = new NodeIO();
  const model = new Group(), hand = new Bone(); hand.name = 'mixamorigRightHand'; model.add(hand);
  const lengths: Record<string, number> = {};
  for (const type of ['pistol', 'rifle', 'blade'] as const) {
    const bytes = await readFile(new URL(`../src/assets/weapons/${type}.glb`, import.meta.url));
    const doc = await io.readBinary(bytes);
    const pos = doc.getRoot().listMeshes()[0]!.listPrimitives()[0]!.getAttribute('POSITION')!.getArray()!;
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < pos.length; i += 3) {
      const along = type === 'blade' ? (-pos[i]! - pos[i + 1]!) / Math.SQRT2 : -pos[i]!;
      min = Math.min(min, along); max = Math.max(max, along);
    }
    lengths[type] = (max - min) * WEAPON_DISPLAY[type].scale;
    const source = new Group();
    const mount = mountWeapon(model, source, type)!;
    const object = mount.children[0]!;
    const config = WEAPON_DISPLAY[type];
    expect(object.scale.x).toBe(config.scale);
    for (let axis = 0; axis < 3; axis++) expect(object.position.getComponent(axis) + config.grip[axis]! * config.scale).toBeCloseTo(0);
    expect(config.fpsScale).toBeGreaterThan(0);
    mount.removeFromParent();
  }
  // Le Meshy mesure 1,70 m avant conversion dans les unités de la scène.
  expect(lengths.pistol).toBeGreaterThan(0.18); expect(lengths.pistol).toBeLessThan(0.28);
  expect(lengths.rifle).toBeGreaterThan(0.75); expect(lengths.rifle).toBeLessThan(1.05);
  expect(lengths.blade).toBeGreaterThan(0.7); expect(lengths.blade).toBeLessThan(1.05);
});
