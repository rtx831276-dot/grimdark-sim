import { Group, Mesh, MeshBasicMaterial, Object3D, OctahedronGeometry, Quaternion, Vector3 } from 'three';

export type HeldWeapon = 'pistol' | 'rifle' | 'blade';

/** Fixation cosmétique au poignet, ajustée sur la pose de repos du rig Meshy. */
export function mountWeapon(model: Object3D, source: Object3D, type: HeldWeapon): Group | null {
  const hand = model.getObjectByName('mixamorigRightHand');
  if (!hand) return null;
  model.updateWorldMatrix(true, true);
  const modelRotation = model.getWorldQuaternion(new Quaternion());
  const handRotation = hand.getWorldQuaternion(new Quaternion());
  const mount = new Group();
  mount.name = 'heldWeapon';
  hand.add(mount);
  const object = source.clone(true);
  const scale = type === 'pistol' ? 0.23 : type === 'rifle' ? 0.64 : 0.48;
  const grip = type === 'pistol' ? new Vector3(0.69, -0.22, 0) : type === 'rifle' ? new Vector3(0.25, -0.15, 0) : new Vector3(0.76, 0.78, 0);
  object.scale.setScalar(scale);
  object.position.copy(grip).multiplyScalar(-scale);
  mount.add(object);
  if (type !== 'blade') {
    // Repères mesurés dans les meshes d'origine ; aucun impact sur le calcul des tirs.
    const flash = new Mesh(new OctahedronGeometry(type === 'pistol' ? 0.35 : 0.16),
      new MeshBasicMaterial({ color: 0xffd286 }));
    flash.name = 'muzzleFlash';
    flash.userData.ownedMuzzleFlash = true;
    flash.position.set(-1.01, type === 'pistol' ? 0.44 : 0.105, 0);
    flash.scale.set(1.8, 0.65, 0.65);
    flash.visible = false;
    object.add(flash);
  }
  const sourceForward = type === 'blade' ? new Vector3(-1, -1, 0).normalize() : new Vector3(-1, 0, 0);
  const desiredForward = type === 'blade' ? new Vector3(0, 0.3, 1).normalize() : new Vector3(0, 0, 1);
  const align = new Quaternion().setFromUnitVectors(sourceForward, desiredForward);
  mount.quaternion.copy(handRotation.invert().multiply(modelRotation).multiply(align));
  if (type !== 'blade') {
    mount.userData.aimAlignment = align.toArray();
    mount.userData.gripRotation = mount.quaternion.toArray();
  }
  return mount;
}

/** Poids de la prise animée, fondu au début et à la fin du rechargement. */
export function reloadHandWeight(remaining: number, duration: number): number {
  if (duration <= 0 || remaining <= 0) return 0;
  const elapsed = duration - remaining;
  return Math.max(0, Math.min(1, elapsed / 0.18, remaining / 0.18));
}

/** Conserve le canon vers l'avant, ou suit la main pendant le rechargement. */
export function stabilizeFirearm(model: Object3D, followHand = 0): void {
  const mount = model.getObjectByName('heldWeapon');
  if (!mount?.parent || !Array.isArray(mount.userData.aimAlignment)) return;
  model.updateWorldMatrix(true, true);
  const modelRotation = model.getWorldQuaternion(new Quaternion());
  const handRotation = mount.parent.getWorldQuaternion(new Quaternion());
  const align = new Quaternion().fromArray(mount.userData.aimAlignment);
  mount.quaternion.copy(handRotation.invert().multiply(modelRotation).multiply(align));
  if (followHand > 0 && Array.isArray(mount.userData.gripRotation)) {
    mount.quaternion.slerp(new Quaternion().fromArray(mount.userData.gripRotation), Math.min(1, followHand));
  }
}

/** Ne libère que l'effet propre au porteur, jamais les géométries GLB partagées. */
export function disposeMountedWeapon(model: Object3D): void {
  const flash = model.getObjectByName('muzzleFlash');
  if (flash instanceof Mesh && flash.userData.ownedMuzzleFlash) {
    flash.geometry.dispose();
    if (Array.isArray(flash.material)) flash.material.forEach(material => material.dispose());
    else flash.material.dispose();
    flash.removeFromParent();
  }
}
