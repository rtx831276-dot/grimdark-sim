import type { Unit } from '../sim';

export interface Footstep { unitId: number; x: number; y: number; distance: number }
type MovingUnit = Pick<Unit, 'id' | 'alive' | 'x' | 'y' | 'prevX' | 'prevY'>;

/** Déclenche un pas selon la distance réellement parcourue, sans modifier l'IA. */
export class FootstepTracker {
  private readonly walkers = new Map<number, { distance: number; tick: number }>();
  collect(units: readonly MovingUnit[], listener: {x: number; y: number}, tick: number): Footstep[] {
    const steps: Footstep[] = [];
    for (const unit of units) {
      if (!unit.alive) continue;
      const moved = Math.hypot(unit.x - unit.prevX, unit.y - unit.prevY);
      if (!Number.isFinite(moved) || moved < 0.002) continue;
      let item = this.walkers.get(unit.id);
      if (!item) { item = {distance: 0, tick}; this.walkers.set(unit.id, item); }
      item.tick = tick;
      // Limite les bruits irréalistes en cas de téléportation ou de changement de carte.
      item.distance += Math.min(moved, 0.35);
      if (item.distance < 0.55) continue;
      item.distance %= 0.55;
      const distance = Math.hypot(unit.x - listener.x, unit.y - listener.y);
      if (distance <= 18) steps.push({unitId: unit.id, x: unit.x, y: unit.y, distance});
    }
    if (tick % 32 === 0 || this.walkers.size > 100) for (const [id, entry] of this.walkers) if (tick - entry.tick > 100) this.walkers.delete(id);
    return steps.sort((a, b) => a.distance - b.distance).slice(0, 3);
  }
  clear(): void { this.walkers.clear(); }
}
