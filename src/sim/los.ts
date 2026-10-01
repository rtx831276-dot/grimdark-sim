import { clamp } from '../core/math';
import { TERRAIN } from '../data/terrain';
import type { GameMap } from './types';
import { tileAt } from './map';

export interface LineOfSight {
  /** Vrai si aucun obstacle plein ne coupe la ligne. */
  visible: boolean;
  /** Couverture apportée par les obstacles traversés (0..1). */
  obstruction: number;
  /** Première tuile qui bloque la vue, si elle existe. */
  blocker: { x: number; y: number } | null;
}

/**
 * Ligne de vue « supercover » sur la grille (DDA).
 *
 * La tuile de départ et la tuile d'arrivée ne comptent pas comme obstacles : un mur
 * n'empêche pas une unité collée dessus de tirer. Les tuiles traversées ajoutent leur
 * `losCover` : une clôture ou des gravats donnent une couverture partielle sans bloquer.
 */
export function lineOfSight(map: GameMap, ax: number, ay: number, bx: number, by: number): LineOfSight {
  let x0 = Math.floor(ax);
  let y0 = Math.floor(ay);
  const x1 = Math.floor(bx);
  const y1 = Math.floor(by);

  const dx = bx - ax;
  const dy = by - ay;
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  let obstruction = 0;

  if (steps === 0) {
    return { visible: true, obstruction: 0, blocker: null };
  }

  const stepX = Math.sign(dx);
  const stepY = Math.sign(dy);
  const tDeltaX = dx === 0 ? Number.POSITIVE_INFINITY : Math.abs(1 / dx);
  const tDeltaY = dy === 0 ? Number.POSITIVE_INFINITY : Math.abs(1 / dy);
  // Distance paramétrique jusqu'au premier franchissement de bordure.
  let tMaxX = dx === 0 ? Number.POSITIVE_INFINITY : ((stepX > 0 ? x0 + 1 - ax : ax - x0) * tDeltaX);
  let tMaxY = dy === 0 ? Number.POSITIVE_INFINITY : ((stepY > 0 ? y0 + 1 - ay : ay - y0) * tDeltaY);

  for (let i = 0; i < steps * 2 + 2; i++) {
    if (tMaxX < tMaxY) {
      x0 += stepX;
      tMaxX += tDeltaX;
    } else {
      y0 += stepY;
      tMaxY += tDeltaY;
    }
    if (x0 === x1 && y0 === y1) break;
    const tile = tileAt(map, x0, y0);
    if (!tile) {
      // Hors carte : traité comme un mur plein.
      return { visible: false, obstruction, blocker: { x: x0, y: y0 } };
    }
    const def = TERRAIN[tile.terrain];
    if (def.solid) {
      return { visible: false, obstruction, blocker: { x: x0, y: y0 } };
    }
    obstruction = Math.max(obstruction, def.losCover);
  }

  return { visible: true, obstruction: clamp(obstruction, 0, 1), blocker: null };
}

/**
 * Couverture effective contre un tireur donné : celle du terrain occupé, plus une part
 * de l'obstruction de la ligne de vue. Plafonnée pour qu'une unité ne soit jamais
 * intouchable.
 */
export function coverAgainst(map: GameMap, targetX: number, targetY: number, shooterX: number, shooterY: number): number {
  const los = lineOfSight(map, shooterX, shooterY, targetX, targetY);
  const ownTile = tileAt(map, Math.floor(targetX), Math.floor(targetY));
  const own = ownTile ? TERRAIN[ownTile.terrain].tileCover : 0;
  return clamp(own + los.obstruction * 0.55, 0, 0.85);
}
