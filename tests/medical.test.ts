import { describe, expect, it } from 'vitest';
import { ENDLESS_CARREFOUR } from '../src/data/maps/endless-carrefour';
import { OPERATION_CARREFOUR } from '../src/data/maps/operation-carrefour';
import { applyDamage, BLEED_OUT_TICKS, createSimulation, HOSPITAL_TICKS, isEffective, isSolid, issueOrder,
  killUnit, stepSimulation, terrainPenetration, updateDirectControl, canFire, useCharge, useGrenade, useHeal } from '../src/sim';

function setup(faction = 'penitents') {
  const state = createSimulation({ map: ENDLESS_CARREFOUR, seed: 45 });
  const carrier = state.units.find(u => u.faction === faction && u.defId === 'modern_rifleman')!;
  const patient = state.units.find(u => u.faction === faction && u.defId === 'modern_fighter')!;
  const enemy = state.units.find(u => u.faction !== faction && u.defId !== 'creature')!;
  for (const u of state.units) if (u !== carrier && u !== patient) u.alive = false;
  const left = faction === 'penitents';
  Object.assign(carrier, { x: left ? 10.5 : 33.5, y: 17.5, prevX: left ? 10.5 : 33.5, prevY: 17.5, stance: 'hold' });
  Object.assign(patient, { x: left ? 12.5 : 31.5, y: 17.5, prevX: left ? 12.5 : 31.5, prevY: 17.5, hp: 5, stance: 'hold' });
  return { state, carrier, patient, enemy };
}
function wound(state: ReturnType<typeof setup>['state'], patient: ReturnType<typeof setup>['patient'], enemy: ReturnType<typeof setup>['enemy']) {
  applyDamage(state, patient, 10, { kind: 'kinetic', sourceId: enemy.id, faction: enemy.faction });
}

describe('évacuation et hôpitaux', () => {
  it.each(['penitents', 'marteau'])('évacue un blessé vers l’hôpital du camp %s puis le rend au combat', faction => {
    const { state, carrier, patient, enemy } = setup(faction);
    const hospital = state.map.def.hospitals![faction]!;
    expect(isSolid(state.map, hospital.x, hospital.y)).toBe(false);
    wound(state, patient, enemy);
    expect(patient.alive).toBe(true); expect(patient.state).toBe('wounded');
    expect(isEffective(patient)).toBe(false); expect(state.stats.kills).toBe(0); expect(state.respawn!.pending).toHaveLength(0);
    expect(issueOrder(state, { type: 'rescue', units: [carrier.id], target: patient.id })).toBe(true);
    let carrying = false, hospitalized = false, recovered = false, carryingMovement = false, lastX = carrier.x, lastY = carrier.y;
    for (let i = 0; i < BLEED_OUT_TICKS + HOSPITAL_TICKS && !recovered; i++) {
      const events = stepSimulation(state);
      expect(terrainPenetration(state.map, carrier.x, carrier.y)).toBeLessThan(1e-6);
      if (carrier.rescue?.stage === 'carrying') {
        carrying = true;
        carryingMovement ||= Math.hypot(carrier.x - lastX, carrier.y - lastY) > 0.001;
        expect(patient.wound?.carriedBy).toBe(carrier.id);
        expect(patient.x).toBeCloseTo(carrier.x); expect(patient.y).toBeCloseTo(carrier.y);
      }
      hospitalized ||= events.some(e => e.type === 'hospitalized' && e.unitId === patient.id);
      recovered ||= events.some(e => e.type === 'medicalRecovered' && e.unitId === patient.id);
      lastX = carrier.x; lastY = carrier.y;
    }
    expect(carrying).toBe(true); expect(carryingMovement).toBe(true); expect(hospitalized).toBe(true); expect(recovered).toBe(true);
    expect(patient.alive).toBe(true); expect(patient.state).not.toBe('wounded'); expect(patient.hp).toBe(patient.maxHp);
    expect(patient.wound).toBeUndefined(); expect(carrier.rescue).toBeUndefined();
    expect(state.units.filter(u => u.id === patient.id)).toHaveLength(1);
    expect(state.respawn!.pending).toHaveLength(0);
  });
  it('un blessé non évacué succombe après le délai, avec un seul renfort', () => {
    const { state, patient, enemy } = setup(); wound(state, patient, enemy);
    const deadline = patient.wound!.bleedOutTick;
    state.tick = deadline - 1;
    const events = stepSimulation(state);
    expect(patient.alive).toBe(false); expect(patient.state).toBe('dead'); expect(patient.wound).toBeUndefined();
    expect(state.respawn!.pending.filter(entry => entry.defId === patient.defId)).toHaveLength(1);
    expect(events.filter(e => e.type === 'kill' && e.unitId === patient.id)).toHaveLength(1);
    stepSimulation(state);
    expect(state.respawn!.pending.filter(entry => entry.defId === patient.defId)).toHaveLength(1);
  });
  it('un porteur tué ou interrompu libère son patient sans téléportation', () => {
    const { state, carrier, patient, enemy } = setup(); wound(state, patient, enemy);
    expect(issueOrder(state, { type: 'rescue', units: [carrier.id], target: patient.id })).toBe(true);
    const initialX = patient.x, initialY = patient.y;
    expect(issueOrder(state, { type: 'hold', units: [carrier.id] })).toBe(true);
    expect(patient.x).toBe(initialX); expect(patient.y).toBe(initialY); expect(patient.wound?.assignedTo).toBeNull();
    expect(issueOrder(state, { type: 'rescue', units: [carrier.id], target: patient.id })).toBe(true);
    for (let i = 0; i < 40 && carrier.rescue?.stage !== 'carrying'; i++) stepSimulation(state);
    expect(carrier.rescue?.stage).toBe('carrying');
    const x = carrier.x, y = carrier.y;
    killUnit(state, carrier, enemy.id, enemy.faction);
    expect(patient.alive).toBe(true); expect(patient.wound?.carriedBy).toBeNull(); expect(patient.wound?.assignedTo).toBeNull();
    expect(patient.x).toBeCloseTo(x); expect(patient.y).toBeCloseTo(y);
  });
  it('interdit les ennemis, les doublons et les ordres ou contrôles donnés au blessé', () => {
    const { state, carrier, patient, enemy } = setup(); wound(state, patient, enemy);
    enemy.alive = true;
    expect(issueOrder(state, { type: 'rescue', units: [enemy.id], target: patient.id })).toBe(false);
    expect(issueOrder(state, { type: 'move', units: [patient.id], x: 15, y: 17 })).toBe(false);
    const x = patient.x, y = patient.y;
    updateDirectControl(state, { unitId: patient.id, yaw: 0, pitch: 0, forward: 1, strafe: 0, fire: true, reload: false }, .1);
    expect(patient.x).toBe(x); expect(patient.y).toBe(y); expect(patient.state).toBe('wounded');
    expect(issueOrder(state, { type: 'rescue', units: [carrier.id], target: patient.id })).toBe(true);
    const other = state.units.find(u => u.faction === carrier.faction && u.id !== patient.id && u.id !== carrier.id)!;
    other.alive = true;
    expect(issueOrder(state, { type: 'rescue', units: [other.id], target: patient.id })).toBe(false);
  });
  it('un médecin proche et libre se porte spontanément au secours', () => {
    const { state, patient, enemy } = setup();
    const medic = state.units.find(u => u.faction === patient.faction && u.defId === 'modern_medic')!;
    Object.assign(medic, { alive: true, x: 11.5, y: 17.5, goal: null, forcedTargetId: null, state: 'idle', suppression: 0 });
    wound(state, patient, enemy); state.tick = 9;
    stepSimulation(state);
    expect(medic.rescue?.targetId).toBe(patient.id);
  });
  it('interrompt le secours si un blessé transporté reçoit un nouveau coup', () => {
    const { state, carrier, patient, enemy } = setup();
    enemy.alive = true; wound(state, patient, enemy);
    expect(issueOrder(state, { type: 'rescue', units: [carrier.id], target: patient.id })).toBe(true);
    for (let i = 0; i < 40 && carrier.rescue?.stage !== 'carrying'; i++) stepSimulation(state);
    expect(carrier.rescue?.stage).toBe('carrying');
    const damage = state.stats.damage;
    applyDamage(state, patient, 2, { kind: 'kinetic', sourceId: enemy.id, faction: enemy.faction });
    expect(patient.alive).toBe(false); expect(carrier.rescue).toBeUndefined();
    expect(state.stats.damage).toBe(damage + 2);
    expect(state.respawn!.pending.filter(entry => entry.defId === patient.defId)).toHaveLength(1);
  });
  it('un porteur en mission ne peut utiliser ses capacités de combat', () => {
    const { state, carrier, patient, enemy } = setup(); wound(state, patient, enemy);
    expect(issueOrder(state, { type: 'rescue', units: [carrier.id], target: patient.id })).toBe(true);
    expect(canFire(carrier)).toBe(false);
    expect(useGrenade(state, carrier, carrier.x + 1, carrier.y)).toBe(false);
    expect(useCharge(state, carrier)).toBe(false);
    expect(useHeal(state, carrier, patient)).toBe(false);
  });
  it('attribue la perte par saignement à son attaquant encore vivant', () => {
    const { state, patient, enemy } = setup(); enemy.alive = true; wound(state, patient, enemy);
    const kills = enemy.kills;
    state.tick = patient.wound!.bleedOutTick - 1;
    stepSimulation(state);
    expect(patient.alive).toBe(false); expect(enemy.kills).toBe(kills + 1);
  });
  it('les explosions létales et les scénarios sans hôpital conservent la mort immédiate', () => {
    const { state, patient, enemy } = setup();
    applyDamage(state, patient, 80, { kind: 'explosive', sourceId: enemy.id, faction: enemy.faction });
    expect(patient.alive).toBe(false); expect(patient.wound).toBeUndefined();
    const old = createSimulation({ map: OPERATION_CARREFOUR, seed: 4 });
    const victim = old.units[0]!;
    applyDamage(old, victim, victim.maxHp + 1, { kind: 'kinetic' });
    expect(victim.alive).toBe(false); expect(victim.wound).toBeUndefined();
  });
});
