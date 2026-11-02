import { describe, expect, it } from 'vitest';
import { selectAudibleEvents, BattleAudio } from '../src/audio/battle-audio';
import type { SimEvent } from '../src/sim';

const at = (type: SimEvent['type'], x: number, y: number): SimEvent => ({ tick: 1, type, x, y });

describe('effets sonores procéduraux', () => {
  it('reste coupé par défaut et ne crée pas de contexte lors de la construction', () => {
    const sound = new BattleAudio();
    expect(sound.enabled).toBe(false);
    expect(sound.available).toBe(true);
    sound.playEvents([at('shot', 0, 0)], {x: 0, y: 0, yaw: 0});
    sound.dispose();
  });
  it('sélectionne des événements proches, plafonne leur nombre et privilégie les explosions', () => {
    const events = [at('shot', 0, 0), at('explosion', 0, 0), at('impact', 1, 0), at('shot', 100, 0), at('hit', 0, 0)];
    const snapshot = JSON.stringify(events);
    const chosen = selectAudibleEvents(events, {x: 0, y: 0, yaw: 0}, 2);
    expect(chosen.map(e => e.kind)).toEqual(['explosion', 'shot']);
    expect(JSON.stringify(events)).toBe(snapshot);
  });
  it('atténue et répartit gauche/droite selon la position et la direction du joueur', () => {
    const events = [at('shot', 0, 5), at('shot', 0, -5), at('shot', 0, 20)];
    const chosen = selectAudibleEvents(events, {x: 0, y: 0, yaw: 0});
    expect(chosen[0]!.pan).toBeGreaterThan(0);
    expect(chosen[1]!.pan).toBeLessThan(0);
    expect(chosen[2]!.volume).toBeLessThan(chosen[0]!.volume);
    expect(selectAudibleEvents([at('shot', 0, 5)], {x: 0, y: 0, yaw: Math.PI})[0]!.pan).toBeLessThan(0);
  });
  it('ignore les positions absentes ou invalides ainsi que les événements visuels seuls', () => {
    expect(selectAudibleEvents([{tick: 0, type:'shot'}, at('impact', NaN, 1), at('bulletTrace', 0, 0)], {x:0,y:0,yaw:0})).toEqual([]);
  });
});

it('déclenche des pas à distance parcourue, seulement pour les vivants et les proches', async () => {
  const { FootstepTracker } = await import('../src/audio/footsteps');
  const tracker = new FootstepTracker();
  const unit = {id:1, alive:true, x:0.2, y:0, prevX:0, prevY:0};
  expect(tracker.collect([unit], {x:0,y:0}, 1)).toHaveLength(0);
  expect(tracker.collect([unit], {x:0,y:0}, 2)).toHaveLength(0);
  expect(tracker.collect([unit], {x:0,y:0}, 3)).toHaveLength(1);
  tracker.clear();
  expect(tracker.collect([{...unit, alive:false}], {x:0,y:0}, 4)).toHaveLength(0);
  for (let i = 0; i < 5; i++) expect(tracker.collect([{...unit, x:100, prevX:99.8}], {x:0,y:0}, i)).toHaveLength(0);
});

it('limite le nombre de pas simultanés et privilégie les soldats les plus proches', async () => {
  const { FootstepTracker } = await import('../src/audio/footsteps');
  const tracker = new FootstepTracker();
  const units = Array.from({length: 6}, (_, i) => ({id:i, alive:true, x:i + 0.3, y:0, prevX:i, prevY:0}));
  expect(tracker.collect(units, {x:0,y:0}, 1)).toHaveLength(0);
  const steps = tracker.collect(units, {x:0,y:0}, 2);
  expect(steps.map(s => s.unitId)).toEqual([0,1,2]);
  tracker.clear(); expect(tracker.collect(units, {x:0,y:0}, 3)).toHaveLength(0);
});
