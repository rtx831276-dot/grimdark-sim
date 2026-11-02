import type { SimEvent } from '../sim';

/** Réactions d'interface uniquement : aucune règle de combat n'est modifiée. */
export class FpsFeedback {
  private hitSeconds = 0;
  private hurtSeconds = 0;
  private kill = false;

  reset(): void { this.hitSeconds = 0; this.hurtSeconds = 0; this.kill = false; }

  /** À appeler pour chaque tick avant d'écraser le tableau d'événements de la simulation. */
  ingest(events: readonly SimEvent[], playerId: number, previousHp: number, currentHp: number): void {
    const killed = events.some(e => e.type === 'kill' && e.targetId === playerId && e.unitId !== playerId);
    const hit = events.some(e => e.type === 'hit' && e.unitId === playerId && e.targetId !== playerId);
    if (killed || hit) {
      this.kill = killed;
      this.hitSeconds = killed ? 0.55 : 0.28;
    }
    // Inclut les explosions, qui n'émettent pas nécessairement d'événement « hit ».
    if (currentHp < previousHp) this.hurtSeconds = 0.55;
  }

  advance(dt: number): void {
    const elapsed = Math.max(0, dt);
    this.hitSeconds = Math.max(0, this.hitSeconds - elapsed);
    this.hurtSeconds = Math.max(0, this.hurtSeconds - elapsed);
  }
  get showHit(): boolean { return this.hitSeconds > 0; }
  get isKill(): boolean { return this.showHit && this.kill; }
  get showHurt(): boolean { return this.hurtSeconds > 0; }
}
