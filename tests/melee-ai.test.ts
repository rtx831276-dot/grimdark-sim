import { describe, expect, it } from 'vitest';
import { OPERATION_CARREFOUR } from '../src/data/maps/operation-carrefour';
import type { MapDefinition } from '../src/data/map-types';
import { createSimulation, hashState, issueOrder, stepSimulation } from '../src/sim/simulation';
import { meleeApproachSlots, pursueMeleeTarget, selectMeleeTarget } from '../src/sim/ai/meleeAI';
import { updateSoldier } from '../src/sim/ai/soldierAI';
import { isSolid } from '../src/sim/map';
import type { Unit } from '../src/sim/types';

const OPEN: MapDefinition = {
  ...OPERATION_CARREFOUR,
  id: 'melee-open', width: 13, height: 9,
  rows: Array.from({ length: 9 }, () => '.'.repeat(13)),
  scatter: { ...OPERATION_CARREFOUR.scatter, region: { x: 0, y: 0, w: 13, h: 9 }, craters: 0, rubble: 0, trees: 0, water: 0 },
  objectives: [{ id: 'centre', label: 'Centre', x: 6.5, y: 4.5, radius: 2, value: 1 }],
  deployment: { penitents: { x: 1, y: 1, w: 3, h: 7 }, marteau: { x: 9, y: 1, w: 3, h: 7 } },
  fallbackLine: { penitents: { x: 0.5, y: 4.5 }, marteau: { x: 12.5, y: 4.5 } },
};

function scene(aCount: number, bCount: number, map = OPEN) {
  const state = createSimulation({ seed: 31, map });
  const a = state.units.filter(u => u.faction === 'penitents').slice(0, aCount);
  const b = state.units.filter(u => u.faction === 'marteau').slice(0, bCount);
  const active = new Set([...a, ...b]);
  for (const unit of state.units) if (!active.has(unit)) unit.alive = false;
  a.forEach((u, i) => place(u, 3.5, 2.5 + i * 1.5));
  b.forEach((u, i) => place(u, 9.5, 2.5 + i * 1.5));
  return { state, a, b };
}
function place(unit: Unit, x: number, y: number): void {
  unit.x = unit.prevX = x; unit.y = unit.prevY = y;
  unit.cooldown = 0; unit.path = []; unit.pathGoal = null; unit.nextRepathTick = 0;
}

describe('choix de cible en mêlée', () => {
  it('répartit le groupe entre adversaires disponibles sans abandonner une menace au contact', () => {
    const { state, a, b } = scene(3, 2);
    place(a[0]!, 4.5, 4.5); place(a[1]!, 4, 3.5); place(a[2]!, 4, 5.5);
    place(b[0]!, 8.5, 3.5); place(b[1]!, 8.5, 5.5);
    a[1]!.targetId = b[0]!.id; a[2]!.targetId = b[0]!.id;
    expect(selectMeleeTarget(state, a[0]!)?.id).toBe(b[1]!.id);
    place(b[0]!, 5.4, 4.5);
    expect(selectMeleeTarget(state, a[0]!)?.id).toBe(b[0]!.id);
  });

  it('réserve des positions différentes tout en restant à portée et sur un sol praticable', () => {
    const { state, a, b } = scene(2, 1);
    place(a[0]!, 3.5, 4.5); place(a[1]!, 3.5, 5.5); place(b[0]!, 7.5, 4.5);
    const first = meleeApproachSlots(state, a[0]!, b[0]!)[0]!;
    a[0]!.targetId = b[0]!.id;
    a[0]!.pathGoal = first;
    a[0]!.path = [first];
    const second = meleeApproachSlots(state, a[1]!, b[0]!)[0]!;
    expect(second).not.toEqual(first);
    for (const slot of [first, second]) {
      expect(isSolid(state.map, slot.x, slot.y)).toBe(false);
      expect(Math.hypot(slot.x - b[0]!.x, slot.y - b[0]!.y)).toBeLessThanOrEqual(1.3);
    }
  });

  it('respecte la cible désignée par le joueur et arrête de poursuivre une cible morte', () => {
    const { state, a, b } = scene(1, 2);
    const soldier = a[0]!;
    place(b[0]!, 4.5, 2.5); place(b[1]!, 8.5, 3.5);
    expect(issueOrder(state, { type: 'attack', units: [soldier.id], target: b[1]!.id })).toBe(true);
    updateSoldier(state, soldier, 0.1);
    expect(soldier.forcedTargetId).toBe(b[1]!.id);
    expect(soldier.targetId).toBe(b[1]!.id);
    b[1]!.alive = false;
    updateSoldier(state, soldier, 0.1);
    expect(soldier.forcedTargetId).toBeNull();
    expect(soldier.targetId).toBe(b[0]!.id);
  });

  it('respecte les ordres tenir et repli au lieu de courir après une cible éloignée', () => {
    const { state, a, b } = scene(1, 1);
    place(a[0]!, 5.5, 4.5); place(b[0]!, 8.5, 4.5);
    expect(issueOrder(state, { type: 'hold', units: [a[0]!.id] })).toBe(true);
    const start = { x: a[0]!.x, y: a[0]!.y };
    updateSoldier(state, a[0]!, 0.1);
    expect({ x: a[0]!.x, y: a[0]!.y }).toEqual(start);
    expect(issueOrder(state, { type: 'fallback', units: [a[0]!.id] })).toBe(true);
    updateSoldier(state, a[0]!, 0.1);
    expect(a[0]!.x).toBeLessThan(start.x);
    expect(a[0]!.intent).toBe('repli volontaire');
  });

  it('contourne un mur pour rejoindre une case de contact', () => {
    const rows = OPEN.rows.map((row, y) => y < 7 ? row.slice(0, 6) + '#' + row.slice(7) : row);
    const map = { ...OPEN, rows };
    const { state, a, b } = scene(1, 1, map);
    place(a[0]!, 3.5, 2.5); place(b[0]!, 9.5, 2.5);
    for (let i = 0; i < 160; i++) {
      state.tick++;
      pursueMeleeTarget(state, a[0]!, b[0]!, 0.1);
      expect(isSolid(state.map, a[0]!.x, a[0]!.y)).toBe(false);
      if (Math.hypot(a[0]!.x - b[0]!.x, a[0]!.y - b[0]!.y) <= 1.3) break;
    }
    expect(Math.hypot(a[0]!.x - b[0]!.x, a[0]!.y - b[0]!.y)).toBeLessThanOrEqual(1.3);
  });
});

describe('batailles de mêlée à plusieurs', () => {
  for (const [left, right] of [[1, 1], [1, 2], [1, 3], [2, 2], [3, 3]] as const) {
    it(`${left} contre ${right} : les deux camps combattent et la simulation est reproductible`, () => {
      const run = () => {
        const { state } = scene(left, right);
        const log: string[] = [];
        for (let i = 0; i < 350 && !state.over; i++) {
          for (const event of stepSimulation(state)) {
            if (event.type === 'melee') log.push(`${event.tick}:${event.unitId}:${event.targetId}`);
          }
        }
        return { state, log };
      };
      const first = run();
      const second = run();
      expect(first.log.length).toBeGreaterThan(1);
      expect(first.log.some(line => first.state.units[Number(line.split(':')[1]) - 1]?.faction === 'penitents')).toBe(true);
      expect(first.log.some(line => first.state.units[Number(line.split(':')[1]) - 1]?.faction === 'marteau')).toBe(true);
      expect(first.log).toEqual(second.log);
      expect(hashState(first.state)).toBe(hashState(second.state));
    });
  }
});
