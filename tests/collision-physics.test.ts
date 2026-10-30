import { describe, expect, it } from 'vitest';
import { ENDLESS_CARREFOUR } from '../src/data/maps/endless-carrefour';
import { weapon } from '../src/data/weapons';
import { createSimulation, detonate, moveWithTerrain, separateUnits, segmentClearOfTerrain, terrainPenetration } from '../src/sim';

function setup() {
  const state = createSimulation({ map: ENDLESS_CARREFOUR, seed: 55 });
  state.map.tiles.forEach(tile => { tile.terrain = 'road'; tile.hp = 0; tile.maxHp = 0; });
  state.map.tiles[5 * state.map.width + 6]!.terrain = 'wall';
  const a = state.units[0]!, b = state.units[1]!;
  for (const unit of state.units) if (unit !== a && unit !== b) unit.alive = false;
  return { state, a, b };
}

describe('collisions de terrain', () => {
  it('arrête les déplacements rapides avant le mur et glisse le long de sa surface', () => {
    const { state } = setup();
    const hit = moveWithTerrain(state.map, 5.5, 5.5, 3, 0);
    expect(hit.x).toBeLessThanOrEqual(5.81 + 1e-7);
    expect(terrainPenetration(state.map, hit.x, hit.y)).toBeLessThan(1e-7);
    const slide = moveWithTerrain(state.map, 5.5, 5.5, .6, .3);
    expect(slide.x).toBeLessThanOrEqual(5.81 + 1e-7);
    expect(slide.y).toBeGreaterThan(5.75);
  });
  it('respecte les coins et les limites de la carte', () => {
    const { state } = setup();
    expect(segmentClearOfTerrain(state.map, { x: 5.5, y: 4.9 }, { x: 6.5, y: 4.9 })).toBe(false);
    const edge = moveWithTerrain(state.map, .5, .5, -2, 0);
    expect(edge.x).toBeGreaterThanOrEqual(.19 - 1e-7);
  });
  it('permet de sortir si une unité se retrouve déjà partiellement dans un mur', () => {
    const { state } = setup();
    const before = terrainPenetration(state.map, 6.1, 5.5);
    const pos = moveWithTerrain(state.map, 6.1, 5.5, -.5, 0);
    expect(terrainPenetration(state.map, pos.x, pos.y)).toBeLessThan(before);
    expect(pos.x).toBeLessThan(6.1);
  });
  it('écarte les unités sans les pousser dans le décor', () => {
    const { state, a, b } = setup();
    Object.assign(a, { x: 5.8, y: 5.5 }); Object.assign(b, { x: 5.4, y: 5.5 });
    separateUnits(state, .1);
    expect(terrainPenetration(state.map, a.x, a.y)).toBeLessThan(1e-7);
    expect(terrainPenetration(state.map, b.x, b.y)).toBeLessThan(1e-7);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(.6);
    // Une superposition exacte ne doit pas créer de poussée diagonale disproportionnée.
    Object.assign(a, { x: 3.5, y: 3.5 }); Object.assign(b, { x: 3.5, y: 3.5 });
    separateUnits(state, .1);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeCloseTo(.62);
  });
});

describe('projection après explosion', () => {
  it('projette depuis le centre de la grenade, indépendamment de la position du lanceur', () => {
    const { state, a: victim, b: thrower } = setup();
    Object.assign(victim, { x: 6.5, y: 5.5, hp: 1 });
    Object.assign(thrower, { x: 9.5, y: 5.5 });
    detonate(state, 6, 5.5, weapon('grenade_frag'), thrower.faction, thrower.id);
    expect(victim.alive).toBe(false);
    expect(victim.deathImpulse!.x).toBeGreaterThan(1);
    expect(victim.deathImpulse!.y).toBeCloseTo(0);
    expect(victim.deathImpulse!.lift).toBeGreaterThan(.25);
    expect(victim.deathImpulse!.lift).toBeLessThanOrEqual(.9);
  });
});
