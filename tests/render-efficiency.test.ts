import { describe, it, expect, vi } from 'vitest';
import { Bone, BufferGeometry, Group, MeshBasicMaterial, Skeleton, SkinnedMesh } from 'three';
import { TerrainChangeTracker } from '../src/render/terrain-change';
import { disposeVisualSkeletons } from '../src/render/visual-resources';
import { createSimulation } from '../src/sim/simulation';

describe('ressources graphiques', () => {
  it('détecte uniquement les changements visibles du terrain, y compris une nouvelle carte', () => {
    const tracker = new TerrainChangeTracker();
    const a = createSimulation({seed: 1}).map;
    expect(tracker.changed(a)).toBe(true);
    expect(tracker.changed(a)).toBe(false);
    a.tiles[0]!.hp -= 1;
    expect(tracker.changed(a)).toBe(false);
    a.tiles[0]!.terrain = a.tiles[0]!.terrain === 'wall' ? 'road' : 'wall';
    expect(tracker.changed(a)).toBe(true);
    expect(tracker.changed(a)).toBe(false);
    expect(tracker.changed(createSimulation({seed: 1}).map)).toBe(true);
  });
  it('libère chaque squelette une fois sans détruire la géométrie et le matériau partagés', () => {
    const geometry = new BufferGeometry(), material = new MeshBasicMaterial();
    const root = new Group(), skeleton = new Skeleton([new Bone()]);
    const first = new SkinnedMesh(geometry, material), second = new SkinnedMesh(geometry, material);
    first.bind(skeleton); second.bind(skeleton); root.add(first, second);
    const skeletonDispose = vi.spyOn(skeleton, 'dispose');
    const geometryDispose = vi.spyOn(geometry, 'dispose');
    const materialDispose = vi.spyOn(material, 'dispose');
    disposeVisualSkeletons(root);
    expect(skeletonDispose).toHaveBeenCalledTimes(1);
    expect(geometryDispose).not.toHaveBeenCalled();
    expect(materialDispose).not.toHaveBeenCalled();
    geometry.dispose(); material.dispose();
  });
});
