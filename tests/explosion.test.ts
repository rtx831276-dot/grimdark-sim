import { describe, expect, it } from 'vitest';
import { weapon } from '../src/data/weapons';
import { detonate } from '../src/sim/explosion';
import { isSolid, tileAtFloor } from '../src/sim/map';
import { createSimulation } from '../src/sim/simulation';
import type { SimState, Unit } from '../src/sim/types';
import { TEST_MAP } from './fixtures/test-map';

function setUp(seed = 31): SimState {
  return createSimulation({ seed, map: TEST_MAP });
}

function park(unit: Unit, x: number, y: number): void {
  unit.x = x;
  unit.y = y;
  unit.prevX = x;
  unit.prevY = y;
  unit.path = [];
  unit.pathIndex = 0;
  unit.state = 'idle';
}

describe('détonation', () => {
  it('un barrage d artillerie fait tomber un mur en gravats praticables', () => {
    const state = setUp();
    const owner = state.units.find((unit) => unit.faction === 'marteau')!;
    expect(isSolid(state.map, 2, 1)).toBe(true);

    detonate(state, 2.5, 1.5, weapon('artillery_barrage'), 'marteau', owner.id);

    expect(isSolid(state.map, 2, 1)).toBe(false);
    expect(tileAtFloor(state.map, 2, 1)?.terrain).toBe('rubble');
    expect(state.stats.tilesDestroyed).toBeGreaterThan(0);
    expect(state.events.some((event) => event.type === 'terrainDestroyed')).toBe(true);
  });

  it('retourne le sol nu en cratère : le champ de bataille se dégrade', () => {
    const state = setUp();
    const owner = state.units.find((unit) => unit.faction === 'marteau')!;
    expect(tileAtFloor(state.map, 5, 6)?.terrain).toBe('mud');

    detonate(state, 5.5, 6.5, weapon('artillery_barrage'), 'marteau', owner.id);

    expect(tileAtFloor(state.map, 5, 6)?.terrain).toBe('crater');
  });

  it('blesse, supprime et démoralise toutes les unités de la zone, amies comprises', () => {
    const state = setUp();
    const enemy = state.units.find((unit) => unit.faction === 'penitents' && unit.defId === 'fusilier')!;
    const friend = state.units.find((unit) => unit.faction === 'marteau' && unit.defId === 'fusilier')!;
    const owner = state.units.find((unit) => unit.faction === 'marteau')!;
    park(enemy, 5.5, 3.5);
    park(friend, 6.0, 3.5);
    const enemyHp = enemy.hp;
    const friendHp = friend.hp;
    const enemyMorale = enemy.morale;

    detonate(state, 5.5, 3.5, weapon('grenade_frag'), 'marteau', owner.id);

    expect(enemy.hp).toBeLessThan(enemyHp);
    expect(friend.hp).toBeLessThan(friendHp);
    expect(enemy.suppression).toBeGreaterThan(0);
    expect(enemy.morale).toBeLessThan(enemyMorale);
    expect(state.events.some((event) => event.type === 'explosion')).toBe(true);
  });

  it('une grenade bien placée tue une unité déjà entamée', () => {
    const state = setUp();
    const owner = state.units.find((unit) => unit.faction === 'marteau')!;
    const victim = state.units.find((unit) => unit.faction === 'penitents' && unit.defId === 'fusilier')!;
    victim.hp = 12;
    park(victim, 5.5, 3.5);

    detonate(state, 5.5, 3.5, weapon('grenade_frag'), 'marteau', owner.id);

    expect(victim.alive).toBe(false);
    expect(state.factions.penitents?.casualties).toBe(1);
  });
});
