import { describe, expect, it } from 'vitest';
import { FpsFeedback } from '../src/render/fps-feedback';
import type { SimEvent } from '../src/sim';

const event = (type: SimEvent['type'], unitId: number, targetId?: number): SimEvent => ({ tick: 1, type, unitId, targetId });

describe('retours visuels FPS', () => {
  it('ne signale une touche que si le joueur a réellement touché un autre soldat', () => {
    const feedback = new FpsFeedback();
    feedback.ingest([event('shot', 7, 8)], 7, 40, 40);
    expect(feedback.showHit).toBe(false);
    feedback.ingest([event('hit', 8, 7)], 7, 40, 38);
    expect(feedback.showHit).toBe(false);
    expect(feedback.showHurt).toBe(true);
    feedback.ingest([event('hit', 7, 8)], 7, 38, 38);
    expect(feedback.showHit).toBe(true);
    expect(feedback.isKill).toBe(false);
    feedback.advance(.29);
    expect(feedback.showHit).toBe(false);
    expect(feedback.showHurt).toBe(true);
    feedback.advance(.3);
    expect(feedback.showHurt).toBe(false);
  });
  it('distingue une élimination attribuée au joueur et remet tout à zéro', () => {
    const feedback = new FpsFeedback();
    feedback.ingest([event('kill', 8, 7)], 7, 40, 40);
    expect(feedback.isKill).toBe(true);
    feedback.advance(0);
    expect(feedback.isKill).toBe(true);
    feedback.reset();
    expect(feedback.showHit).toBe(false);
    expect(feedback.showHurt).toBe(false);
    feedback.ingest([event('kill', 7, 8)], 7, 40, 0);
    expect(feedback.showHit).toBe(false);
    expect(feedback.showHurt).toBe(true);
  });
  it('détecte les dégâts explosifs sans événement hit et ne signale pas les soins', () => {
    const feedback = new FpsFeedback();
    feedback.ingest([event('explosion', 8)], 7, 40, 20);
    expect(feedback.showHurt).toBe(true);
    feedback.reset();
    feedback.ingest([], 7, 20, 30);
    expect(feedback.showHurt).toBe(false);
  });
});
