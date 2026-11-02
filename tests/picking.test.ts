import { describe, expect, it } from 'vitest';
import { createSimulation } from '../src/sim/simulation';
import { ENDLESS_CARREFOUR } from '../src/data/maps/endless-carrefour';
import { Camera } from '../src/render/camera';
import { pickSoldier3d } from '../src/render/picking';

describe('sélection 3D', () => {
  it('permet de viser le corps de la créature agrandie', () => {
    const state = createSimulation({seed: 1, map: ENDLESS_CARREFOUR});
    const creature = state.units.find(unit => unit.defId === 'creature')!;
    const camera = new Camera(1280, 720); camera.centerOn(creature.x, creature.y);
    const point = camera.worldToScreen(creature.x, creature.y);
    expect(pickSoldier3d([creature], camera, point.x + 35, point.y - 70)).toBe(creature);
    expect(pickSoldier3d([creature], camera, point.x + 50, point.y - 70)).toBeNull();
  });
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
