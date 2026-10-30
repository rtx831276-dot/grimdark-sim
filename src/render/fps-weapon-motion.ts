/** Animation cosmétique de l'arme FPS ; ne change ni la visée ni les dégâts. */
export class FpsWeaponMotion {
  private aim = 0;
  private recoil = 0;
  private walking = 0;
  private phase = 0;
  private shots: number;
  constructor(initialShots: number) { this.shots = initialShots; }

  update(dt: number, options: { aiming: boolean; moving: boolean; reloadProgress: number | null; shots: number }): {
    aim: number; recoil: number; bobX: number; bobY: number; reload: number;
  } {
    const elapsed = Math.max(0, Math.min(dt, 0.25));
    if (elapsed > 0) {
      const aimTarget = options.aiming && options.reloadProgress === null ? 1 : 0;
      this.aim += (aimTarget - this.aim) * (1 - Math.exp(-elapsed * 12));
      const moving = options.moving ? 1 : 0;
      this.walking += (moving - this.walking) * (1 - Math.exp(-elapsed * 8));
      this.phase += elapsed * 10;
      this.recoil *= Math.exp(-elapsed * 9);
      if (options.shots > this.shots) this.recoil = 1;
      this.shots = options.shots;
    }
    const sway = this.walking * (1 - this.aim * 0.75);
    const progress = options.reloadProgress === null ? null : Math.max(0, Math.min(1, options.reloadProgress));
    return { aim: this.aim, recoil: this.recoil,
      bobX: Math.sin(this.phase) * 0.012 * sway,
      bobY: Math.abs(Math.sin(this.phase)) * 0.01 * sway,
      reload: progress === null ? 0 : Math.sin(Math.PI * progress) };
  }
}
