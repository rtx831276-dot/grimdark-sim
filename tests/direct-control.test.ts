import { describe, expect, it } from 'vitest';
import { ENDLESS_CARREFOUR } from '../src/data/maps/endless-carrefour';
import { createSimulation, stepSimulation, targetInSight, updateDirectControl, type DirectControl } from '../src/sim';
import { TERRAIN } from '../src/data/terrain';

function setup() {
  const state = createSimulation({ seed: 1, map: ENDLESS_CARREFOUR });
  const player = state.units.find(u => u.defId === 'modern_rifleman')!;
  const enemy = state.units.find(u => u.faction !== player.faction)!;
  for (const u of state.units) if (u !== player && u !== enemy) u.alive = false;
  Object.assign(player, { x: 5.5, y: 17.5, prevX: 5.5, prevY: 17.5, cooldown: 0 });
  Object.assign(enemy, { x: 10.5, y: 17.5, prevX: 10.5, prevY: 17.5 });
  const input: DirectControl = { unitId: player.id, yaw: 0, pitch: 0, forward: 0, strafe: 0, fire: false, reload: false };
  return { state, player, enemy, input };
}

describe('contrôle direct FPS', () => {
  it('avance dans la direction de la caméra, borne la vitesse diagonale et respecte les murs', () => {
    const a = setup();
    updateDirectControl(a.state, { ...a.input, forward: 1 }, .1);
    expect(a.player.x).toBeCloseTo(5.72);
    const b = setup();
    updateDirectControl(b.state, { ...b.input, forward: 1, strafe: 1 }, .1);
    expect(Math.hypot(b.player.x - 5.5, b.player.y - 17.5)).toBeCloseTo(.22);
    const wall = a.state.map.tiles[17 * a.state.map.width + 6]!;
    wall.terrain = 'wall'; wall.hp = TERRAIN.wall.hp;
    for (let i = 0; i < 20; i++) updateDirectControl(a.state, { ...a.input, forward: 1 }, .1);
    expect(a.player.x).toBeLessThanOrEqual(5.81);
  });
  it('ne vise que dans le viseur, à portée et sans traverser les murs', () => {
    const { state, player, enemy } = setup();
    expect(targetInSight(state, player, 0, 0, 13)).toBe(enemy);
    expect(targetInSight(state, player, .2, 0, 13)).toBeNull();
    expect(targetInSight(state, player, 0, -.3, 13)).toBeNull();
    expect(targetInSight(state, player, 0, 0, 3)).toBeNull();
    state.map.tiles[17 * state.map.width + 8]!.terrain = 'wall';
    expect(targetInSight(state, player, 0, 0, 13)).toBeNull();
  });
  it('tire avec la cadence du jeu et peut aussi tirer dans le vide', () => {
    const { state, player, input } = setup();
    updateDirectControl(state, { ...input, fire: true }, .1);
    expect(player.shotsFired).toBe(3);
    expect(player.salvosLeft).toBe(9);
    expect(state.events.some(e => e.type === 'shot' && e.targetId)).toBe(true);
    updateDirectControl(state, { ...input, fire: true }, .1);
    expect(player.shotsFired).toBe(3);
    player.cooldown = 0; state.events.length = 0;
    updateDirectControl(state, { ...input, yaw: .6, fire: true }, .1);
    expect(player.shotsFired).toBe(6);
    expect(state.events.find(e => e.type === 'shot')?.targetId).toBeUndefined();
  });
  it('ne tire pas à travers un allié et recharge avec la durée normale', () => {
    const { state, player, enemy, input } = setup();
    enemy.faction = player.faction;
    const hp = enemy.hp;
    updateDirectControl(state, { ...input, fire: true }, .1);
    expect(enemy.hp).toBe(hp);
    player.cooldown = 0;
    updateDirectControl(state, { ...input, reload: true }, .1);
    expect(player.reloading).toBe(true);
    expect(player.cooldown).toBe(2.2);
    expect(player.salvosLeft).toBe(10);
  });
  it('suspend l’IA du soldat contrôlé sans empêcher le reste de la simulation', () => {
    const { state, player, input } = setup();
    stepSimulation(state, .1, input);
    expect(player.x).toBeCloseTo(5.5);
    expect(player.y).toBeCloseTo(17.5);
    expect(player.intent).toBe('contrôle direct');
    expect(state.tick).toBe(1);
  });
});

it('peut commencer la recharge immédiatement après une salve, même pendant le délai de tir', () => {
  const { state, player, input } = setup();
  updateDirectControl(state, { ...input, fire: true }, .1);
  expect(player.cooldown).toBeGreaterThan(0);
  expect(player.salvosLeft).toBe(9);
  updateDirectControl(state, { ...input, reload: true, fire: true }, .1);
  expect(player.reloading).toBe(true);
  expect(player.cooldown).toBe(2.2);
  expect(player.salvosLeft).toBe(10);
  expect(player.shotsFired).toBe(3);
  updateDirectControl(state, { ...input, fire: true }, .1);
  expect(player.shotsFired).toBe(3);
});

it('ne recharge ni un chargeur plein ni un soldat démoralisé', () => {
  const { state, player, input } = setup();
  updateDirectControl(state, { ...input, reload: true }, .1);
  expect(player.reloading).toBe(false);
  player.salvosLeft = 5;
  player.state = 'broken';
  updateDirectControl(state, { ...input, reload: true }, .1);
  expect(player.reloading).toBe(false);
  expect(player.salvosLeft).toBe(5);
});
