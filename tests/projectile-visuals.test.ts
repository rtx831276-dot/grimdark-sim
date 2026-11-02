import { describe, expect, it } from 'vitest';
import { sampleBulletTrace } from '../src/render/projectile-visuals';
import type { SimEvent } from '../src/sim';

const trace: SimEvent = { tick: 1, type: 'bulletTrace', x: 1, y: 2, height: 0.9, tx: 6, ty: 2, targetHeight: 0.8 };
describe('représentation des projectiles', () => {
  it('interpole la balle et sa traînée sur le trajet réellement parcouru', () => {
    const sample = sampleBulletTrace(trace, .5)!;
    expect(sample.x).toBeCloseTo(3.5); expect(sample.y).toBeCloseTo(.85); expect(sample.z).toBe(2);
    expect(Math.hypot(sample.x - sample.tailX, sample.y - sample.tailY, sample.z - sample.tailZ)).toBeCloseTo(.45);
    expect(Math.hypot(sample.dx, sample.dy, sample.dz)).toBeCloseTo(1);
  });
  it('affiche brièvement le trajet des balles détruites puis les fait disparaître à l’impact', () => {
    const stopped = { ...trace, bulletEnd: true };
    expect(sampleBulletTrace(stopped, .5)).not.toBeNull();
    expect(sampleBulletTrace(stopped, 1)).toBeNull();
    expect(sampleBulletTrace(trace, 1)?.x).toBeCloseTo(6);
  });
  it('ignore les événements mal formés et les trajets vides', () => {
    expect(sampleBulletTrace({tick: 1, type: 'shot'}, .5)).toBeNull();
    expect(sampleBulletTrace({...trace, tx: NaN}, .5)).toBeNull();
    expect(sampleBulletTrace({...trace, tx: 1, ty: 2, targetHeight: .9}, .5)).toBeNull();
    expect(sampleBulletTrace(trace, NaN)).toBeNull();
  });
});
