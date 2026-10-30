import { describe, expect, it } from 'vitest';
import { OPERATION_CARREFOUR } from '../src/data/maps/operation-carrefour';
import { createSimulation, fireSalvo, issueOrder, updateMeleeAttacks, updateMeleeDodges } from '../src/sim';
import { updateSoldier } from '../src/sim/ai/soldierAI';

function scene() {
  const state = createSimulation({ seed: 7, map: OPERATION_CARREFOUR });
  const attacker = state.units.find(u => u.faction === 'penitents')!;
  const defender = state.units.find(u => u.faction === 'marteau')!;
  for (const u of state.units) if (u !== attacker && u !== defender) u.alive = false;
  Object.assign(attacker, { x: 15.5, y: 17.5, cooldown: 0, shotsFired: 0, goal: null, state: 'idle', stance: 'advance' });
  Object.assign(defender, { x: 16.5, y: 17.5, cooldown: 0, goal: null, state: 'idle', stance: 'advance', nextDodgeTick: 0 });
  return { state, attacker, defender };
}

describe('esquives de mêlée', () => {
  it('déplace latéralement le défenseur et peut réellement sortir de la hitbox', () => {
    const { state, attacker, defender } = scene();
    fireSalvo(state, attacker, defender);
    const attack = attacker.meleeAttack!;
    const hp = defender.hp, y = defender.y;
    updateMeleeDodges(state);
    expect(defender.meleeDodge).not.toBeNull();
    expect(defender.y).not.toBe(y);
    for (let i = 1; i <= attack.impactTick; i++) {
      state.tick = i;
      updateSoldier(state, defender, 0.1);
      updateMeleeDodges(state);
      updateMeleeAttacks(state);
    }
    expect(defender.hp).toBe(hp);
    expect(Math.abs(defender.y - y)).toBeGreaterThan(0.8);
    expect(defender.intent).toBe('esquive');
  });

  it('ne donne aucune invulnérabilité si le défenseur reste dans la zone', () => {
    const { state, attacker, defender } = scene();
    fireSalvo(state, attacker, defender);
    const attack = attacker.meleeAttack!;
    updateMeleeDodges(state);
    const dodge = defender.meleeDodge!;
    expect(dodge).toBeTruthy();
    defender.x = 16.5; defender.y = 17.5;
    state.tick = attack.impactTick;
    updateMeleeAttacks(state);
    expect(defender.hp).toBeLessThan(defender.maxHp);
  });

  it('respecte déplacement ordonné, posture tenir et récupération après impact', () => {
    for (const condition of ['goal', 'hold', 'attack'] as const) {
      const { state, attacker, defender } = scene();
      fireSalvo(state, attacker, defender);
      if (condition === 'goal') defender.goal = { x: 18, y: 17.5 };
      if (condition === 'hold') defender.stance = 'hold';
      if (condition === 'attack') { fireSalvo(state, defender, attacker); defender.meleeAttack!.resolved = true; }
      updateMeleeDodges(state);
      expect(defender.meleeDodge).toBeNull();
    }
  });

  it('peut interrompre un coup préparé pour esquiver sans porter son impact', () => {
    const { state, attacker, defender } = scene();
    fireSalvo(state, attacker, defender);
    fireSalvo(state, defender, attacker);
    const cancelled = defender.meleeAttack!;
    updateMeleeDodges(state);
    expect(defender.meleeDodge).not.toBeNull();
    expect(defender.meleeAttack).toBeNull();
    const hp = attacker.hp;
    state.tick = cancelled.impactTick;
    updateMeleeAttacks(state);
    expect(attacker.hp).toBe(hp);
  });

  it('ne traverse pas les obstacles et un ordre direct annule une esquive', () => {
    const { state, attacker, defender } = scene();
    fireSalvo(state, attacker, defender);
    updateMeleeDodges(state);
    expect(defender.meleeDodge).toBeTruthy();
    expect(issueOrder(state, { type: 'move', units: [defender.id], x: 18.5, y: 17.5 })).toBe(true);
    expect(defender.meleeDodge).toBeNull();
    expect(defender.goal).not.toBeNull();
  });

  it('bloque l’esquive si les deux côtés sont occupés par un mur', () => {
    const { state, attacker, defender } = scene();
    defender.y = 17.5;
    state.map.tiles[16 * state.map.width + 16]!.terrain = 'wall';
    state.map.tiles[18 * state.map.width + 16]!.terrain = 'wall';
    fireSalvo(state, attacker, defender);
    updateMeleeDodges(state);
    expect(defender.meleeDodge).toBeNull();
  });
});
