import { describe, expect, it } from 'vitest';
import { ENDLESS_CARREFOUR } from '../src/data/maps/endless-carrefour';
import { advanceGrenade, createGrenadeMotion, createSimulation, stepSimulation, useGrenade, type Projectile } from '../src/sim';

function setup() {
  const state = createSimulation({ map: ENDLESS_CARREFOUR, seed: 144 });
  state.map.tiles.forEach(tile => { tile.terrain = 'road'; tile.hp = 0; tile.maxHp = 0; });
  return state;
}
function grenade(fromX = 4.5, toX = 12.5): Projectile {
  const y = 8.5, flightTicks = 13;
  return { id: 1, faction: 'penitents', ownerId: 1, weaponId: 'grenade_frag', kind: 'grenade',
    fromX, fromY: y, x: fromX, y, tx: toX, ty: y, flightTicks, impactTick: flightTicks,
    grenadeMotion: createGrenadeMotion(fromX, y, toX, y, flightTicks / 10) };
}

describe('physique de grenade', () => {
  it('suit une trajectoire sous gravité et rejoint la cible en terrain libre', () => {
    const state = setup(), p = grenade();
    let max = 0;
    for (let i = 0; i < 13; i++) { advanceGrenade(state.map, p, .1); max = Math.max(max, p.grenadeMotion!.height); }
    expect(max).toBeGreaterThan(2);
    expect(p.x).toBeCloseTo(p.tx, 4);
    expect(p.grenadeMotion!.height).toBeGreaterThanOrEqual(.06 - 1e-8);
    expect(p.grenadeMotion!.height).toBeLessThan(.1);
  });
  it('passe au-dessus d’un mur bas au milieu de l’arc', () => {
    const state = setup(), p = grenade();
    state.map.tiles[8 * state.map.width + 8]!.terrain = 'wall';
    for (let i = 0; i < 13; i++) advanceGrenade(state.map, p, .1);
    expect(p.x).toBeGreaterThan(12.3);
  });
  it('rebondit sur une tour trop haute au lieu de la traverser', () => {
    const state = setup(), p = grenade();
    state.map.tiles[8 * state.map.width + 8]!.terrain = 'tower';
    let reflected = false;
    for (let i = 0; i < 13; i++) {
      advanceGrenade(state.map, p, .1);
      expect(p.x).toBeLessThan(8.02);
      reflected ||= p.grenadeMotion!.velocityX < 0;
      expect(Number.isFinite(p.grenadeMotion!.height)).toBe(true);
    }
    expect(reflected).toBe(true);
    expect(p.grenadeMotion!.bounces).toBeGreaterThan(0);
  });
  it('rebondit sur le sol avec un amortissement et reste dans les limites', () => {
    const state = setup(), p = grenade(4.5, 12.5);
    for (let i = 0; i < 25; i++) advanceGrenade(state.map, p, .1);
    expect(p.grenadeMotion!.bounces).toBeGreaterThan(0);
    expect(p.grenadeMotion!.height).toBeGreaterThanOrEqual(.06 - 1e-8);
    expect(p.x).toBeLessThan(state.map.width);
  });
  it('explose au point réel après un rebond et préserve la durée de la mèche', () => {
    const state = setup(), p = grenade();
    state.map.tiles[8 * state.map.width + 8]!.terrain = 'tower';
    state.projectiles.push(p);
    let explosion;
    for (let i = 0; i < 13; i++) {
      const events = stepSimulation(state);
      if (i < 12) expect(events.some(e => e.type === 'explosion')).toBe(false);
      explosion = events.find(e => e.type === 'explosion');
    }
    expect(explosion?.x).toBeCloseTo(p.x);
    expect(explosion!.x!).toBeLessThan(8);
    expect(state.projectiles).toHaveLength(0);
  });
  it('refuse une cible invalide sans consommer de charge', () => {
    const state = setup();
    const unit = state.units.find(u => u.defId === 'modern_grenadier')!;
    const before = unit.abilities.grenade!.charges;
    expect(useGrenade(state, unit, NaN, 5)).toBe(false);
    expect(useGrenade(state, unit, -1, 5)).toBe(false);
    expect(unit.abilities.grenade!.charges).toBe(before);
    expect(state.projectiles).toHaveLength(0);
  });
});

it('les trajectoires et explosions sont reproductibles pour une même graine', async () => {
  const { hashState } = await import('../src/sim');
  const a = setup(), b = setup();
  const ua = a.units.find(u => u.defId === 'modern_grenadier')!;
  const ub = b.units.find(u => u.defId === 'modern_grenadier')!;
  Object.assign(ua, { x: 4.5, y: 8.5 }); Object.assign(ub, { x: 4.5, y: 8.5 });
  a.map.tiles[8 * a.map.width + 8]!.terrain = 'tower';
  b.map.tiles[8 * b.map.width + 8]!.terrain = 'tower';
  expect(useGrenade(a, ua, 12.5, 8.5)).toBe(true);
  expect(useGrenade(b, ub, 12.5, 8.5)).toBe(true);
  for (let i = 0; i < 15; i++) {
    expect(stepSimulation(a)).toEqual(stepSimulation(b));
    expect(hashState(a)).toBe(hashState(b));
  }
});
