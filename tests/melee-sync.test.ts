import { describe, expect, it } from 'vitest';
import { OPERATION_CARREFOUR } from '../src/data/maps/operation-carrefour';
import { fireSalvo, updateMeleeAttacks, applyDamage } from '../src/sim/combat';
import { MELEE_CLIPS, MELEE_DURATION_TICKS } from '../src/sim/melee-timing';
import { createSimulation, issueOrder } from '../src/sim/simulation';
import { Effects } from '../src/render/effects';

function scene() {
  const state = createSimulation({ seed: 3, map: OPERATION_CARREFOUR });
  const a = state.units.find(u => u.faction === 'penitents')!;
  const b = state.units.find(u => u.faction === 'marteau')!;
  for (const u of state.units) if (u !== a && u !== b) u.alive = false;
  Object.assign(a, { x: 15.5, y: 17.5, prevX: 15.5, prevY: 17.5, cooldown: 0, shotsFired: 0, goal: null, state: 'idle', stance: 'advance' });
  Object.assign(b, { x: 16.5, y: 17.5, prevX: 16.5, prevY: 17.5, cooldown: 0, shotsFired: 0, goal: null, state: 'idle', stance: 'advance' });
  // Réussite certaine pour isoler le calendrier de la précision aléatoire.
  state.rng.next = () => 0;
  return { state, a, b };
}
function until(state: ReturnType<typeof scene>['state'], tick: number) {
  while (state.tick < tick) { state.tick++; state.events = []; updateMeleeAttacks(state); }
}

describe('synchronisation de la mêlée', () => {
  it('démarre sans dégâts puis résout exactement une fois au tick marqué', () => {
    const { state, a, b } = scene();
    const hp = b.hp;
    fireSalvo(state, a, b);
    const attack = a.meleeAttack!;
    expect(attack).toBeTruthy();
    expect(attack.impactTick - attack.startTick).toBe(MELEE_CLIPS[0].impactOffset);
    expect(attack.endTick - attack.startTick).toBe(MELEE_DURATION_TICKS);
    expect(b.hp).toBe(hp);
    expect(state.events.some(e => e.type === 'melee')).toBe(true);
    const effects = new Effects();
    effects.spawnFromEvents(state, state.events);
    expect(effects.list).toHaveLength(0);
    until(state, attack.impactTick - 1);
    expect(b.hp).toBe(hp);
    until(state, attack.impactTick);
    expect(b.hp).toBeLessThan(hp);
    expect(state.events.filter(e => e.type === 'meleeImpact')).toHaveLength(1);
    expect(state.events.filter(e => e.type === 'hit')).toHaveLength(1);
    effects.spawnFromEvents(state, state.events);
    expect(effects.list.some(e => e.kind === 'impact')).toBe(true);
    const after = b.hp;
    until(state, attack.endTick);
    expect(b.hp).toBe(after);
    expect(a.meleeAttack).toBeNull();
  });

  it('rate si la cible sort de portée et ne touche pas si elle revient après', () => {
    const { state, a, b } = scene();
    fireSalvo(state, a, b);
    const attack = a.meleeAttack!;
    const hp = b.hp;
    b.x += 3;
    until(state, attack.impactTick);
    expect(b.hp).toBe(hp);
    expect(state.events.some(e => e.type === 'meleeImpact' || e.type === 'hit')).toBe(false);
    b.x -= 3;
    until(state, attack.endTick);
    expect(b.hp).toBe(hp);
  });

  it('un contact géométrique valide touche même sans jet de précision', () => {
    const { state, a, b } = scene();
    state.rng.next = () => 0.9999;
    fireSalvo(state, a, b);
    const hp = b.hp;
    until(state, a.meleeAttack!.impactTick);
    expect(b.hp).toBeLessThan(hp);
    expect(state.events.some(e => e.type === 'hit')).toBe(true);
  });

  it('annule un coup avant impact si l’attaquant meurt ou est démoralisé', () => {
    for (const reason of ['death', 'broken'] as const) {
      const { state, a, b } = scene();
      fireSalvo(state, a, b);
      const impact = a.meleeAttack!.impactTick;
      const hp = b.hp;
      if (reason === 'death') applyDamage(state, a, 10000, { kind: 'kinetic' });
      else a.state = 'broken';
      until(state, impact);
      expect(a.meleeAttack).toBeNull();
      expect(b.hp).toBe(hp);
    }
  });

  it('n’atteint pas une cible déjà morte ou cachée au moment du coup', () => {
    for (const reason of ['death', 'wall'] as const) {
      const { state, a, b } = scene();
      if (reason === 'wall') { a.x = 15.8; a.y = 17.8; b.x = 16.2; b.y = 18.2; }
      fireSalvo(state, a, b);
      const impact = a.meleeAttack!.impactTick;
      if (reason === 'death') b.alive = false;
      else {
        state.map.tiles[18 * state.map.width + 15]!.terrain = 'wall';
        state.map.tiles[17 * state.map.width + 16]!.terrain = 'wall';
      }
      const hp = b.hp;
      until(state, impact);
      expect(b.hp).toBe(hp);
      expect(state.events.some(e => e.type === 'hit')).toBe(false);
    }
  });

  it('respecte un ordre de déplacement ou de repli donné pendant le combo', () => {
    for (const kind of ['move', 'fallback'] as const) {
      const { state, a, b } = scene();
      fireSalvo(state, a, b);
      const attack = a.meleeAttack!;
      const hp = b.hp;
      const order = kind === 'move' ? { type: 'move' as const, units: [a.id], x: 12.5, y: 17.5 } : { type: 'fallback' as const, units: [a.id] };
      expect(issueOrder(state, order)).toBe(true);
      expect(a.meleeAttack).toBeNull();
      until(state, attack.impactTick);
      expect(b.hp).toBe(hp);
    }
  });

  it('refuse les attaques sans cible valide, hors portée ou déjà engagées', () => {
    const { state, a, b } = scene();
    b.x += 3;
    fireSalvo(state, a, b);
    expect(a.meleeAttack).toBeNull();
    b.x -= 3;
    fireSalvo(state, a, a);
    expect(a.meleeAttack).toBeNull();
    fireSalvo(state, a, b);
    const first = a.meleeAttack;
    fireSalvo(state, a, b);
    expect(a.meleeAttack).toBe(first);
    expect(a.shotsFired).toBe(1);
  });

  it('maintient des attaques indépendantes même quand les deux combattants frappent', () => {
    const { state, a, b } = scene();
    fireSalvo(state, a, b);
    fireSalvo(state, b, a);
    const aa = a.meleeAttack!, ba = b.meleeAttack!;
    expect(aa.targetId).toBe(b.id);
    expect(ba.targetId).toBe(a.id);
    until(state, Math.max(aa.impactTick, ba.impactTick));
    expect(a.hp).toBeLessThan(a.maxHp);
    expect(b.hp).toBeLessThan(b.maxHp);
  });
});
