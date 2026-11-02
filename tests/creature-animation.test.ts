import { describe, expect, it } from 'vitest';
import { NodeIO, type Node } from '@gltf-transform/core';
import { Bone, Group, Object3D, Vector3 } from 'three';
import { CreatureAnimator } from '../src/render/creature-animation';

/** Reconstruit le vrai squelette du GLB sans WebGL ni chargement de textures. */
async function rig() {
  const document = await new NodeIO().read('src/assets/creature/creature.glb');
  const gltf = document.getRoot();
  const bones = new Set(gltf.listSkins().flatMap(skin => skin.listJoints()));
  const model = new Group();
  const add = (node: Node, parent: Object3D): void => {
    const object = bones.has(node) ? new Bone() : new Group(); object.name = node.getName();
    object.position.fromArray(node.getTranslation()); object.quaternion.fromArray(node.getRotation()); object.scale.fromArray(node.getScale());
    parent.add(object); for (const child of node.listChildren()) add(child, object);
  };
  for (const root of gltf.listScenes()[0]!.listChildren()) add(root, model);
  const body = new Group(); body.add(model);
  const unit = { alive: true, hp: 200, shotsFired: 0, x: 0, y: 0, prevX: 0, prevY: 0 };
  return { body, model, unit, animator: new CreatureAnimator(body, model, unit), clips: gltf.listAnimations(), bones };
}
const q = (model: Object3D, name: string): number[] => model.getObjectByName(name)!.quaternion.toArray();
const different = (a: number[], b: number[]): boolean => a.some((v, i) => Math.abs(v - b[i]!) > 1e-5);

describe('animation procédurale de la créature', () => {
  it('utilise le véritable rig et anime ses ailes et ses pattes en déplacement', async () => {
    const { model, unit, animator, bones, clips } = await rig();
    expect(bones.size).toBe(70); expect(clips).toHaveLength(0);
    const restWing = q(model, 'Bone_026'), restLeg = q(model, 'Bone_038');
    unit.x = .2; animator.update(unit, 7, .2);
    expect(different(restWing, q(model, 'Bone_026'))).toBe(true);
    expect(different(restLeg, q(model, 'Bone_038'))).toBe(true);
    const step = q(model, 'Bone_038'); animator.update(unit, 12, .2);
    expect(different(step, q(model, 'Bone_038'))).toBe(true);
  });
  it('redresse le torse tout en gardant les pattes arrière près de leur position initiale', async () => {
    const {model, unit, animator} = await rig();
    model.updateWorldMatrix(true, true);
    const beforeHead = model.getObjectByName('Bone_023')!.getWorldPosition(new Vector3()).y;
    const beforeFoot = model.getObjectByName('Bone_005')!.getWorldPosition(new Vector3()).y;
    animator.update(unit, 0, 0); model.updateWorldMatrix(true, true);
    const head = model.getObjectByName('Bone_023')!.getWorldPosition(new Vector3()).y;
    const foot = model.getObjectByName('Bone_005')!.getWorldPosition(new Vector3()).y;
    expect(head - beforeHead).toBeGreaterThan(.2);
    expect(Math.abs(foot - beforeFoot)).toBeLessThan(.05);
  });
  it('ajoute une attaque et une réaction à un coup sans toucher à la simulation', async () => {
    const { model, body, unit, animator } = await rig();
    animator.update(unit, 10, .1); const rest = q(model, 'Bone_024');
    unit.shotsFired++; animator.update(unit, 10, .1); animator.update(unit, 13, .1);
    expect(different(rest, q(model, 'Bone_024'))).toBe(true);
    expect(body.position.z).toBeGreaterThan(0);
    const before = JSON.stringify(unit); unit.hp -= 10; animator.update(unit, 14, .1);
    expect(JSON.stringify(unit)).toBe(before.replace('200', '190'));
    expect(body.rotation.x).toBeGreaterThan(0);
  });
  it('fige la pose en pause et fait tomber progressivement la créature morte', async () => {
    const { model, body, unit, animator } = await rig();
    unit.x = .1; animator.update(unit, 15, .2);
    const pose = q(model, 'Bone_026'), position = body.position.toArray();
    animator.update(unit, 15, 0); animator.update(unit, 15, 0);
    expect(q(model, 'Bone_026')).toEqual(pose); expect(body.position.toArray()).toEqual(position);
    unit.alive = false; unit.hp = 0; animator.update(unit, 16, .1);
    const first = body.rotation.z; animator.update(unit, 21, .1); const middle = body.rotation.z;
    animator.update(unit, 26, .1); const end = body.rotation.z;
    expect(first).toBeLessThan(middle); expect(middle).toBeLessThan(end); expect(end).toBeCloseTo(.15);
    const final = q(model, 'Bone_026'); animator.update(unit, 40, .1);
    expect(q(model, 'Bone_026')).toEqual(final);
  });
  it('accepte un modèle incomplet sans erreur', () => {
    const body = new Group(), model = new Group(); body.add(model);
    const unit = { alive: true, hp: 200, shotsFired: 0, x: 0, y: 0, prevX: 0, prevY: 0 };
    const animator = new CreatureAnimator(body, model, unit);
    expect(() => animator.update(unit, 5, .1)).not.toThrow();
  });
});
