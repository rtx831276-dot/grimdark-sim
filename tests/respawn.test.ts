import { describe, expect, it } from 'vitest';
import { OPERATION_CARREFOUR } from '../src/data/maps/operation-carrefour';
import { createSimulation, hashState, issueOrder, killUnit, stepSimulation } from '../src/sim';
import { isSolid } from '../src/sim/map';
import { unitDef } from '../src/data/units';
import { weapon } from '../src/data/weapons';

describe('renforts de la mission moderne', () => {
  it('après 10 secondes de simulation crée un nouveau soldat sans ressusciter le cadavre', () => {
    const state = createSimulation({ map: OPERATION_CARREFOUR, seed: 42 });
    const original = state.units[0]!;
    const enemy = state.units.find(u => u.faction !== original.faction)!;
    const startingCount = state.units.length;
    killUnit(state, original, enemy.id, enemy.faction);
    expect(state.respawn!.reserves[original.faction]).toBe(12);
    expect(state.respawn!.pending[0]!.atTick).toBe(100);
    for (let i = 0; i < 99; i++) stepSimulation(state);
    expect(state.units.filter(u => u.id > startingCount && u.defId === original.defId && u.faction === original.faction)).toHaveLength(0);
    const events = stepSimulation(state);
    const event = events.find(e => e.type === 'respawn' && e.faction === original.faction && e.label === unitDef(original.defId).label)!;
    expect(event).toBeDefined();
    const replacement = state.units[event.unitId! - 1]!;
    expect(replacement.id).not.toBe(original.id);
    expect(original.alive).toBe(false);
    expect(original.hp).toBe(0);
    expect(replacement.alive).toBe(true);
    expect(replacement.hp).toBe(replacement.maxHp);
    expect(replacement.defId).toBe(original.defId);
    expect(weapon(unitDef(replacement.defId).weapon).id).toBe('unarmed');
    expect(isSolid(state.map, event.x!, event.y!)).toBe(false);
    expect(issueOrder(state, { type: 'hold', units: [replacement.id] })).toBe(true);
    expect(replacement.stance).toBe('hold');
  });

  it('attend les renforts avant la fin et ne dépasse pas le stock', () => {
    const state = createSimulation({ map: OPERATION_CARREFOUR, seed: 13 });
    const faction = 'penitents';
    const soldiers = state.units.filter(u => u.faction === faction);
    for (const soldier of soldiers) killUnit(state, soldier);
    expect(state.respawn!.pending).toHaveLength(13);
    expect(state.respawn!.reserves[faction]).toBe(0);
    for (let i = 0; i < 99; i++) stepSimulation(state);
    expect(state.over).toBeNull();
    stepSimulation(state);
    expect(state.units.filter(u => u.faction === faction && u.alive)).toHaveLength(13);
    expect(state.respawn!.pending).toHaveLength(0);
    for (const soldier of state.units.filter(u => u.faction === faction && u.alive)) killUnit(state, soldier);
    expect(state.respawn!.pending).toHaveLength(0);
    stepSimulation(state);
    expect(state.over?.winner).toBe('marteau');
    expect(state.units.length).toBeLessThanOrEqual(52);
  });

  it('reste déterministe et peut être désactivé pour les autres modes', () => {
    const a = createSimulation({ map: OPERATION_CARREFOUR, seed: 77 });
    const b = createSimulation({ map: OPERATION_CARREFOUR, seed: 77 });
    killUnit(a, a.units[0]!); killUnit(b, b.units[0]!);
    for (let i = 0; i < 150; i++) { stepSimulation(a); stepSimulation(b); }
    expect(hashState(a)).toBe(hashState(b));
    const disabled = createSimulation({ map: OPERATION_CARREFOUR, seed: 77, respawns: false });
    killUnit(disabled, disabled.units[0]!);
    expect(disabled.respawn).toBeNull();
    expect(disabled.units).toHaveLength(26);
  });
});
