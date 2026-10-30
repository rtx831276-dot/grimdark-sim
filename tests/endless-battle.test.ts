import { describe, expect, it } from 'vitest';
import { ENDLESS_CARREFOUR } from '../src/data/maps/endless-carrefour';
import { weapon } from '../src/data/weapons';
import { unitDef } from '../src/data/units';
import { updateSoldier } from '../src/sim/ai/soldierAI';
import { createSimulation, fireSalvo, hashState, issueOrder, killUnit, stepSimulation, updateMeleeAttacks } from '../src/sim';

describe('bataille sans fin', () => {
  it('déploie fusils, pistolets, lames, mains nues et grenadier dans chaque camp', () => {
    const state = createSimulation({ seed: 1, map: ENDLESS_CARREFOUR });
    for (const faction of ['penitents', 'marteau']) {
      const units = state.units.filter(u => u.faction === faction);
      expect(units).toHaveLength(13);
      for (const id of ['modern_rifle', 'modern_pistol', 'modern_sword', 'unarmed']) {
        expect(units.some(u => unitDef(u.defId).weapon === id)).toBe(true);
      }
      expect(units.some(u => u.abilities.grenade)).toBe(true);
    }
  });

  it('la lame touche uniquement à son tick d’impact avec sa hitbox, sans blesser les alliés', () => {
    const state = createSimulation({ seed: 1, map: ENDLESS_CARREFOUR });
    const attacker = state.units.find(u => u.defId === 'modern_blade')!;
    const target = state.units.find(u => u.faction !== attacker.faction)!;
    const ally = state.units.find(u => u.faction === attacker.faction && u !== attacker)!;
    for (const u of state.units) if (![attacker, target, ally].includes(u)) u.alive = false;
    Object.assign(attacker, { x: 15.5, y: 17.5, cooldown: 0, shotsFired: 0 });
    Object.assign(target, { x: 16.5, y: 17.5 });
    Object.assign(ally, { x: 16.3, y: 17.5 });
    fireSalvo(state, attacker, target);
    const move = attacker.meleeAttack!;
    expect(['Right_Hand_Sword_Slash', 'Weapon_Combo', 'Weapon_Combo_1']).toContain(move.clip);
    expect(target.hp).toBe(target.maxHp);
    state.tick = move.impactTick - 1; updateMeleeAttacks(state);
    expect(target.hp).toBe(target.maxHp);
    state.tick = move.impactTick; updateMeleeAttacks(state);
    expect(target.hp).toBeLessThan(target.maxHp);
    expect(ally.hp).toBe(ally.maxHp);
    expect(weapon('modern_sword').range).toBeGreaterThan(weapon('unarmed').range);
  });

  it('continue après élimination et remplace même une faction entièrement détruite', () => {
    const state = createSimulation({ seed: 13, map: ENDLESS_CARREFOUR });
    for (const unit of state.units.filter(u => u.faction === 'penitents')) killUnit(state, unit);
    expect(state.respawn!.pending).toHaveLength(13);
    for (let i = 0; i < 100; i++) stepSimulation(state);
    expect(state.over).toBeNull();
    expect(state.units.filter(u => u.faction === 'penitents' && u.alive)).toHaveLength(13);
  });

  it('remplace aussi les soldats qui fuient en mode infini', () => {
    const state = createSimulation({ seed: 9, map: ENDLESS_CARREFOUR });
    const soldier = state.units[0]!, line = state.map.def.fallbackLine[soldier.faction]!;
    Object.assign(soldier, { state: 'broken', x: line.x, y: line.y });
    updateSoldier(state, soldier, 0.1);
    expect(soldier.alive).toBe(false);
    expect(state.respawn!.pending.some(entry => entry.defId === soldier.defId && entry.faction === soldier.faction)).toBe(true);
  });

  it('nettoie les anciens corps, conserve les identifiants et les ordres fonctionnels', () => {
    const state = createSimulation({ seed: 21, map: ENDLESS_CARREFOUR });
    const old = state.units[0]!;
    killUnit(state, old);
    let respawnId = 0;
    for (let i = 0; i < 160; i++) {
      for (const e of stepSimulation(state)) if (e.type === 'respawn' && e.faction === old.faction && e.label === unitDef(old.defId).label) respawnId = e.unitId!;
    }
    expect(state.units.find(u => u.id === old.id)).toBeUndefined();
    const replacement = state.units.find(u => u.id === respawnId)!;
    expect(replacement?.alive).toBe(true);
    expect(issueOrder(state, { type: 'hold', units: [respawnId] })).toBe(true);
    expect(replacement.stance).toBe('hold');
  });

  it('reste déterministe et borne les unités sur une longue bataille', () => {
    const a = createSimulation({ seed: 20261001, map: ENDLESS_CARREFOUR });
    const b = createSimulation({ seed: 20261001, map: ENDLESS_CARREFOUR });
    let respawns = 0, shots = 0, max = 0;
    for (let i = 0; i < 2000; i++) {
      for (const event of stepSimulation(a)) { if (event.type === 'respawn') respawns++; if (event.type === 'shot') shots++; }
      stepSimulation(b);
      max = Math.max(max, a.units.length);
    }
    expect(a.over).toBeNull();
    expect(respawns).toBeGreaterThan(26);
    expect(shots).toBeGreaterThan(0);
    expect(max).toBeLessThan(60);
    expect(hashState(a)).toBe(hashState(b));
  });
});
