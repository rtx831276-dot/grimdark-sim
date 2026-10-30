import type { DirectControl } from '../sim';

/** Contrôle FPS : capture la souris uniquement à la demande d'un geste utilisateur. */
export class FpsControls {
  private enabled = false;
  private readonly keys = new Set<string>();
  private firing = false;
  private aimingDownSights = false;
  private canAim = false;
  private reloadRequested = false;
  yaw = 0;
  pitch = 0;
  constructor(private readonly canvas: HTMLCanvasElement, private readonly onLockChange: (locked: boolean) => void, private readonly onPause: () => void) {
    canvas.addEventListener('mousedown', this.mouseDown);
    window.addEventListener('mouseup', this.mouseUp);
    window.addEventListener('mousemove', this.mouseMove);
    window.addEventListener('keydown', this.keyDown);
    window.addEventListener('keyup', this.keyUp);
    window.addEventListener('blur', this.blur);
    document.addEventListener('pointerlockchange', this.lockChange);
    document.addEventListener('pointerlockerror', this.lockError);
  }
  activate(yaw: number, canAim = true): void { this.enabled = true; this.canAim = canAim; this.yaw = yaw; this.pitch = 0; this.requestLock(); }
  deactivate(): void {
    this.enabled = false; this.clear();
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }
  private clear(): void { this.keys.clear(); this.firing = false; this.aimingDownSights = false; this.reloadRequested = false; }
  private requestLock(): void {
    try {
      const result = this.canvas.requestPointerLock();
      if (result && typeof result.catch === 'function') result.catch(() => this.onLockChange(false));
    } catch { this.onLockChange(false); }
  }
  get locked(): boolean { return document.pointerLockElement === this.canvas; }
  get aiming(): boolean { return this.enabled && this.locked && this.canAim && this.aimingDownSights; }
  command(unitId: number): DirectControl {
    const pressed = (...keys: string[]) => keys.some(key => this.keys.has(key));
    const reload = this.reloadRequested; this.reloadRequested = false;
    return { unitId, yaw: this.yaw, pitch: this.pitch,
      forward: Number(pressed('keyw', 'keyz', 'arrowup')) - Number(pressed('keys', 'arrowdown')),
      strafe: Number(pressed('keyd', 'arrowright')) - Number(pressed('keya', 'keyq', 'arrowleft')),
      fire: this.locked && this.firing, reload: this.locked && reload };
  }
  private mouseDown = (e: MouseEvent): void => {
    if (!this.enabled || (e.button !== 0 && e.button !== 2)) return;
    e.preventDefault();
    if (!this.locked) { if (e.button === 0) this.requestLock(); return; }
    if (e.button === 0) this.firing = true;
    else this.aimingDownSights = true;
  };
  private mouseUp = (e: MouseEvent): void => { if (e.button === 0) this.firing = false; if (e.button === 2) this.aimingDownSights = false; };
  private mouseMove = (e: MouseEvent): void => {
    if (!this.enabled || !this.locked) return;
    const sensitivity = this.aiming ? 0.0015 : 0.0025;
    this.yaw += e.movementX * sensitivity;
    this.pitch = Math.max(-1.2, Math.min(1.2, this.pitch - e.movementY * sensitivity));
  };
  private keyDown = (e: KeyboardEvent): void => {
    if (!this.enabled || !this.locked) return;
    const code = e.code.toLowerCase(); this.keys.add(code);
    if (['space', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(code)) e.preventDefault();
    if (e.repeat) return;
    if (code === 'keyr') this.reloadRequested = true;
    if (code === 'space') this.onPause();
  };
  private keyUp = (e: KeyboardEvent): void => { this.keys.delete(e.code.toLowerCase()); };
  private blur = (): void => { this.clear(); };
  private lockChange = (): void => { if (!this.enabled) return; if (!this.locked) this.clear(); this.onLockChange(this.locked); };
  private lockError = (): void => { if (this.enabled) { this.clear(); this.onLockChange(false); } };
  dispose(): void {
    this.deactivate(); this.canvas.removeEventListener('mousedown', this.mouseDown);
    window.removeEventListener('mouseup', this.mouseUp); window.removeEventListener('mousemove', this.mouseMove);
    window.removeEventListener('keydown', this.keyDown); window.removeEventListener('keyup', this.keyUp);
    window.removeEventListener('blur', this.blur); document.removeEventListener('pointerlockchange', this.lockChange);
    document.removeEventListener('pointerlockerror', this.lockError);
  }
}
