import { describe, it, expect } from 'vitest';
import { ENDLESS_CARREFOUR } from '../src/data/maps/endless-carrefour';
import { OPERATION_CARREFOUR } from '../src/data/maps/operation-carrefour';
import { weapon } from '../src/data/weapons';
import { isSolid } from '../src/sim/map';
import { updateCreature } from '../src/sim/ai/creatureAI';
import { applyDamage, fireSalvo, updateMeleeAttacks } from '../src/sim/combat';
import { advanceBullet, ballisticTargetInSight, spawnBullet } from '../src/sim/ballistics';
import { targetInSight } from '../src/sim/direct-control';
import { updateSoldier } from '../src/sim/ai/soldierAI';
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
  it('ses griffes portent deux fois plus loin sans toucher à distance excessive', () => {
    const s = createSimulation({seed: 12, map: ENDLESS_CARREFOUR});
    const c = s.units.find(u => u.defId === 'creature')!;
    const target = s.units.find(u => u.faction === 'penitents')!;
    for (const u of s.units) if (u !== c && u !== target) u.alive = false;
    Object.assign(c, {x: 10.5, y: 17.5, cooldown: 0});
    Object.assign(target, {x: 13.0, y: 17.5});
    s.rng.next = () => 0;
    updateCreature(s, c, .1);
    expect(c.shotsFired).toBe(1); expect(target.hp).toBeLessThan(target.maxHp);
    expect(weapon('creature_claw').range).toBe(3.2);
  });
  it('le volume balistique élargi est détecté en FPS et arrête une balle haute et décalée', () => {
    const s = createSimulation({seed: 4, map: ENDLESS_CARREFOUR});
    const c = s.units.find(u => u.defId === 'creature')!;
    const shooter = s.units.find(u => u.defId === 'modern_rifleman' && u.faction === 'penitents')!;
    for (const u of s.units) if (u !== c && u !== shooter) u.alive = false;
    Object.assign(shooter, {x: 5.5, y: 17.5}); Object.assign(c, {x: 10.5, y: 18.5});
    for (let y = 17; y <= 18; y++) for (let x = 5; x <= 11; x++) s.map.tiles[y * s.map.width + x]!.terrain = 'road';
    expect(targetInSight(s, shooter, 0, .25, 13)).toBe(c);
    expect(ballisticTargetInSight(s, shooter, weapon('modern_rifle'), 0, .2)).toBe(c);
    const bullet = spawnBullet(s, shooter, weapon('modern_rifle'), 0, 0, 2);
    advanceBullet(s, bullet, .2);
    expect(c.hp).toBeLessThan(c.maxHp);
    expect(s.events.some(e => e.type === 'hit' && e.targetId === c.id)).toBe(true);
  });
  it('un combattant peut frapper le bord du corps agrandi sans se superposer au centre', () => {
    const s = createSimulation({seed: 3, map: ENDLESS_CARREFOUR});
    const c = s.units.find(u => u.defId === 'creature')!;
    const attacker = s.units.find(u => u.defId === 'modern_fighter' && u.faction === 'penitents')!;
    for (const u of s.units) if (u !== c && u !== attacker) u.alive = false;
    Object.assign(attacker, {x: 10.5, y: 17.5, cooldown: 0, goal: null, forcedTargetId: null, stance: 'advance', sinceUnderFire: 99});
    Object.assign(c, {x: 12.7, y: 17.5});
    updateSoldier(s, attacker, .1);
    expect(attacker.meleeAttack).not.toBeNull();
    s.tick = attacker.meleeAttack!.impactTick; updateMeleeAttacks(s);
    expect(c.hp).toBeLessThan(c.maxHp);
    attacker.meleeAttack = null; attacker.cooldown = 0; c.x = 14.0;
    fireSalvo(s, attacker, c); expect(attacker.meleeAttack).toBeNull();
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
