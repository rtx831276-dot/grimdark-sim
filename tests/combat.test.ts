import { describe, expect, it } from 'vitest';
import { applyDamage, effectiveAccuracy, fireSalvo } from '../src/sim/combat';
import { createSimulation } from '../src/sim/simulation';
import type { SimState, Unit } from '../src/sim/types';
import { TEST_MAP } from './fixtures/test-map';

function setUp(seed = 5): SimState {
  return createSimulation({ seed, map: TEST_MAP });
}

/** Téléporte une unité hors de tout chemin : pratique pour tester une situation précise. */
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

function facingPair(state: SimState): { shooter: Unit; target: Unit } {
  const shooter = state.units.find((unit) => unit.faction === 'penitents' && unit.defId === 'fusilier')!;
  const target = state.units.find((unit) => unit.faction === 'marteau' && unit.defId === 'fusilier')!;
  park(shooter, 0.5, 0.5);
  park(target, 4.5, 0.5);
  target.hp = 10_000; // évite la mort prématurée : on mesure la suppression
  target.maxHp = 10_000;
  return { shooter, target };
}

describe('précision', () => {
  it('reste dans des bornes raisonnables', () => {
    const state = setUp();
    const { shooter, target } = facingPair(state);
    const accuracy = effectiveAccuracy(state, shooter, target, 4);
    expect(accuracy).toBeGreaterThan(0.05);
    expect(accuracy).toBeLessThan(0.95);
  });

  it('chute quand la cible est à couvert', () => {
    const state = setUp();
    const { shooter, target } = facingPair(state);
    park(target, 4.5, 0.5);
    const inOpen = effectiveAccuracy(state, shooter, target, 4);
    park(target, 4.5, 5.5); // tranchée
    const inTrench = effectiveAccuracy(state, shooter, target, 5);
    expect(inTrench).toBeLessThan(inOpen);
  });

  it('chute quand le tireur est supprimé ou démoralisé', () => {
    const state = setUp();
    const { shooter, target } = facingPair(state);
    const calm = effectiveAccuracy(state, shooter, target, 4);
    shooter.suppression = 100;
    const suppressed = effectiveAccuracy(state, shooter, target, 4);
    expect(suppressed).toBeLessThan(calm);
    shooter.suppression = 0;
    shooter.morale = 10;
    expect(effectiveAccuracy(state, shooter, target, 4)).toBeLessThan(calm);
  });
});

describe('salves', () => {
  it('produit des événements, consume le temps de recharge et supprime la cible', () => {
    const state = setUp();
    const { shooter, target } = facingPair(state);
    const before = target.suppression;

    fireSalvo(state, shooter, target);

    expect(shooter.cooldown).toBeGreaterThan(0);
    expect(state.stats.shotsFired).toBeGreaterThan(0);
    expect(target.suppression).toBeGreaterThan(before);
    expect(state.events.some((event) => event.type === 'shot')).toBe(true);
    expect(state.events.every((event) => event.tick === state.tick)).toBe(true);
  });

  it('finit par tuer une cible sans couverture en tirant en boucle', () => {
    const state = setUp(11);
    const { shooter, target } = facingPair(state);
    target.hp = 40;
    target.maxHp = 40;
    for (let i = 0; i < 80 && target.alive; i++) {
      shooter.cooldown = 0;
      shooter.suppression = 0;
      fireSalvo(state, shooter, target);
    }
    expect(target.alive).toBe(false);
    expect(state.stats.kills).toBeGreaterThan(0);
    expect(shooter.kills).toBeGreaterThan(0);
  });

  it('cloue au sol une cible arrosée par une mitrailleuse', () => {
    const state = setUp(3);
    const mg = state.units.find((unit) => unit.faction === 'marteau' && unit.defId === 'mitrailleur')!;
    const target = state.units.find((unit) => unit.faction === 'penitents' && unit.defId === 'fusilier')!;
    park(mg, 0.5, 0.5);
    park(target, 6.5, 0.5);
    target.hp = 10_000;

    for (let i = 0; i < 4; i++) {
      mg.cooldown = 0;
      fireSalvo(state, mg, target);
    }
    expect(target.suppression).toBeGreaterThanOrEqual(55);
    expect(target.state).toBe('pinned');
  });
});

describe('pertes', () => {
  it('la mort d un camarade proche effondre le moral des voisins', () => {
    const state = setUp(9);
    const victim = state.units.find((unit) => unit.faction === 'marteau' && unit.defId === 'fusilier')!;
    const friend = state.units.find((unit) => unit.faction === 'marteau' && unit.defId === 'fusilier' && unit.id !== victim.id)!;
    park(victim, 5.5, 3.5);
    park(friend, 6.5, 3.5);
    friend.morale = 80;

    applyDamage(state, victim, 10_000, { kind: 'kinetic' });

    expect(victim.alive).toBe(false);
    expect(friend.morale).toBeLessThan(80);
    expect(state.events.some((event) => event.type === 'kill')).toBe(true);
  });

  it('la mort d un officier coûte plus cher que celle d un soldat', () => {
    const withSergeant = setUp(13);
    const sergeant = withSergeant.units.find((unit) => unit.faction === 'marteau' && unit.defId === 'sergent')!;
    const witnessA = withSergeant.units.find((unit) => unit.faction === 'marteau' && unit.defId === 'fusilier')!;
    park(sergeant, 5.5, 3.5);
    park(witnessA, 6.5, 3.5);
    witnessA.morale = 80;
    applyDamage(withSergeant, sergeant, 10_000, { kind: 'kinetic' });
    const lossFromSergeant = 80 - witnessA.morale;

    const withSoldier = setUp(13);
    const soldier = withSoldier.units.find((unit) => unit.faction === 'marteau' && unit.defId === 'fusilier')!;
    const witnessB = withSoldier.units.find(
      (unit) => unit.faction === 'marteau' && unit.defId === 'fusilier' && unit.id !== soldier.id,
    )!;
    park(soldier, 5.5, 3.5);
    park(witnessB, 6.5, 3.5);
    witnessB.morale = 80;
    applyDamage(withSoldier, soldier, 10_000, { kind: 'kinetic' });
    const lossFromSoldier = 80 - witnessB.morale;

    expect(lossFromSergeant).toBeGreaterThan(lossFromSoldier);
  });
});
