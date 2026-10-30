import { describe, it, expect } from 'vitest';
import { ENDLESS_CARREFOUR } from '../src/data/maps/endless-carrefour';
import { OPERATION_CARREFOUR } from '../src/data/maps/operation-carrefour';
import { weapon } from '../src/data/weapons';
import { isSolid } from '../src/sim/map';
import { updateCreature } from '../src/sim/ai/creatureAI';
import { applyDamage } from '../src/sim/combat';
import { createSimulation, issueOrder, stepSimulation } from '../src/sim/simulation';

describe('créature indépendante', () => {
  it('apparaît seulement dans la bataille sans fin, sur une case praticable', () => {
    const s = createSimulation({ seed: 1, map: ENDLESS_CARREFOUR });
    const c = s.units.filter(u => u.defId === 'creature');
    expect(c).toHaveLength(1);
    expect(isSolid(s.map, c[0]!.x, c[0]!.y)).toBe(false);
    expect(createSimulation({ map: OPERATION_CARREFOUR }).units.some(u => u.defId === 'creature')).toBe(false);
  });
  it.each(['penitents', 'marteau'])('attaque le camp %s et peut être blessée par lui', faction => {
    const s = createSimulation({ seed: 1, map: ENDLESS_CARREFOUR });
    const c = s.units.find(u => u.defId === 'creature')!;
    const target = s.units.find(u => u.faction === faction)!;
    for (const u of s.units) if (u !== c && u !== target) u.alive = false;
    Object.assign(c, {x: 15.5, y: 17.5, cooldown: 0});
    Object.assign(target, {x: 16.5, y: 17.5});
    // Répéter car le coup n'est pas garanti à chaque tentative.
    for (let i = 0; i < 10 && target.hp === target.maxHp; i++) { c.cooldown = 0; updateCreature(s, c, 0.1); }
    expect(c.targetId).toBe(target.id);
    expect(target.hp).toBeLessThan(target.maxHp);
    expect(c.shotsFired).toBeGreaterThan(0);
    applyDamage(s, c, 10, {sourceId: target.id, faction, kind: 'kinetic'});
    expect(c.hp).toBe(c.maxHp - 10);
  });
  it('ne frappe pas à distance, et ne reçoit pas d’ordre de joueur', () => {
    const s = createSimulation({ seed: 1, map: ENDLESS_CARREFOUR });
    const c = s.units.find(u => u.defId === 'creature')!;
    const target = s.units.find(u => u.faction === 'penitents')!;
    for (const u of s.units) if (u !== c && u !== target) u.alive = false;
    Object.assign(c, {x: 15.5, y: 17.5, cooldown: 0});
    Object.assign(target, {x: 19.5, y: 17.5});
    updateCreature(s, c, 0.1);
    expect(target.hp).toBe(target.maxHp);
    expect(c.targetId).toBe(target.id);
    expect(weapon('creature_claw').range).toBeLessThan(4);
    expect(issueOrder(s, {type: 'move', units: [c.id], x: 10, y: 10})).toBe(false);
  });
  it('réapparaît après sa mort sans faire gagner un camp', () => {
    const s = createSimulation({ seed: 1, map: ENDLESS_CARREFOUR });
    const c = s.units.find(u => u.defId === 'creature')!;
    applyDamage(s, c, 10000, {kind:'kinetic', faction: 'penitents'});
    expect(c.alive).toBe(false);
    expect(s.respawn!.pending.some(p => p.defId === 'creature')).toBe(true);
    for(let i = 0; i < 100; i++) stepSimulation(s);
    expect(s.units.some(u => u.defId === 'creature' && u.alive && u.id !== c.id)).toBe(true);
    expect(s.over).toBeNull();
  });
});
