import { describe, expect, it, vi } from 'vitest';
import { InstancedMesh, Matrix4, Scene, Vector3 } from 'three';
import { UnitShadows } from '../src/render/unit-shadows';
import { createSimulation } from '../src/sim';

describe('ombres de contact', () => {
  it('suit les unités interpolées, exclut les morts et le joueur FPS, et libère ses ressources', () => {
    const state = createSimulation({seed: 5}), scene = new Scene(), shadows = new UnitShadows(scene);
    const u = state.units[0]!; Object.assign(u, {x: 2, y: 4, prevX: 0, prevY: 2});
    for (const other of state.units.slice(1)) other.alive = false;
    shadows.update(state.units, .5);
    const mesh = scene.children[0] as InstancedMesh;
    expect(mesh.count).toBe(1);
    const matrix = new Matrix4(); mesh.getMatrixAt(0, matrix);
    const position = new Vector3().setFromMatrixPosition(matrix);
    expect(position.x).toBeCloseTo(1); expect(position.z).toBeCloseTo(3);
    shadows.update(state.units, 1, u.id); expect(mesh.count).toBe(0);
    const geometry = vi.spyOn(mesh.geometry, 'dispose');
    shadows.dispose(); expect(geometry).toHaveBeenCalledOnce(); expect(scene.children).toHaveLength(0);
  });
});
