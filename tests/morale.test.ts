import { describe, expect, it } from 'vitest';
import {
  addSuppression,
  applyMoraleShock,
  MORALE_SHATTERED,
  SUPPRESSION_PINNED,
  updateMorale,
  useRally,
} from '../src/sim/morale';
import { unitDef } from '../src/data/units';
import { createSimulation } from '../src/sim/simulation';
import type { SimState, Unit } from '../src/sim/types';
import { TEST_MAP } from './fixtures/test-map';

function setUp(seed = 21): SimState {
  return createSimulation({ seed, map: TEST_MAP });
}

function find(state: SimState, faction: string, defId: string): Unit {
  const unit = state.units.find((candidate) => candidate.faction === faction && candidate.defId === defId);
  if (!unit) throw new Error(`Unité introuvable: ${faction}/${defId}`);
  return unit;
}

describe('suppression', () => {
  it('cloue au sol une unité sous un feu nourri', () => {
    const state = setUp();
    const victim = find(state, 'penitents', 'fusilier');
    addSuppression(state, victim, 90);
    expect(victim.suppression).toBeGreaterThanOrEqual(SUPPRESSION_PINNED);
    expect(victim.state).toBe('pinned');
    expect(state.events.some((event) => event.type === 'pinned')).toBe(true);
  });

  it('se dissipe avec le temps et rend l unité à son commandement', () => {
    const state = setUp();
    const victim = find(state, 'penitents', 'fusilier');
    addSuppression(state, victim, 90);
    // 20 secondes de répit : la suppression se dissipe progressivement, pas instantanément.
    for (let i = 0; i < 200; i++) updateMorale(state, victim, 0.1);
    expect(victim.suppression).toBeLessThan(SUPPRESSION_PINNED);
    expect(victim.state).toBe('idle');
  });

  it('respecte la discipline : une sentinelle mécanisée encaisse sans se clouer', () => {
    const state = setUp();
    const walker = find(state, 'marteau', 'sentinelle');
    addSuppression(state, walker, 100);
    // Plafond mécanique à 40 : jamais clouée.
    expect(walker.suppression).toBeLessThanOrEqual(40);
    expect(walker.state).not.toBe('pinned');
  });
});

describe('moral', () => {
  it('cède sous les pertes et met l unité en fuite', () => {
    const state = setUp();
    const victim = find(state, 'penitents', 'fusilier');
    applyMoraleShock(state, victim, 120);
    expect(victim.morale).toBeLessThanOrEqual(MORALE_SHATTERED);
    expect(victim.state).toBe('broken');
    expect(state.events.some((event) => event.type === 'broken')).toBe(true);
  });

  it('les fanatiques ne se brisent jamais', () => {
    const state = setUp();
    const flagellant = find(state, 'penitents', 'flagellant');
    applyMoraleShock(state, flagellant, 300);
    expect(flagellant.morale).toBeGreaterThanOrEqual(55);
    expect(flagellant.state).not.toBe('broken');
  });

  it('remonte quand le calme revient, plus vite avec un officier à proximité', () => {
    /** 3 secondes de répit : assez pour mesurer la vitesse de récupération sans plafonner à 100. */
    const recover = (withLeader: boolean): number => {
      const state = setUp();
      const soldier = find(state, 'penitents', 'fusilier');
      soldier.morale = 30;
      soldier.sinceUnderFire = 99;
      for (const other of state.units) {
        if (other.faction !== 'penitents') continue;
        if (!unitDef(other.defId).abilities.includes('rally')) continue;
        // Officier soit collé au soldat, soit à l'autre bout du terrain (hors rayon).
        other.x = withLeader ? soldier.x + 1 : 10.5;
        other.y = withLeader ? soldier.y : 6.5;
      }
      for (let i = 0; i < 30; i++) updateMorale(state, soldier, 0.1);
      return soldier.morale;
    };

    const alone = recover(false);
    const supported = recover(true);
    expect(alone).toBeLessThan(100);
    expect(supported).toBeGreaterThan(alone);
  });

  it('s effrite sous le feu même sans être touché', () => {
    const state = setUp();
    const soldier = find(state, 'penitents', 'fusilier');
    soldier.morale = 70;
    soldier.suppression = 60;
    // Le feu est continu : à chaque tick, l'unité vient de recevoir des balles.
    for (let i = 0; i < 50; i++) {
      soldier.sinceUnderFire = 0;
      updateMorale(state, soldier, 0.1);
    }
    expect(soldier.morale).toBeLessThan(70);
  });
});

describe('ralliement', () => {
  it('redonne du moral et récupère une unité brisée', () => {
    const state = setUp();
    const sergeant = find(state, 'penitents', 'sergent');
    const broken = find(state, 'penitents', 'fusilier');
    broken.x = sergeant.x + 1;
    broken.y = sergeant.y;
    applyMoraleShock(state, broken, 200);
    expect(broken.state).toBe('broken');

    const affected = useRally(state, sergeant);
    expect(affected).toBeGreaterThan(0);
    expect(broken.morale).toBeGreaterThan(MORALE_SHATTERED);
    expect(broken.state).toBe('idle');
  });
});
