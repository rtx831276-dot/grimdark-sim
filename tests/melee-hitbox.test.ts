import { describe, expect, it } from 'vitest';
import { OPERATION_CARREFOUR } from '../src/data/maps/operation-carrefour';
import { createSimulation, fireSalvo, updateMeleeAttacks, MELEE_CLIPS, meleeHitboxIntersects } from '../src/sim';
import { updateSoldier } from '../src/sim/ai/soldierAI';

function setup() {
  const state = createSimulation({ seed: 7, map: OPERATION_CARREFOUR });
  const a = state.units.find(u => u.faction === 'penitents')!;
  const b = state.units.find(u => u.faction === 'marteau')!;
  for (const u of state.units) if (u !== a && u !== b) u.alive = false;
  Object.assign(a, { x: 15.5, y: 17.5, cooldown: 0, shotsFired: 0, goal: null, stance: 'advance', state: 'idle' });
  Object.assign(b, { x: 16.5, y: 17.5, cooldown: 0, goal: null, stance: 'advance', state: 'idle' });
  return { state, a, b };
}
function impact(state: ReturnType<typeof setup>['state'], tick: number) {
  while (state.tick < tick) { state.tick++; state.events = []; updateMeleeAttacks(state); }
}

describe('hitboxes de mêlée', () => {
  const zone = { reach: 1, halfAngle: Math.PI / 4 };
  it('teste portée, direction et recouvrement partiel du disque de la cible', () => {
    expect(meleeHitboxIntersects(0, 0, 0, zone, 0.8, 0)).toBe(true);
    expect(meleeHitboxIntersects(0, 0, 0, zone, 1.2, 0)).toBe(true); // le bord de la cible entre dans l'arc
    expect(meleeHitboxIntersects(0, 0, 0, zone, 1.3, 0)).toBe(false);
    expect(meleeHitboxIntersects(0, 0, 0, zone, -1, 0)).toBe(false);
    expect(meleeHitboxIntersects(0, 0, 0, zone, 0, 0.9)).toBe(false);
    expect(meleeHitboxIntersects(0, 0, Math.PI / 2, zone, 0, 0.9)).toBe(true);
    expect(meleeHitboxIntersects(0, 0, Math.PI / 2, zone, 0.9, 0)).toBe(false);
    expect(meleeHitboxIntersects(0, 0, 0, zone, 0.5, 0.9)).toBe(false);
    expect(meleeHitboxIntersects(0, 0, 0, zone, 0.8, 0.8)).toBe(true);
  });

  it('une cible qui passe derrière l’attaquant esquive, sans recentrage automatique', () => {
    const { state, a, b } = setup();
    fireSalvo(state, a, b);
    const attack = a.meleeAttack!;
    b.x = a.x - 1; b.y = a.y;
    const hp = b.hp;
    updateSoldier(state, a, 0.1);
    expect(a.facing).toBe(attack.facing);
    impact(state, attack.impactTick);
    expect(b.hp).toBe(hp);
    expect(state.events.some(e => e.type === 'hit')).toBe(false);
  });

  it('touche un ennemi dans la zone même si la cible initiale s’est retirée, sans blesser les alliés', () => {
    const { state, a, b } = setup();
    const enemy = state.units.find(u => u.faction === b.faction && u !== b)!;
    const ally = state.units.find(u => u.faction === a.faction && u !== a)!;
    Object.assign(enemy, { alive: true, x: 16.3, y: 17.5 });
    Object.assign(ally, { alive: true, x: 16, y: 17.5 });
    fireSalvo(state, a, b);
    const attack = a.meleeAttack!;
    b.x = 20;
    const hpEnemy = enemy.hp, hpAlly = ally.hp, hpOriginal = b.hp;
    impact(state, attack.impactTick);
    expect(enemy.hp).toBeLessThan(hpEnemy);
    expect(ally.hp).toBe(hpAlly);
    expect(b.hp).toBe(hpOriginal);
    expect(state.events.filter(e => e.type === 'hit').map(e => e.targetId)).toEqual([enemy.id]);
  });

  it('le balayage choisi face à plusieurs ennemis touche au maximum deux cibles', () => {
    const { state, a, b } = setup();
    const others = state.units.filter(u => u.faction === b.faction && u !== b).slice(0, 2);
    Object.assign(others[0]!, { alive: true, x: 16.3, y: 17.1 });
    Object.assign(others[1]!, { alive: true, x: 16.3, y: 17.9 });
    a.shotsFired = 2;
    fireSalvo(state, a, b);
    expect(a.meleeAttack?.clip).toBe('Leg_Sweep');
    const hp = [b, ...others].map(u => u.hp);
    impact(state, a.meleeAttack!.impactTick);
    const damaged = [b, ...others].filter((u, i) => u.hp < hp[i]!);
    expect(damaged).toHaveLength(2);
    expect(state.events.filter(e => e.type === 'hit')).toHaveLength(2);
  });

  it('propose des techniques ayant portée, durée, angle et dégâts distincts', () => {
    expect(MELEE_CLIPS).toHaveLength(30);
    expect(new Set(MELEE_CLIPS.map(m => m.label)).size).toBe(30);
    expect(new Set(MELEE_CLIPS.map(m => m.durationTicks)).size).toBeGreaterThan(1);
    expect(new Set(MELEE_CLIPS.map(m => m.reach)).size).toBeGreaterThan(1);
    expect(new Set(MELEE_CLIPS.map(m => m.halfAngle)).size).toBeGreaterThan(1);
    expect(new Set(MELEE_CLIPS.map(m => m.damageScale)).size).toBeGreaterThan(1);
    for (const move of MELEE_CLIPS) expect(move.impactOffset).toBeLessThan(move.durationTicks);
  });
});
