import { Object3D, SkinnedMesh, type Skeleton } from 'three';

/** Libère les textures d'os propres aux clones, jamais les meshes et matériaux partagés. */
export function disposeVisualSkeletons(root: Object3D): void {
  const skeletons = new Set<Skeleton>();
  root.traverse(node => { if (node instanceof SkinnedMesh) skeletons.add(node.skeleton); });
  for (const skeleton of skeletons) skeleton.dispose();
}
