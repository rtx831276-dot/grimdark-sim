// Ajoute des animations GLB sur le rig Meshy optimisé sans recopier les meshes/textures.
// Usage : node scripts/import-meshy-animations.mjs src/assets/soldier/soldier-combat.glb fichier1.glb ...
// Les fichiers sources doivent utiliser le même squelette. Les clips déjà présents sont conservés.
import { NodeIO } from '@gltf-transform/core';

const [destination, ...sources] = process.argv.slice(2);
if (!destination || !sources.length) throw new Error('Usage: node scripts/import-meshy-animations.mjs destination.glb source1.glb ...');
const io = new NodeIO();
const doc = await io.read(destination);
const root = doc.getRoot();
const buffer = root.listBuffers()[0];
if (!buffer) throw new Error('Le modèle cible ne possède pas de buffer.');
const targetNodes = new Map(root.listNodes().map(node => [node.getName(), node]));
const known = new Set(root.listAnimations().map(animation => animation.getName()));
let added = 0;
for (const file of sources) {
  const source = await io.read(file);
  for (const animation of source.getRoot().listAnimations()) {
    if (known.has(animation.getName())) continue;
    for (const channel of animation.listChannels()) {
      const name = channel.getTargetNode()?.getName();
      if (!name || !targetNodes.has(name)) throw new Error(`Os cible manquant : ${name} (${file}, ${animation.getName()})`);
    }
    const output = doc.createAnimation(animation.getName());
    // Chaque sampler est recopié indépendamment pour que le filtrage de translation
    // ne modifie jamais un autre clip ni l'objet source.
    for (const channel of animation.listChannels()) {
      const srcSampler = channel.getSampler();
      if (!srcSampler) throw new Error(`Sampler manquant pour ${animation.getName()}`);
      const copyAccessor = (input) => {
        if (!input?.getArray()) throw new Error(`Courbe manquante pour ${animation.getName()}`);
        return doc.createAccessor().setBuffer(buffer).setType(input.getType()).setArray(input.getArray().slice()).setNormalized(input.getNormalized());
      };
      const input = copyAccessor(srcSampler.getInput());
      const values = copyAccessor(srcSampler.getOutput());
      // Le moteur tactique gère le déplacement horizontal. On conserve la hauteur.
      if (channel.getTargetNode()?.getName() === 'mixamorig:Hips' && channel.getTargetPath() === 'translation') {
        const array = values.getArray();
        if (srcSampler.getInterpolation() === 'CUBICSPLINE') {
          // Chaque clé contient tangente entrante, valeur et tangente sortante.
          const x = array[3], z = array[5];
          for (let i = 0; i < array.length; i += 9) {
            array[i] = array[i + 2] = array[i + 6] = array[i + 8] = 0;
            array[i + 3] = x; array[i + 5] = z;
          }
        } else {
          const x = array[0], z = array[2];
          for (let i = 0; i < array.length; i += 3) { array[i] = x; array[i + 2] = z; }
        }
      }
      const sampler = doc.createAnimationSampler().setInput(input).setOutput(values).setInterpolation(srcSampler.getInterpolation());
      output.addSampler(sampler);
      output.addChannel(doc.createAnimationChannel().setSampler(sampler)
        .setTargetNode(targetNodes.get(channel.getTargetNode().getName())).setTargetPath(channel.getTargetPath()));
    }
    known.add(animation.getName());
    added++;
  }
}
await io.write(destination, doc);
console.log(`${added} animations ajoutées ; ${known.size} clips au total dans ${destination}`);
