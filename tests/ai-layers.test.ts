import { describe, expect, it } from 'vitest';
import { distance } from '../src/core/math';
import {
  alliesInShock,
  commanderDesignateObjective,
  commanderEffectiveCount,
  commanderFireSupportTarget,
  commanderSituation,
  enemyConcentration,
  nearestEnemy,
  squadLocalStrength,
  squadMovementIntent,
  squadShouldRally,
  SQUAD_TUNING,
  UNDEAD_ATTRACTION,
  UNDEAD_DOCTRINE,
  undeadAttractionScore,
  updateAi,
  updateCover,
} from '../src/sim';
import { createSimulation } from '../src/sim/simulation';
import type { SimState, Unit } from '../src/sim/types';
import { TEST_MAP } from './fixtures/test-map';

/**
 * Ces tests valident la DÉCOUPE de l'IA, pas une nouvelle mécanique : chaque couche doit
 * être exposée par l'API publique, et la couche non-morte doit être spécifiée sans être
 * active (aucune unité non-morte n'existe en V0).
 */

function setUp(seed = 12): SimState {
  return createSimulation({ seed, map: TEST_MAP });
}

function find(state: SimState, faction: string, defId: string): Unit {
  const unit = state.units.find((candidate) => candidate.faction === faction && candidate.defId === defId);
  if (!unit) throw new Error(`Unité introuvable: ${faction}/${defId}`);
  return unit;
}

function park(unit: Unit, x: number, y: number): void {
  unit.x = x;
  unit.y = y;
  unit.prevX = x;
  unit.prevY = y;
  unit.path = [];
  unit.pathIndex = 0;
  unit.pathGoal = null;
  unit.state = 'idle';
}

describe('couches d IA exposées par l API publique', () => {
  it('rend les quatre couches accessibles depuis src/sim', () => {
    expect(typeof updateAi).toBe('function');
    expect(typeof squadMovementIntent).toBe('function');
    expect(typeof commanderDesignateObjective).toBe('function');
    expect(typeof undeadAttractionScore).toBe('function');
  });

  it('une bataille avance en appelant directement la couche soldat', () => {
    const state = setUp();
    const before = state.units.filter((unit) => unit.alive).length;
    for (let i = 0; i < 20; i++) updateAi(state, 0.1);
    expect(state.units.filter((unit) => unit.alive).length).toBe(before);
    // La perception a bien tourné pour tout le monde.
    expect(state.units.every((unit) => !unit.alive || unit.cover >= 0)).toBe(true);
    expect(nearestEnemy(state, find(state, 'penitents', 'fusilier'))).toBeTruthy();
  });

  it('la couche soldat reste disponible pour l observation (couverture, menace)', () => {
    const state = setUp();
    const soldier = find(state, 'penitents', 'fusilier');
    updateCover(state, soldier);
    expect(soldier.cover).toBeGreaterThanOrEqual(0);
    expect(soldier.cover).toBeLessThanOrEqual(0.85);
  });
});

describe('couche escouade', () => {
  it('traduit la posture en intention de mouvement, sans déplacer personne', () => {
    const state = setUp();
    const soldier = find(state, 'penitents', 'fusilier');
    const startX = soldier.x;
    const startY = soldier.y;

    soldier.stance = 'hold';
    expect(squadMovementIntent(state, soldier).kind).toBe('hold');

    soldier.stance = 'fallback';
    const fallback = squadMovementIntent(state, soldier);
    expect(fallback.kind).toBe('fallback');
    if (fallback.kind === 'fallback') {
      expect(fallback.line).toEqual(TEST_MAP.fallbackLine.penitents);
    }

    soldier.stance = 'advance';
    const advance = squadMovementIntent(state, soldier);
    expect(advance.kind).toBe('advance');
    if (advance.kind === 'advance') {
      expect(TEST_MAP.objectives.map((objective) => objective.id)).toContain(advance.objective.id);
    }

    expect(soldier.x).toBe(startX);
    expect(soldier.y).toBe(startY);
  });

  it('ne demande un ralliement que si la ligne flanche vraiment', () => {
    const state = setUp();
    const officer = find(state, 'penitents', 'sergent');
    expect(alliesInShock(state, officer)).toBe(0);
    expect(squadShouldRally(state, officer)).toBe(false);

    const allies = state.units.filter((unit) => unit.faction === 'penitents' && unit.id !== officer.id);
    for (const ally of allies.slice(0, SQUAD_TUNING.rallyThreshold)) ally.suppression = SQUAD_TUNING.shockSuppression + 10;

    expect(alliesInShock(state, officer)).toBeGreaterThanOrEqual(SQUAD_TUNING.rallyThreshold);
    expect(squadShouldRally(state, officer)).toBe(true);
  });

  it('mesure la cohésion locale d une escouade', () => {
    const state = setUp();
    const soldier = find(state, 'penitents', 'fusilier');
    park(soldier, 5.5, 3.5);
    let near = 0;
    for (const other of state.units) {
      if (!other.alive || other.faction !== 'penitents' || other.id === soldier.id) continue;
      park(other, 6.5, 3.5);
      near++;
    }
    expect(squadLocalStrength(state, soldier, 3)).toBe(near);
    expect(squadLocalStrength(state, soldier, 0.5)).toBe(0);
  });
});

describe('couche commandement', () => {
  it('désigne un objectif existant sur la carte', () => {
    const state = setUp();
    const soldier = find(state, 'penitents', 'fusilier');
    const objective = commanderDesignateObjective(state, soldier);
    expect(TEST_MAP.objectives.map((entry) => entry.id)).toContain(objective.id);
    expect(objective.value).toBeGreaterThan(0);
  });

  it('calcule la concentration ennemie, et rien s il n y a plus d ennemi', () => {
    const state = setUp();
    expect(enemyConcentration(state, 'penitents')).not.toBeNull();
    for (const unit of state.units) {
      if (unit.faction === 'marteau') unit.alive = false;
    }
    expect(enemyConcentration(state, 'penitents')).toBeNull();
  });

  it('compte les effectifs opérationnels en excluant les démoralisés', () => {
    const state = setUp();
    const total = state.units.filter((unit) => unit.alive && unit.faction === 'marteau').length;
    expect(commanderEffectiveCount(state, 'marteau')).toBe(total);
    const broken = find(state, 'marteau', 'fusilier');
    broken.state = 'broken';
    expect(commanderEffectiveCount(state, 'marteau')).toBe(total - 1);
    expect(commanderSituation(state, 'marteau').effectiveUnits).toBe(total - 1);
  });

  it('ne gaspille pas de barrage sans observateur, ni sans groupe ennemi visible', () => {
    const state = setUp();
    const soldier = find(state, 'penitents', 'fusilier');
    expect(commanderFireSupportTarget(state, soldier)).toBeNull(); // pas d'artillerie

    const observer = find(state, 'penitents', 'observateur');
    park(observer, 1.5, 3.5);

    // Un seul ennemi isolé ne vaut pas 5 obus.
    for (const unit of state.units) {
      if (unit.faction === 'marteau') unit.alive = false;
    }
    const lone = state.units.find((unit) => unit.faction === 'marteau')!;
    lone.alive = true;
    park(lone, 6.5, 3.5);
    expect(commanderFireSupportTarget(state, observer)).toBeNull();

    // Un groupe dense et visible, oui.
    const squad = state.units.filter((unit) => unit.faction === 'marteau').slice(0, 3);
    squad.forEach((unit, index) => {
      unit.alive = true;
      park(unit, 6.5 + index * 0.7, 3.5 + (index % 2) * 0.6);
    });
    const target = commanderFireSupportTarget(state, observer);
    expect(target).not.toBeNull();
    expect(distance(target!.x, target!.y, 7.2, 3.8)).toBeLessThan(2);
  });
});

describe('couche non-morte (spécifiée, non câblée en V0)', () => {
  it('n attire aucune unité en V0 : aucune unité non-morte n existe dans l état', () => {
    const state = setUp();
    expect(state.units.some((unit) => unit.faction === 'undead')).toBe(false);
    expect(state.units.every((unit) => unit.faction === 'penitents' || unit.faction === 'marteau')).toBe(true);
  });

  it('est déplacée d abord par le bruit, puis par les vivants, puis par les cadavres', () => {
    expect(UNDEAD_ATTRACTION.noise).toBeGreaterThan(UNDEAD_ATTRACTION.living);
    expect(UNDEAD_ATTRACTION.living).toBeGreaterThan(UNDEAD_ATTRACTION.corpses);

    const noisy = undeadAttractionScore({ noise: 1, corpses: 0, living: 0, distanceFromHorde: 0 });
    const lively = undeadAttractionScore({ noise: 0, corpses: 0, living: 1, distanceFromHorde: 0 });
    const corpses = undeadAttractionScore({ noise: 0, corpses: 1, living: 0, distanceFromHorde: 0 });
    expect(noisy).toBeGreaterThan(lively);
    expect(lively).toBeGreaterThan(corpses);
  });

  it('reste bornée et pénalise l éloignement de la horde', () => {
    const close = undeadAttractionScore({ noise: 1, corpses: 1, living: 1, distanceFromHorde: 0 });
    const far = undeadAttractionScore({ noise: 1, corpses: 1, living: 1, distanceFromHorde: 40 });
    expect(close).toBeLessThanOrEqual(1);
    expect(close).toBeGreaterThanOrEqual(0);
    expect(far).toBeLessThan(close);
    expect(undeadAttractionScore({ noise: 9, corpses: 9, living: 9, distanceFromHorde: -5 })).toBeLessThanOrEqual(1);
    expect(UNDEAD_DOCTRINE.length).toBeGreaterThan(20);
  });
});
