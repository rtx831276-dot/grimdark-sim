import { describe, expect, it } from 'vitest';
import { applyMoraleShock } from '../src/sim/morale';
import { createSimulation, effectiveUnits, hashState, issueOrder, stepSimulation, summarize } from '../src/sim/simulation';
import type { SimState, Unit } from '../src/sim/types';
import { TEST_MAP } from './fixtures/test-map';
import { VILLAGE_CHURCH } from '../src/data/maps/village-church';
import { rosterSize } from '../src/data/factions';

function runTicks(state: SimState, ticks: number): void {
  for (let i = 0; i < ticks && !state.over; i++) stepSimulation(state);
}

function find(state: SimState, faction: string, defId: string): Unit {
  const unit = state.units.find((candidate) => candidate.faction === faction && candidate.defId === defId);
  if (!unit) throw new Error(`Unité introuvable: ${faction}/${defId}`);
  return unit;
}

describe('mise en place', () => {
  it('déploie 10 à 15 unités par camp, toutes opérationnelles', () => {
    const state = createSimulation({ seed: 1 });
    const penitents = effectiveUnits(state, 'penitents');
    const marteau = effectiveUnits(state, 'marteau');
    expect(penitents.length).toBe(rosterSize('penitents'));
    expect(marteau.length).toBe(rosterSize('marteau'));
    expect(penitents.length).toBeGreaterThanOrEqual(10);
    expect(penitents.length).toBeLessThanOrEqual(15);
    expect(marteau.length).toBeGreaterThanOrEqual(10);
    expect(marteau.length).toBeLessThanOrEqual(15);
    expect(state.units.length).toBe(rosterSize('penitents') + rosterSize('marteau'));
  });

  it('équipe les unités de leurs capacités et de leurs munitions spéciales', () => {
    const state = createSimulation({ seed: 1 });
    const grenadier = find(state, 'penitents', 'grenadier');
    const observer = find(state, 'marteau', 'observateur');
    expect(grenadier.abilities.grenade?.charges).toBe(4);
    expect(observer.abilities.artillery?.charges).toBeGreaterThan(0);
    expect(state.factions.penitents?.barrages).toBeGreaterThan(0);
  });
});

describe('déterminisme', () => {
  it('deux batailles identiques produisent exactement le même déroulement', () => {
    const a = createSimulation({ seed: 4242, map: VILLAGE_CHURCH });
    const b = createSimulation({ seed: 4242, map: VILLAGE_CHURCH });
    runTicks(a, 500);
    runTicks(b, 500);
    expect(hashState(a)).toBe(hashState(b));
    expect(a.stats.kills).toBe(b.stats.kills);
    expect(a.stats.shotsFired).toBe(b.stats.shotsFired);
  });

  it('une graine différente change la bataille', () => {
    const a = createSimulation({ seed: 1, map: VILLAGE_CHURCH });
    const b = createSimulation({ seed: 2, map: VILLAGE_CHURCH });
    runTicks(a, 200);
    runTicks(b, 200);
    expect(hashState(a)).not.toBe(hashState(b));
  });
});

describe('ordres', () => {
  it('accepte un déplacement et trace un chemin', () => {
    const state = createSimulation({ seed: 5, map: TEST_MAP });
    const soldier = find(state, 'penitents', 'fusilier');
    const accepted = issueOrder(state, { type: 'move', units: [soldier.id], x: 8.5, y: 6.5 });
    expect(accepted).toBe(true);
    stepSimulation(state);
    expect(soldier.path.length).toBeGreaterThan(0);
    const startX = soldier.x;
    runTicks(state, 30);
    expect(soldier.x).toBeGreaterThan(startX);
  });

  it('refuse les ordres adressés à une unité démoralisée', () => {
    const state = createSimulation({ seed: 5, map: TEST_MAP });
    const broken = find(state, 'penitents', 'fusilier');
    applyMoraleShock(state, broken, 200);
    const accepted = issueOrder(state, { type: 'move', units: [broken.id], x: 8.5, y: 6.5 });
    expect(accepted).toBe(false);
    expect(state.events.some((event) => event.type === 'orderRefused')).toBe(true);
  });

  it('change de posture sans faire bouger les unités', () => {
    const state = createSimulation({ seed: 5, map: TEST_MAP });
    const soldier = find(state, 'penitents', 'fusilier');
    expect(issueOrder(state, { type: 'hold', units: [soldier.id] })).toBe(true);
    expect(soldier.stance).toBe('hold');
    expect(issueOrder(state, { type: 'fallback', units: [soldier.id] })).toBe(true);
    expect(soldier.stance).toBe('fallback');
    expect(issueOrder(state, { type: 'advance', units: [soldier.id] })).toBe(true);
    expect(soldier.stance).toBe('advance');
  });

  it('consomme une charge de grenade', () => {
    const state = createSimulation({ seed: 5, map: TEST_MAP });
    const grenadier = find(state, 'penitents', 'grenadier');
    expect(grenadier.abilities.grenade?.charges).toBe(4);
    const accepted = issueOrder(state, { type: 'grenade', units: [grenadier.id], x: 5.5, y: 3.5 });
    expect(accepted).toBe(true);
    expect(grenadier.abilities.grenade?.charges).toBe(3);
    expect(state.projectiles.length).toBe(1);
    expect(state.stats.grenades).toBe(1);
  });

  it('déclenche un barrage d artillerie hors-carte, puis le fait tomber', () => {
    const state = createSimulation({ seed: 5, map: VILLAGE_CHURCH });
    const before = state.factions.marteau!.barrages;
    // On vise la ferme ouest : un bloc de murs, donc une cible réaliste pour un barrage.
    const accepted = issueOrder(state, { type: 'artillery', faction: 'marteau', x: 15.5, y: 20.5 });
    expect(accepted).toBe(true);
    expect(state.factions.marteau?.barrages).toBe(before - 1);
    expect(state.projectiles.length).toBeGreaterThan(0);
    expect(state.events.some((event) => event.type === 'artilleryRequested')).toBe(true);

    // Les obus tombent au bout de l'arc de tir (6 s) : les murs doivent s'effondrer.
    const destroyedBefore = state.stats.tilesDestroyed;
    runTicks(state, 200);
    expect(state.projectiles.length).toBe(0);
    // 5 obus pour la frappe demandée ici, plus ceux que l'IA a pu demander de son côté.
    expect(state.stats.shells).toBeGreaterThanOrEqual(5);
    expect(state.stats.tilesDestroyed).toBeGreaterThan(destroyedBefore);
  });

  it('refuse un barrage sans observateur vivant', () => {
    const state = createSimulation({ seed: 5, map: TEST_MAP });
    const observer = find(state, 'marteau', 'observateur');
    observer.alive = false;
    expect(issueOrder(state, { type: 'artillery', faction: 'marteau', x: 5, y: 3 })).toBe(false);
  });
});

describe('bataille complète simulée sans rendu', () => {
  it('tourne 3 minutes de jeu sans casser aucun invariant', () => {
    const state = createSimulation({ seed: 777, map: VILLAGE_CHURCH });
    runTicks(state, 1800);

    for (const unit of state.units) {
      expect(unit.hp).toBeGreaterThanOrEqual(0);
      expect(unit.morale).toBeGreaterThanOrEqual(0);
      expect(unit.morale).toBeLessThanOrEqual(100);
      expect(unit.suppression).toBeGreaterThanOrEqual(0);
      expect(unit.x).toBeGreaterThanOrEqual(-1);
      expect(unit.x).toBeLessThanOrEqual(state.map.width + 1);
      expect(unit.y).toBeGreaterThanOrEqual(-1);
      expect(unit.y).toBeLessThanOrEqual(state.map.height + 1);
      if (unit.alive) expect(unit.hp).toBeGreaterThan(0);
    }

    // Le contact a bien eu lieu : sans tir, la simulation ne sert à rien.
    expect(state.stats.shotsFired).toBeGreaterThan(50);
    expect(state.tick).toBeGreaterThan(100);
    expect(summarize(state)).toContain('tick=');
  });

  it('conclut la partie quand un camp est anéanti', () => {
    const state = createSimulation({ seed: 99, map: TEST_MAP });
    for (const unit of state.units) {
      if (unit.faction === 'marteau') unit.alive = false;
    }
    runTicks(state, 5);
    expect(state.over).not.toBeNull();
    expect(state.over?.winner).toBe('penitents');
    expect(state.events.some((event) => event.type === 'gameOver' || event.type === 'kill')).toBe(true);
  });
});
