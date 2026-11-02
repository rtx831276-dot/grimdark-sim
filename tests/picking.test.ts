import { describe, expect, it } from 'vitest';
import { createSimulation } from '../src/sim/simulation';
import { Camera } from '../src/render/camera';
import { pickSoldier3d } from '../src/render/picking';

describe('sélection 3D', () => {
  it('détecte le corps projeté et ignore les unités mortes', () => {
    const state = createSimulation({ seed: 1 });
    const unit = state.units[0]!;
    const camera = new Camera(1280, 720);
    camera.centerOn(unit.x, unit.y);
    const point = camera.worldToScreen(unit.x, unit.y);
    expect(pickSoldier3d([unit], camera, point.x, point.y - 20)).toBe(unit);
    expect(pickSoldier3d([unit], camera, point.x + 40, point.y - 20)).toBeNull();
    unit.alive = false;
    expect(pickSoldier3d([unit], camera, point.x, point.y - 20)).toBeNull();
  });
});
