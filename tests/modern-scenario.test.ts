import { describe, expect, it } from 'vitest';
import { OPERATION_CARREFOUR } from '../src/data/maps/operation-carrefour';
import { unitDef } from '../src/data/units';
import { weapon } from '../src/data/weapons';
import { createSimulation, issueOrder, stepSimulation } from '../src/sim/simulation';
import { isSolid } from '../src/sim/map';
import { Effects } from '../src/render/effects';

describe('Opération Carrefour : corps à corps', () => {
  it('déploie deux groupes à mains nues, sans grenades ni artillerie', () => {
    const state = createSimulation({ seed: 15, map: OPERATION_CARREFOUR });
    for (const faction of ['penitents', 'marteau'] as const) {
      const units = state.units.filter(unit => unit.faction === faction);
      expect(units).toHaveLength(13);
      expect(units.every(unit => !isSolid(state.map, unit.x, unit.y))).toBe(true);
      expect(units.every(unit => weapon(unitDef(unit.defId).weapon).id === 'unarmed')).toBe(true);
      expect(units.every(unit => !unit.abilities.grenade && !unit.abilities.artillery)).toBe(true);
    }
  });

  it('un ordre d’attaque rapproche les soldats et ne frappe qu’au contact', () => {
    const state = createSimulation({ seed: 15, map: OPERATION_CARREFOUR });
    const attacker = state.units.find(unit => unit.faction === 'penitents')!;
    const target = state.units.find(unit => unit.faction === 'marteau')!;
    for (const unit of state.units) if (unit !== attacker && unit !== target) unit.alive = false;
    Object.assign(attacker, { x: 15.5, y: 17.5, prevX: 15.5, prevY: 17.5, cooldown: 0 });
    Object.assign(target, { x: 19.5, y: 17.5, prevX: 19.5, prevY: 17.5, cooldown: 0 });
    const oldHp = target.hp;
    expect(issueOrder(state, { type: 'attack', units: [attacker.id], target: target.id })).toBe(true);
    stepSimulation(state);
    expect(target.hp).toBe(oldHp);
    const events = [];
    for (let i = 0; i < 100 && !state.over; i++) events.push(...stepSimulation(state));
    const strikes = events.filter(event => event.type === 'melee');
    expect(strikes.length).toBeGreaterThan(0);
    for (const event of strikes) {
      expect(Math.hypot(event.x! - event.tx!, event.y! - event.ty!)).toBeLessThanOrEqual(weapon('unarmed').range);
    }
    expect(events.some(event => event.type === 'shot')).toBe(false);
    expect(attacker.hp < attacker.maxHp || target.hp < target.maxHp).toBe(true);
    const effects = new Effects();
    effects.spawnFromEvents(state, events.filter(event => event.type === 'melee'));
    expect(effects.list.some(effect => effect.kind === 'tracer')).toBe(false);
  });

  it('les deux camps se rencontrent sans projectiles dans une bataille autonome', () => {
    const state = createSimulation({ seed: 20261001, map: OPERATION_CARREFOUR });
    const events = [];
    // Les collisions avec le décor ralentissent parfois le contact ; la partie doit
    // tout de même se conclure dans un délai borné, renforts compris.
    for (let i = 0; i < 800 && !state.over; i++) events.push(...stepSimulation(state));
    expect(events.some(event => event.type === 'melee')).toBe(true);
    expect(events.some(event => event.type === 'shot')).toBe(false);
    expect(events.some(event => event.type === 'dodge')).toBe(true);
    expect(state.over).not.toBeNull();
    expect(state.stats.grenades).toBe(0);
    expect(state.stats.shells).toBe(0);
  });
});
