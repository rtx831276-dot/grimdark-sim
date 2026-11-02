import { describe, expect, it } from 'vitest';
import { OPERATION_CARREFOUR } from '../src/data/maps/operation-carrefour';
import { unitDef } from '../src/data/units';
import { createSimulation, stepSimulation } from '../src/sim/simulation';
import { HEAL_AMOUNT, HEAL_COOLDOWN, updateAbilityCooldowns, useHeal, woundedAllyFor } from '../src/sim/abilities';
import type { Unit } from '../src/sim/types';

function setup() {
  const state = createSimulation({ seed: 17, map: OPERATION_CARREFOUR });
  const medic = state.units.find(unit => unit.faction === 'penitents' && unit.defId === 'modern_medic')!;
  const allies = state.units.filter(unit => unit.faction === medic.faction && unit.id !== medic.id);
  const enemy = state.units.find(unit => unit.faction !== medic.faction)!;
  for (const unit of state.units) unit.alive = [medic, ...allies.slice(0, 2), enemy].includes(unit);
  const [patient, second] = allies;
  place(medic, 2.5, 5.5); place(patient!, 4.5, 5.5); place(second!, 2.5, 7.5); place(enemy, 40.5, 27.5);
  return { state, medic, patient: patient!, second: second!, enemy };
}
function place(unit: Unit, x: number, y: number): void {
  unit.x = unit.prevX = x; unit.y = unit.prevY = y;
  unit.stance = 'hold'; unit.goal = null; unit.path = []; unit.pathGoal = null;
  unit.forcedTargetId = null; unit.targetId = null;
}

describe('rôles du scénario', () => {
  it('donne les mêmes six rôles sans armes à feu aux deux camps', () => {
    const state = createSimulation({ seed: 17, map: OPERATION_CARREFOUR });
    const expected: Record<string, number> = {
      modern_melee_leader: 1, modern_fighter: 4, modern_assault_melee: 3,
      modern_defender: 2, modern_recon_melee: 2, modern_medic: 1,
    };
    for (const faction of ['penitents', 'marteau'] as const) {
      const units = state.units.filter(unit => unit.faction === faction);
      expect(units).toHaveLength(13);
      for (const [id, count] of Object.entries(expected)) expect(units.filter(unit => unit.defId === id)).toHaveLength(count);
      expect(units.every(unit => unitDef(unit.defId).weapon === 'unarmed')).toBe(true);
      expect(units.every(unit => Boolean(unitDef(unit.defId).roleBadge))).toBe(true);
    }
  });

  it('différencie réellement vitesse, résistance et portée de détection', () => {
    const normal = unitDef('modern_fighter');
    expect(unitDef('modern_assault_melee').speed).toBeGreaterThan(normal.speed);
    expect(unitDef('modern_assault_melee').skill).toBeGreaterThan(normal.skill);
    expect(unitDef('modern_defender').hp).toBeGreaterThan(normal.hp);
    expect(unitDef('modern_defender').speed).toBeLessThan(normal.speed);
    expect(unitDef('modern_recon_melee').vision).toBeGreaterThan(normal.vision);
  });
});

describe('soins du médecin', () => {
  it('soigne un allié à portée sans dépasser sa vie maximale et consomme une charge', () => {
    const { state, medic, patient } = setup();
    patient.hp = patient.maxHp - 12;
    expect(useHeal(state, medic, patient)).toBe(true);
    expect(patient.hp).toBe(patient.maxHp);
    expect(medic.abilities.heal?.charges).toBe(2);
    expect(medic.abilities.heal?.cooldown).toBe(HEAL_COOLDOWN);
    expect(state.events.at(-1)).toMatchObject({ type: 'healed', unitId: medic.id, targetId: patient.id, amount: 12 });
  });

  it('respecte la recharge et les charges limitées', () => {
    const { state, medic, patient } = setup();
    patient.hp = 1;
    expect(useHeal(state, medic, patient)).toBe(true);
    expect(patient.hp).toBe(1 + HEAL_AMOUNT);
    expect(useHeal(state, medic, patient)).toBe(false);
    updateAbilityCooldowns(state, medic, HEAL_COOLDOWN);
    expect(useHeal(state, medic, patient)).toBe(true);
    updateAbilityCooldowns(state, medic, HEAL_COOLDOWN);
    patient.hp = 1;
    expect(useHeal(state, medic, patient)).toBe(true);
    expect(medic.abilities.heal?.charges).toBe(0);
    updateAbilityCooldowns(state, medic, HEAL_COOLDOWN);
    patient.hp = 1;
    expect(useHeal(state, medic, patient)).toBe(false);
  });

  it('refuse les soins sur soi, sur un ennemi, un mort, une cible hors de portée ou à travers un mur', () => {
    const { state, medic, patient, enemy } = setup();
    medic.hp -= 20; enemy.hp -= 20; patient.hp -= 20;
    expect(useHeal(state, medic, medic)).toBe(false);
    place(enemy, 3.5, 5.5);
    expect(useHeal(state, medic, enemy)).toBe(false);
    patient.alive = false;
    expect(useHeal(state, medic, patient)).toBe(false);
    patient.alive = true;
    place(patient, 9.5, 5.5);
    expect(useHeal(state, medic, patient)).toBe(false);
    place(patient, 4.5, 5.5);
    state.map.tiles[5 * state.map.width + 3] = { terrain: 'wall', hp: 160, maxHp: 160 };
    expect(useHeal(state, medic, patient)).toBe(false);
    expect(medic.abilities.heal?.charges).toBe(3);
  });

  it('choisit le plus blessé en proportion et ignore les blessures superficielles', () => {
    const { state, medic, patient, second } = setup();
    patient.hp = patient.maxHp - 5;
    second.hp = second.maxHp - 10;
    expect(woundedAllyFor(state, medic)).toBe(second);
    patient.hp = patient.maxHp * 0.25;
    expect(woundedAllyFor(state, medic)).toBe(patient);
    patient.hp = patient.maxHp;
    second.hp = second.maxHp;
    expect(woundedAllyFor(state, medic)).toBeNull();
  });

  it('soigne automatiquement en jeu et laisse une trace visible', () => {
    const { state, medic, patient } = setup();
    patient.hp -= 15;
    const events = stepSimulation(state);
    expect(patient.hp).toBe(patient.maxHp);
    expect(medic.abilities.heal?.charges).toBe(2);
    expect(events.some(event => event.type === 'healed' && event.targetId === patient.id)).toBe(true);
  });

  it('ne soigne pas quand il a reçu un ordre direct ou quand il est démoralisé', () => {
    const { state, medic, patient } = setup();
    patient.hp -= 20;
    medic.goal = { x: 7.5, y: 5.5 };
    stepSimulation(state);
    expect(patient.hp).toBe(patient.maxHp - 20);
    expect(medic.abilities.heal?.charges).toBe(3);
    medic.goal = null;
    medic.state = 'broken'; medic.morale = 1;
    stepSimulation(state);
    expect(medic.abilities.heal?.charges).toBe(3);
  });
});
