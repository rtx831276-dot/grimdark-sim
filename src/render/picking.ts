import type { Unit } from '../sim';
import type { Camera } from './camera';

/** Choisit le soldat sous le curseur, en tenant compte de sa hauteur à l'écran. */
export function pickSoldier3d(units: readonly Unit[], camera: Camera, screenX: number, screenY: number): Unit | null {
  let best: Unit | null = null;
  let bestScore = Infinity;
  for (const unit of units) {
    if (!unit.alive) continue;
    const p = camera.worldToScreen(unit.x, unit.y);
    const height = (unit.defId === 'creature' ? 42 : unit.state === 'pinned' ? 20 : 31) * camera.zoom;
    const dx = Math.abs(screenX - p.x);
    const halfWidth = (unit.defId === 'creature' ? 22 : 8) * camera.zoom;
    if (dx > halfWidth || screenY < p.y - height - 4 * camera.zoom || screenY > p.y + 4 * camera.zoom) continue;
    const score = Math.hypot(dx, screenY - (p.y - height / 2));
    if (score < bestScore) { best = unit; bestScore = score; }
  }
  return best;
}
