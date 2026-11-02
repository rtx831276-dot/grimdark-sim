import { describe, expect, it } from 'vitest';
import { skyColor } from '../src/render/sky';

describe('ciel procédural', () => {
  it('produit un ciel plus lumineux à l’horizon avec des couleurs bornées', () => {
    const horizon = skyColor(0), zenith = skyColor(1), bottom = skyColor(-1);
    expect(horizon[0]).toBeGreaterThan(zenith[0]);
    expect(horizon[1]).toBeGreaterThan(bottom[1]);
    for (const y of [-2,-1,-0.5,0,0.5,1,2]) for (const value of skyColor(y)) expect(value).toBeGreaterThanOrEqual(0);
    for (const y of [-2,-1,-0.5,0,0.5,1,2]) for (const value of skyColor(y)) expect(value).toBeLessThanOrEqual(255);
  });
});
