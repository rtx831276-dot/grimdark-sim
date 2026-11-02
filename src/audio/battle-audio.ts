import type { SimEvent, Unit } from '../sim';
import { FootstepTracker } from './footsteps';

export type SoundKind = 'shot' | 'explosion' | 'impact' | 'melee' | 'throw' | 'footstep';
export interface Listener { x: number; y: number; yaw: number }
export interface AudibleEvent { kind: SoundKind; x: number; y: number; pan: number; volume: number; priority: number; weaponId?: string }

/** Évite de transformer les nombreux événements internes d'une salve en vacarme. */
export function selectAudibleEvents(events: readonly SimEvent[], listener: Listener, max = 6): AudibleEvent[] {
  const selected: AudibleEvent[] = [];
  for (const event of events) {
    let kind: SoundKind | null = null;
    if (event.type === 'shot') kind = 'shot';
    else if (event.type === 'explosion') kind = 'explosion';
    else if (event.type === 'impact') kind = 'impact';
    else if (event.type === 'meleeImpact' || (event.type === 'melee' && event.weaponId !== 'unarmed' && event.weaponId !== 'modern_sword')) kind = 'melee';
    else if (event.type === 'grenadeThrown') kind = 'throw';
    if (!kind || event.x === undefined || event.y === undefined || !Number.isFinite(event.x) || !Number.isFinite(event.y)) continue;
    const dx = event.x - listener.x, dy = event.y - listener.y;
    const distance = Math.hypot(dx, dy);
    if (distance > 38) continue;
    const pan = distance < 0.01 ? 0 : Math.max(-0.9, Math.min(0.9, (-Math.sin(listener.yaw) * dx + Math.cos(listener.yaw) * dy) / distance));
    const volume = Math.max(0, 1 - distance / 38) ** 1.5;
    const priority = (kind === 'explosion' ? 3 : kind === 'shot' ? 2 : 1) * volume;
    selected.push({ kind, x: event.x, y: event.y, pan, volume, priority, weaponId: event.weaponId });
  }
  return selected.sort((a, b) => b.priority - a.priority).slice(0, Math.max(0, max));
}

/** Sons synthétisés localement ; aucun fichier audio externe ni donnée de simulation. */
export class BattleAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private _enabled = false;
  private _available = true;
  private readonly lastSounds = new Map<string, number>();
  private readonly footsteps = new FootstepTracker();
  get enabled(): boolean { return this._enabled; }
  get available(): boolean { return this._available; }

  /** À appeler seulement depuis un geste utilisateur, conformément aux règles du navigateur. */
  async toggle(): Promise<void> {
    if (this._enabled) { this._enabled = false; if (this.master) this.master.gain.value = 0; this.lastSounds.clear(); this.footsteps.clear(); return; }
    try {
      if (!this.context) {
        this.context = new AudioContext();
        this.master = this.context.createGain();
        this.master.gain.value = 0.18;
        const compressor = this.context.createDynamicsCompressor();
        compressor.threshold.value = -20;
        compressor.ratio.value = 8;
        this.master.connect(compressor); compressor.connect(this.context.destination);
        this.noise = this.context.createBuffer(1, Math.floor(this.context.sampleRate * 0.45), this.context.sampleRate);
        const samples = this.noise.getChannelData(0);
        for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
      }
      this._enabled = true;
      if (this.master) this.master.gain.value = 0.18;
      await this.context.resume();
    } catch {
      this._enabled = false; this._available = false;
    }
  }

  playEvents(events: readonly SimEvent[], listener: Listener): void {
    if (!this._enabled) return;
    this.playSelected(selectAudibleEvents(events, listener));
  }

  playFootsteps(units: readonly Unit[], listener: Listener, tick: number): void {
    if (!this._enabled) return;
    const steps = this.footsteps.collect(units, listener, tick);
    this.playSelected(steps.map(step => {
      const dx = step.x - listener.x, dy = step.y - listener.y;
      const pan = step.distance < 0.01 ? 0 : Math.max(-0.9, Math.min(0.9, (-Math.sin(listener.yaw) * dx + Math.cos(listener.yaw) * dy) / step.distance));
      return {kind: 'footstep' as const, x: step.x, y: step.y, pan, volume: (1 - step.distance / 18) ** 1.5, priority: 1};
    }));
  }

  reset(): void { this.footsteps.clear(); this.lastSounds.clear(); }

  private playSelected(events: readonly AudibleEvent[]): void {
    const ctx = this.context, master = this.master, noise = this.noise;
    if (!this._enabled || !ctx || ctx.state !== 'running' || !master || !noise) return;
    const now = ctx.currentTime;
    for (const event of events) {
      // Plusieurs balles d'une même rafale peuvent atteindre exactement la même surface.
      const key = `${event.kind}:${Math.round(event.x * 2)}:${Math.round(event.y * 2)}`;
      if (now - (this.lastSounds.get(key) ?? -10) < 0.07) continue;
      this.lastSounds.set(key, now);
      this.play(ctx, master, noise, event, now);
    }
    // Mémoire bornée dans une bataille sans fin.
    if (this.lastSounds.size > 200) for (const [key, at] of this.lastSounds) if (now - at > 2) this.lastSounds.delete(key);
  }

  private play(ctx: AudioContext, master: GainNode, noise: AudioBuffer, event: AudibleEvent, now: number): void {
    const duration = event.kind === 'explosion' ? 0.42 : event.kind === 'shot' ? 0.13 : event.kind === 'throw' ? 0.09 : event.kind === 'footstep' ? 0.075 : 0.08;
    const source = ctx.createBufferSource(); source.buffer = noise;
    const filter = ctx.createBiquadFilter();
    filter.type = event.kind === 'explosion' || event.kind === 'melee' || event.kind === 'footstep' ? 'lowpass' : 'highpass';
    filter.frequency.value = event.kind === 'explosion' ? 420 : event.kind === 'melee' ? 550 : event.kind === 'footstep' ? 440 : event.kind === 'shot' ? 620 : 1300;
    const gain = ctx.createGain();
    const strength = event.kind === 'explosion' ? 0.85 : event.kind === 'shot' ? 0.5 : event.kind === 'footstep' ? 0.18 : 0.23;
    gain.gain.setValueAtTime(Math.max(0.0001, event.volume * strength), now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    const pan = ctx.createStereoPanner(); pan.pan.value = event.pan;
    source.connect(filter); filter.connect(gain); gain.connect(pan); pan.connect(master);
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); pan.disconnect(); };
    source.start(now); source.stop(now + duration);
  }

  dispose(): void {
    this._enabled = false;
    this.reset();
    if (this.context) void this.context.close();
    this.context = null; this.master = null; this.noise = null;
  }
}
