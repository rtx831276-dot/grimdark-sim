import { describe, expect, it } from 'vitest';
import { FpsWeaponMotion } from '../src/render/fps-weapon-motion';

const idle = { aiming: false, moving: false, reloadProgress: null, shots: 0 };

describe('maniement visuel FPS', () => {
  it('fait entrer et sortir la visée progressivement', () => {
    const motion = new FpsWeaponMotion(0);
    const start = motion.update(.02, { ...idle, aiming: true });
    expect(start.aim).toBeGreaterThan(0); expect(start.aim).toBeLessThan(1);
    for (let i = 0; i < 30; i++) motion.update(.02, { ...idle, aiming: true });
    const aimed = motion.update(.02, { ...idle, aiming: true });
    expect(aimed.aim).toBeGreaterThan(.99);
    const released = motion.update(.1, idle);
    expect(released.aim).toBeLessThan(aimed.aim);
  });
  it('réagit à chaque tir, s’amortit et ne rejoue pas le même tir en boucle', () => {
    const motion = new FpsWeaponMotion(0);
    expect(motion.update(.02, { ...idle, shots: 3 }).recoil).toBe(1);
    const reduced = motion.update(.1, { ...idle, shots: 3 }).recoil;
    expect(reduced).toBeGreaterThan(0); expect(reduced).toBeLessThan(1);
    expect(motion.update(.02, { ...idle, shots: 6 }).recoil).toBe(1);
  });
  it('fige les animations en pause et ne consomme pas un tir avant la reprise', () => {
    const motion = new FpsWeaponMotion(0);
    const before = motion.update(.1, { ...idle, aiming: true });
    const paused = motion.update(0, { ...idle, shots: 3 });
    expect(paused.aim).toBe(before.aim);
    expect(paused.recoil).toBe(0);
    expect(motion.update(.02, { ...idle, shots: 3 }).recoil).toBe(1);
  });
  it('montre le geste de recharge sans dépasser les valeurs attendues', () => {
    const motion = new FpsWeaponMotion(0);
    expect(motion.update(.1, { ...idle, reloadProgress: 0 }).reload).toBeCloseTo(0);
    expect(motion.update(.1, { ...idle, reloadProgress: .5 }).reload).toBeCloseTo(1);
    expect(motion.update(.1, { ...idle, reloadProgress: 1 }).reload).toBeCloseTo(0);
  });
});
