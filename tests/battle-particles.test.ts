import { describe, expect, it, vi } from 'vitest';
import { InstancedMesh, PerspectiveCamera, Scene } from 'three';
import { BattleParticles, MAX_BATTLE_PARTICLES } from '../src/render/battle-particles';
import { createSimulation, hashState } from '../src/sim';

describe('particules 3D de combat', () => {
  it('produit fumée, poussière et étincelles sans modifier la simulation ou ses événements', () => {
    const state = createSimulation({seed: 4});
    const hash = hashState(state), rng = state.rng.snapshot();
    const scene = new Scene(), fx = new BattleParticles(scene);
    const events = [{tick: 1, type: 'explosion' as const, x: 4, y: 5}];
    const before = JSON.stringify(events);
    fx.ingest(events);
    expect(fx.count).toBeGreaterThan(10);
    expect(hashState(state)).toBe(hash); expect(state.rng.snapshot()).toBe(rng);
    expect(JSON.stringify(events)).toBe(before);
    fx.dispose(); expect(scene.children).toHaveLength(0);
  });
  it('fige les particules à la pause, les oriente vers la caméra et les libère après leur durée', () => {
    const scene = new Scene(), fx = new BattleParticles(scene), camera = new PerspectiveCamera();
    fx.ingest([{tick: 0, type: 'impact', x: 2, y: 3, height: 0.8}]);
    fx.update(0, camera);
    const mesh = scene.children[0] as InstancedMesh;
    const old = mesh.instanceMatrix.array.slice();
    fx.update(0, camera);
    expect(mesh.instanceMatrix.array).toEqual(old);
    expect(mesh.count).toBe(5);
    fx.update(0.1, camera);
    expect(mesh.instanceMatrix.array).not.toEqual(old);
    for (let i = 0; i < 40; i++) fx.update(0.1, camera);
    expect(fx.count).toBe(0); expect(mesh.count).toBe(0);
    fx.dispose();
  });
  it('borne la charge et ignore les positions incorrectes ainsi que le tir FPS propre au joueur', () => {
    const scene = new Scene(), fx = new BattleParticles(scene);
    fx.ingest([{tick: 0, type: 'impact', x: NaN, y: 1}, {tick: 0, type: 'shot', x: 1, y: 1, unitId: 5}], 5);
    expect(fx.count).toBe(0);
    for (let i = 0; i < 100; i++) fx.ingest([{tick: i, type: 'explosion', x: 2, y: 2}]);
    expect(fx.count).toBe(MAX_BATTLE_PARTICLES);
    fx.clear(); expect(fx.count).toBe(0);
    const mesh = scene.children[0] as InstancedMesh;
    const gd = vi.spyOn(mesh.geometry, 'dispose'), md = vi.spyOn(mesh.material as never, 'dispose');
    fx.dispose(); expect(gd).toHaveBeenCalledOnce(); expect(md).toHaveBeenCalledOnce();
  });
});
