import { describe, expect, it } from 'vitest';
import { OPERATION_CARREFOUR } from '../src/data/maps/operation-carrefour';
import type { MapDefinition } from '../src/data/map-types';
import { createSimulation, issueOrder, stepSimulation } from '../src/sim/simulation';
import { COMMS_FACTION_COOLDOWN, COMMS_LIFETIME_TICKS, COMMS_SPEAKER_COOLDOWN, reportForTarget, updateCommunications } from '../src/sim/ai/communications';
import { selectMeleeTarget } from '../src/sim/ai/meleeAI';
import { updateSoldier } from '../src/sim/ai/soldierAI';
import { Effects } from '../src/render/effects';
import type { Unit } from '../src/sim/types';

const OPEN: MapDefinition = {
  ...OPERATION_CARREFOUR, id: 'comms-test', width: 32, height: 12,
  rows: Array.from({ length: 12 }, () => '.'.repeat(32)),
  scatter: { ...OPERATION_CARREFOUR.scatter, region: { x: 0, y: 0, w: 32, h: 12 }, craters: 0, rubble: 0, trees: 0, water: 0 },
  objectives: [{ id: 'centre', label: 'Centre', x: 16.5, y: 6.5, radius: 2, value: 1 }],
  deployment: { penitents: { x: 1, y: 1, w: 5, h: 10 }, marteau: { x: 26, y: 1, w: 5, h: 10 } },
  fallbackLine: { penitents: { x: 1.5, y: 6.5 }, marteau: { x: 30.5, y: 6.5 } },
};
function place(unit: Unit, x: number, y: number): void {
  unit.x = unit.prevX = x; unit.y = unit.prevY = y;
  unit.state = 'idle'; unit.stance = 'advance'; unit.goal = null;
  unit.forcedTargetId = null; unit.targetId = null; unit.path = []; unit.pathGoal = null; unit.nextRepathTick = 0;
}
function setup(map = OPEN) {
  const state = createSimulation({ seed: 31, map });
  const scout = state.units.find(u => u.faction === 'penitents' && u.defId === 'modern_recon_melee')!;
  const ally = state.units.find(u => u.faction === 'penitents' && u.defId === 'modern_fighter')!;
  const extra = state.units.find(u => u.faction === 'penitents' && u.defId === 'modern_assault_melee')!;
  const enemy = state.units.find(u => u.faction === 'marteau' && u.defId === 'modern_fighter')!;
  for (const unit of state.units) unit.alive = [scout, ally, enemy].includes(unit);
  place(scout, 10.5, 5.5); place(ally, 4.5, 5.5); place(enemy, 25, 5.5); place(extra, 0.5, 0.5);
  state.tick = 1;
  return { state, scout, ally, extra, enemy };
}

describe('communications tactiques', () => {
  it('transmet une détection à un allié proche qui ne voyait pas lui-même l’ennemi', () => {
    const { state, scout, ally, enemy } = setup();
    expect(selectMeleeTarget(state, ally)).toBeNull();
    updateCommunications(state);
    expect(state.events).toContainEqual(expect.objectContaining({ type: 'communication', unitId: scout.id, targetId: enemy.id, label: 'Ennemi repéré !' }));
    expect(reportForTarget(state, ally, enemy)?.kind).toBe('contact');
    expect(selectMeleeTarget(state, ally)?.id).toBe(enemy.id);
    updateSoldier(state, ally, 0.1);
    expect(ally.targetId).toBe(enemy.id);
    expect(ally.x).toBeGreaterThan(4.5);
    const effects = new Effects();
    effects.spawnFromEvents(state, state.events);
    expect(effects.list).toContainEqual(expect.objectContaining({ kind: 'speech', unitId: scout.id, label: 'Ennemi repéré !' }));
  });

  it('ne transmet pas sans allié à proximité ni à un soldat arrivé après le message', () => {
    const { state, scout, ally, enemy, extra } = setup();
    ally.alive = false;
    updateCommunications(state);
    expect(state.communications.reports).toHaveLength(0);
    ally.alive = true;
    updateCommunications(state);
    expect(reportForTarget(state, ally, enemy)).not.toBeNull();
    extra.alive = true;
    place(extra, scout.x - 1, scout.y);
    expect(reportForTarget(state, extra, enemy)).toBeNull();
  });

  it('respecte les murs : personne ne signale ni ne détecte un ennemi invisible', () => {
    const rows = OPEN.rows.map(row => row.slice(0, 15) + '#' + row.slice(16));
    const { state, ally } = setup({ ...OPEN, rows });
    updateCommunications(state);
    expect(state.events.filter(event => event.type === 'communication')).toHaveLength(0);
    expect(selectMeleeTarget(state, ally)).toBeNull();
  });

  it('expire les messages et ignore une cible morte ou trop éloignée du dernier signalement', () => {
    const { state, ally, enemy } = setup();
    updateCommunications(state);
    expect(reportForTarget(state, ally, enemy)).not.toBeNull();
    enemy.x += 3;
    expect(reportForTarget(state, ally, enemy)).toBeNull();
    enemy.x -= 3;
    enemy.alive = false;
    expect(reportForTarget(state, ally, enemy)).toBeNull();
    enemy.alive = true;
    state.tick += COMMS_LIFETIME_TICKS;
    expect(reportForTarget(state, ally, enemy)).toBeNull();
    // Aucun nouvel appel ne peut masquer la vérification d'expiration.
    for (const u of state.units) u.alive = false;
    updateCommunications(state);
    expect(state.communications.reports).toHaveLength(0);
  });

  it('limite la fréquence des appels par camp et par soldat', () => {
    const { state, scout } = setup();
    updateCommunications(state);
    expect(state.communications.nextSpeakerTick[scout.id]).toBe(1 + COMMS_SPEAKER_COOLDOWN);
    expect(state.communications.nextFactionTick[scout.faction]).toBe(1 + COMMS_FACTION_COOLDOWN);
    for (let tick = 2; tick <= COMMS_SPEAKER_COOLDOWN; tick++) {
      state.tick = tick;
      updateCommunications(state);
    }
    expect(state.events.filter(event => event.type === 'communication')).toHaveLength(1);
    state.tick = 1 + COMMS_SPEAKER_COOLDOWN;
    updateCommunications(state);
    expect(state.events.filter(event => event.type === 'communication')).toHaveLength(2);
  });

  it('un allié blessé demande de l’aide et le destinataire privilégie sa menace', () => {
    const { state, scout, ally, enemy } = setup();
    const enemy2 = state.units.find(u => u.faction === 'marteau' && u.id !== enemy.id)!;
    enemy2.alive = true;
    place(ally, 4.5, 5.5); place(scout, 8.5, 5.5); place(enemy, 7.5, 5.5); place(enemy2, 6.3, 5.5);
    scout.hp = scout.maxHp * 0.4;
    state.communications.nextSpeakerTick[ally.id] = 100;
    expect(selectMeleeTarget(state, ally)?.id).toBe(enemy2.id);
    updateCommunications(state);
    expect(state.events).toContainEqual(expect.objectContaining({ type: 'communication', unitId: scout.id, label: 'Besoin de renfort !' }));
    expect(reportForTarget(state, ally, enemy)?.kind).toBe('help');
    expect(selectMeleeTarget(state, ally)?.id).toBe(enemy.id);
  });

  it('ne remplace pas les ordres directs ni la posture tenir', () => {
    const { state, ally } = setup();
    updateCommunications(state);
    expect(issueOrder(state, { type: 'hold', units: [ally.id] })).toBe(true);
    const x = ally.x;
    updateSoldier(state, ally, 0.1);
    expect(ally.x).toBe(x);
    expect(issueOrder(state, { type: 'move', units: [ally.id], x: 1.5, y: 5.5 })).toBe(true);
    updateSoldier(state, ally, 0.1);
    expect(ally.goal).not.toBeNull();
    expect(ally.intent).toBe('ordre: déplacement');
  });

  it('produit les mêmes messages pour la même graine', () => {
    const run = () => {
      const { state } = setup();
      const log: string[] = [];
      for (let i = 0; i < 80 && !state.over; i++) {
        for (const e of stepSimulation(state)) if (e.type === 'communication') log.push(`${e.tick}:${e.unitId}:${e.targetId}:${e.label}`);
      }
      return log;
    };
    const first = run();
    expect(first.length).toBeGreaterThan(0);
    expect(run()).toEqual(first);
  });
});
