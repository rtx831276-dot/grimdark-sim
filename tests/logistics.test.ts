import { describe, expect, it } from 'vitest';
import { ENDLESS_CARREFOUR } from '../src/data/maps/endless-carrefour';
import { OPERATION_CARREFOUR } from '../src/data/maps/operation-carrefour';
import { weapon } from '../src/data/weapons';
import { applyDamage, canFire, createSimulation, damageTile, fireAtPoint, hashState, issueOrder,
  stepSimulation, updateDirectControl, updateLogistics } from '../src/sim';

function setup(id = 'modern_rifleman') {
  const state = createSimulation({ map: ENDLESS_CARREFOUR, seed: 123, respawns: false });
  const unit = state.units.find(u => u.faction === 'penitents' && u.defId === id)!;
  const other = state.units.find(u => u.faction === 'penitents' && u.defId === 'modern_fighter')!;
  for (const u of state.units) if (u !== unit) u.alive = false;
  Object.assign(unit, { x: 9.5, y: 10.5, prevX: 9.5, prevY: 10.5, state: 'idle', stance: 'advance',
    sinceUnderFire: 99, suppression: 0, goal: null, forcedTargetId: null, cooldown: 0 });
  return { state, unit, other };
}

describe('autonomie et logistique', () => {
  it('soigne sa blessure au calme en consommant un bandage, pas instantanément', () => {
    const { state, unit } = setup(); unit.hp = unit.maxHp * .5; unit.stance = 'hold';
    for (let i = 0; i < 10; i++) stepSimulation(state);
    expect(unit.logisticsTask?.kind).toBe('selfHeal');
    expect(unit.hp).toBe(unit.maxHp * .5); expect(unit.bandages).toBe(1);
    let healed = false;
    for (let i = 0; i < 31; i++) healed ||= stepSimulation(state).some(e => e.type === 'healed');
    expect(healed).toBe(true); expect(unit.hp).toBeCloseTo(unit.maxHp * .9); expect(unit.bandages).toBe(0);
  });
  it('interrompt les premiers soins sous le feu et à un ordre, sans perdre le bandage', () => {
    const { state, unit } = setup(); unit.hp = unit.maxHp * .5; unit.stance = 'hold';
    for (let i = 0; i < 10; i++) stepSimulation(state);
    applyDamage(state, unit, 1, { kind: 'kinetic' }); stepSimulation(state);
    expect(unit.logisticsTask).toBeUndefined(); expect(unit.bandages).toBe(1);
    unit.sinceUnderFire = 99; unit.suppression = 0; state.tick = 19; stepSimulation(state);
    expect(unit.logisticsTask?.kind).toBe('selfHeal');
    expect(issueOrder(state, { type: 'move', units: [unit.id], x: 10.5, y: 17.5 })).toBe(true);
    expect(unit.logisticsTask).toBeUndefined(); expect(unit.bandages).toBe(1);
  });
  it('cherche une caisse intacte, y marche et prend les ressources sans dépasser son stock', () => {
    const { state, unit } = setup(); unit.reserveSalvos = 0; unit.salvosLeft = 0; unit.bandages = 0;
    const initialX = unit.x, initialY = unit.y;
    let supplied = false;
    for (let i = 0; i < 200 && !supplied; i++) supplied = stepSimulation(state).some(e => e.type === 'resupplied' && e.unitId === unit.id);
    expect(supplied).toBe(true);
    expect(Math.hypot(unit.x - initialX, unit.y - initialY)).toBeGreaterThan(.2);
    expect(unit.salvosLeft).toBeGreaterThan(0); expect(unit.bandages).toBe(1);
    expect(state.supplyCaches.some(c => c.ammo < 60 && c.medicine < 6)).toBe(true);
    expect(unit.logisticsTask).toBeUndefined();
  });
  it('ne prend rien aux caisses détruites ou épuisées et leurs stocks ne deviennent jamais négatifs', () => {
    const { state, unit } = setup(); unit.reserveSalvos = 0; unit.salvosLeft = 0; unit.bandages = 0;
    const cache = state.supplyCaches[4]!;
    for (const c of state.supplyCaches) { c.ammo = 0; c.medicine = 0; c.grenades = 0; }
    cache.ammo = 2; cache.medicine = 1;
    Object.assign(unit, { x: 11.5, y: 10.5 });
    state.tick = 10; updateLogistics(state, .1, unit.id);
    expect(unit.salvosLeft).toBe(2); expect(unit.reserveSalvos).toBe(0); expect(unit.bandages).toBe(1);
    expect(cache.ammo).toBe(0); expect(cache.medicine).toBe(0);
    cache.ammo = 20; cache.medicine = 2; unit.bandages = 0; unit.salvosLeft = 0;
    damageTile(state.map, cache.x, cache.y, 10000);
    state.tick = 600; updateLogistics(state, .1, unit.id);
    expect(unit.salvosLeft).toBe(0); expect(unit.bandages).toBe(0);
    expect(cache.ammo).toBe(20); expect(cache.medicine).toBe(2);
  });
  it('renouvelle progressivement les stocks de caisse intacte avec des plafonds', () => {
    const { state } = setup(); const cache = state.supplyCaches[0]!;
    Object.assign(cache, { ammo: 0, medicine: 0, grenades: 0 });
    state.tick = 599; updateLogistics(state, .1); expect(cache.ammo).toBe(0);
    state.tick = 600; updateLogistics(state, .1); expect(cache).toMatchObject({ammo: 30, medicine: 3, grenades: 1, nextRestockTick: 1200});
    state.tick = 1200; updateLogistics(state, .1); expect(cache).toMatchObject({ammo: 60, medicine: 6, grenades: 2});
  });
  it('consomme les munitions, recharge depuis la réserve et interdit le tir à vide', () => {
    const { state, unit } = setup(); const gun = weapon('modern_rifle');
    unit.salvosLeft = 1; unit.reserveSalvos = 2;
    expect(fireAtPoint(state, unit, unit.x + 2, unit.y)).toBe(true);
    expect(unit.salvosLeft).toBe(2); expect(unit.reserveSalvos).toBe(0); expect(unit.reloading).toBe(true);
    for (let i = 0; i < 2; i++) { unit.cooldown = 0; expect(fireAtPoint(state, unit, unit.x + 2, unit.y)).toBe(true); }
    expect(unit.salvosLeft).toBe(0); expect(canFire(unit)).toBe(false);
    unit.cooldown = 0; expect(fireAtPoint(state, unit, 15, 15)).toBe(false);
    updateDirectControl(state, {unitId: unit.id, yaw: 0, pitch: 0, forward: 0, strafe: 0, fire: false, reload: true}, .1);
    expect(unit.salvosLeft).toBe(0); expect(unit.reserveSalvos).toBe(0); expect(gun.reloadEvery).toBeGreaterThan(0);
  });
  it('un camarade libre non médecin évacue un blessé proche sans ordre', () => {
    const { state, unit, other } = setup('modern_rifleman');
    Object.assign(unit, { x: 10.5, y: 17.5 });
    Object.assign(other, { alive: true, x: 12.5, y: 17.5, hp: 5, state: 'idle' });
    applyDamage(state, other, 10, { kind: 'kinetic' }); state.tick = 9;
    stepSimulation(state); expect(unit.rescue?.targetId).toBe(other.id);
    let healed = false;
    for (let i = 0; i < 400 && !healed; i++) healed = stepSimulation(state).some(e => e.type === 'medicalRecovered' && e.unitId === other.id);
    expect(healed).toBe(true); expect(other.hp).toBe(other.maxHp);
  });
  it('un ordre de secours manuel remplace un secours automatique sans déplacer le patient', () => {
    const {state, unit, other} = setup();
    Object.assign(unit, { x: 10.5, y: 17.5 });
    Object.assign(other, { alive: true, x: 12.5, y: 17.5, hp: 5, state: 'idle' });
    const replacement = state.units.find(u => u.faction === unit.faction && u.id !== unit.id && u.id !== other.id)!;
    Object.assign(replacement, { alive: true, x: 9.5, y: 17.5, stance: 'hold', state: 'idle' });
    applyDamage(state, other, 10, {kind: 'kinetic'}); state.tick = 9; stepSimulation(state);
    expect(unit.rescue?.automatic).toBe(true);
    const x = other.x, y = other.y;
    expect(issueOrder(state, {type: 'rescue', units: [replacement.id], target: other.id})).toBe(true);
    expect(unit.rescue).toBeUndefined(); expect(replacement.rescue?.targetId).toBe(other.id);
    expect(other.x).toBe(x); expect(other.y).toBe(y);
  });
  it('conserve les anciens scénarios et inclut les stocks dans le hash déterministe', () => {
    const old = createSimulation({map: OPERATION_CARREFOUR});
    expect(old.supplyCaches).toHaveLength(0); expect(old.units.every(u => u.reserveSalvos === undefined && u.bandages === undefined)).toBe(true);
    const {state} = setup(); const before = hashState(state); state.supplyCaches[0]!.ammo--;
    expect(hashState(state)).not.toBe(before);
  });
});
