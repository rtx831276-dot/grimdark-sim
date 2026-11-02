// Reconstruit la géométrie avec ses UV depuis le GLB Meshy d'origine, sans toucher
// aux 88 animations du GLB de combat. Usage : node scripts/restore-soldier-mesh.mjs source.glb
// La source utilisée ici est « Meshy_AI_Last_Stand_in_Neon_Ru_All_Animations (5).glb ».
import { NodeIO } from '@gltf-transform/core';
import { MeshoptSimplifier } from 'meshoptimizer';

const sourcePath = process.argv[2];
if (!sourcePath) throw new Error('Indiquer le GLB Meshy source.');
const destination = 'src/assets/soldier/soldier-combat.glb';
const io = new NodeIO();
const [source, target] = await Promise.all([io.read(sourcePath), io.read(destination)]);
const sourceRoot = source.getRoot(), root = target.getRoot();
const src = sourceRoot.listMeshes()[0]?.listPrimitives()[0];
const dst = root.listMeshes()[0]?.listPrimitives()[0];
const a = sourceRoot.listSkins()[0], b = root.listSkins()[0];
if (!src || !dst || !a || !b || sourceRoot.listMeshes().length !== 1 || root.listMeshes().length !== 1) throw new Error('Géométrie ou squelette inattendu.');
const jointsA = a.listJoints(), jointsB = b.listJoints();
const equal = (x, y) => x.length === y.length && Array.from(x).every((value, i) => Math.abs(value - y[i]) < 1e-5);
if (jointsA.length !== jointsB.length || jointsA.some((joint, i) => joint.getName() !== jointsB[i].getName() ||
  !equal(joint.getTranslation(), jointsB[i].getTranslation()) || !equal(joint.getRotation(), jointsB[i].getRotation()) ||
  !equal(joint.getScale(), jointsB[i].getScale())) ||
  !equal(a.getInverseBindMatrices().getArray(), b.getInverseBindMatrices().getArray())) throw new Error('Le squelette source ne correspond pas au modèle de combat.');
const names = ['POSITION', 'NORMAL', 'TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0'];
for (const name of names) if (!src.getAttribute(name)?.getArray()) throw new Error(`Attribut manquant dans la source : ${name}`);
const positions = src.getAttribute('POSITION').getArray(), normals = src.getAttribute('NORMAL').getArray(), uv = src.getAttribute('TEXCOORD_0').getArray();
const count = positions.length / 3;
const attributes = new Float32Array(count * 5);
for (let i = 0; i < count; i++) { attributes.set(normals.subarray(i * 3, i * 3 + 3), i * 5); attributes.set(uv.subarray(i * 2, i * 2 + 2), i * 5 + 3); }
await MeshoptSimplifier.ready;
// Utiliser les indices d'origine : les coutures UV restent séparées. La forme,
// les normales et les UV contribuent toutes à la qualité de simplification.
const [indices, error] = MeshoptSimplifier.simplifyWithAttributes(new Uint32Array(src.getIndices().getArray()), positions, 3,
  attributes, 5, [0.3, 0.3, 0.3, 1, 1], null, 8206 * 3, 0.02, ['Regularize']);
const [remap, vertices] = MeshoptSimplifier.compactMesh(indices); // réécrit les indices
const buffer = root.listBuffers()[0];
if (!buffer || vertices > 65535 || indices.length > 36000) throw new Error('Géométrie optimisée inattendue.');
const obsolete = [dst.getIndices(), ...dst.listAttributes()];
for (const semantic of dst.listSemantics()) dst.setAttribute(semantic, null);
for (const name of names) {
  const attribute = src.getAttribute(name), array = attribute.getArray(), size = attribute.getElementSize();
  const compact = new array.constructor(vertices * size);
  for (let old = 0; old < remap.length; old++) if (remap[old] !== 0xffffffff) {
    for (let k = 0; k < size; k++) compact[remap[old] * size + k] = array[old * size + k];
  }
  dst.setAttribute(name, target.createAccessor().setBuffer(buffer).setType(attribute.getType()).setNormalized(attribute.getNormalized()).setArray(compact));
}
dst.setIndices(target.createAccessor().setBuffer(buffer).setType('SCALAR').setArray(new Uint16Array(indices)));
for (const accessor of obsolete) accessor?.dispose();
await io.write(destination, target);
console.log(`${vertices} sommets, ${indices.length / 3} triangles avec UV ; erreur ${error.toFixed(5)}, ${root.listAnimations().length} animations conservées.`);
