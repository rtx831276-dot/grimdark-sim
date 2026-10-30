import type { GameMap } from './types';
import { isSolid } from './map';

/** Rayon tactique approximatif d'un soldat ; les décorations visuelles ne bloquent pas. */
export const SOLDIER_RADIUS = 0.19;
const EPSILON = 1e-8;
const MAX_STEP = 0.1;

/** Profondeur cumulée d'intersection disque / tuiles solides, bords de carte compris. */
export function terrainPenetration(map: GameMap, x: number, y: number, radius = SOLDIER_RADIUS): number {
  let penetration = 0;
  for (let ty = Math.floor(y - radius); ty <= Math.floor(y + radius); ty++) {
    for (let tx = Math.floor(x - radius); tx <= Math.floor(x + radius); tx++) {
      if (!isSolid(map, tx, ty)) continue;
      const dx = Math.max(tx - x, 0, x - (tx + 1));
      const dy = Math.max(ty - y, 0, y - (ty + 1));
      const dist = Math.hypot(dx, dy);
      if (dist >= radius) continue;
      // Si le centre est déjà dans un mur, autoriser la sortie vers le bord le plus proche.
      const inside = dx === 0 && dy === 0;
      const depth = inside ? radius + Math.min(x - tx, tx + 1 - x, y - ty, ty + 1 - y) : radius - dist;
      penetration += Math.max(0, depth);
    }
  }
  return penetration;
}

/** Déplacement balayé par petits pas avec glissement le long des murs. */
export function moveWithTerrain(map: GameMap, x: number, y: number, dx: number, dy: number, radius = SOLDIER_RADIUS): { x: number; y: number } {
  if (![x, y, dx, dy, radius].every(Number.isFinite) || radius < 0) return { x, y };
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / MAX_STEP));
  const sx = dx / steps, sy = dy / steps;
  let depth = terrainPenetration(map, x, y, radius);
  for (let i = 0; i < steps; i++) {
    // Si le mouvement complet est libre, préserver exactement la direction et la vitesse.
    const diagonalDepth = terrainPenetration(map, x + sx, y + sy, radius);
    if (diagonalDepth <= EPSILON || (depth > EPSILON && diagonalDepth <= depth + EPSILON)) {
      x += sx; y += sy; depth = diagonalDepth; continue;
    }
    const xDepth = terrainPenetration(map, x + sx, y, radius);
    if (xDepth <= EPSILON || (depth > EPSILON && xDepth <= depth + EPSILON)) { x += sx; depth = xDepth; }
    const yDepth = terrainPenetration(map, x, y + sy, radius);
    if (yDepth <= EPSILON || (depth > EPSILON && yDepth <= depth + EPSILON)) { y += sy; depth = yDepth; }
  }
  return { x, y };
}

/** Vérifie la place de tout le disque le long d'un segment, pour le lissage de chemin. */
export function segmentClearOfTerrain(map: GameMap, from: { x: number; y: number }, to: { x: number; y: number }, radius = SOLDIER_RADIUS): boolean {
  const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / MAX_STEP));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (terrainPenetration(map, from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t, radius) > EPSILON) return false;
  }
  return true;
}
