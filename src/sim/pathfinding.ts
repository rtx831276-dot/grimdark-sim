import type { Vec2 } from '../core/ids';
import type { GameMap } from './types';
import { isSolid, moveCostAt, nearestWalkable, terrainAt, tileAt } from './map';
import { lineOfSight } from './los';

const DIAGONAL = Math.SQRT2;

interface OpenNode {
  index: number;
  g: number;
  f: number;
  parent: number;
}

/**
 * A* sur la grille, 8 directions, sans coupe de coin.
 *
 * Le coût d'entrée dans une tuile vient du terrain (boue lente, tranchée très lente) :
 * les unités empruntent naturellement les routes et évitent de patauger.
 */
export function findPath(
  map: GameMap,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  maxNodes = 4000,
): Vec2[] | null {
  const startX = Math.floor(fromX);
  const startY = Math.floor(fromY);
  let goalX = Math.floor(toX);
  let goalY = Math.floor(toY);

  if (isSolid(map, goalX, goalY)) {
    const fallback = nearestWalkable(map, goalX, goalY, 6);
    if (!fallback) return null;
    goalX = Math.floor(fallback.x);
    goalY = Math.floor(fallback.y);
  }
  if (startX === goalX && startY === goalY) return [];

  const width = map.width;
  const start = startY * width + startX;
  const goal = goalY * width + goalX;

  const gScore = new Map<number, number>();
  const cameFrom = new Map<number, number>();
  const closed = new Set<number>();
  const open: OpenNode[] = [];

  const heuristic = (index: number): number => {
    const x = index % width;
    const y = (index - x) / width;
    const dx = Math.abs(x - goalX);
    const dy = Math.abs(y - goalY);
    // Distance octile : admissible et cohérente pour un déplacement 8 directions.
    return (dx + dy) + (DIAGONAL - 2) * Math.min(dx, dy);
  };

  const push = (index: number, g: number, parent: number): void => {
    open.push({ index, g, f: g + heuristic(index), parent });
  };

  gScore.set(start, 0);
  push(start, 0, -1);

  let expanded = 0;
  while (open.length > 0) {
    // File de priorité rudimentaire : suffisant pour des cartes de quelques milliers de tuiles.
    let bestIndex = 0;
    for (let i = 1; i < open.length; i++) {
      if (open[i]!.f < open[bestIndex]!.f) bestIndex = i;
    }
    const current = open.splice(bestIndex, 1)[0]!;
    if (current.index === goal) {
      return reconstruct(cameFrom, current.index, start, width, map);
    }
    if (closed.has(current.index)) continue;
    closed.add(current.index);
    if (++expanded > maxNodes) break;

    const cx = current.index % width;
    const cy = (current.index - cx) / width;

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = cx + dx;
        const ny = cy + dy;
        if (isSolid(map, nx, ny)) continue;
        // Pas de coupe de coin : on ne traverse pas une diagonale entre deux murs.
        if (dx !== 0 && dy !== 0 && (isSolid(map, cx + dx, cy) || isSolid(map, cx, cy + dy))) continue;

        const neighbor = ny * width + nx;
        if (closed.has(neighbor)) continue;

        const stepCost = moveCostAt(map, nx, ny) * (dx !== 0 && dy !== 0 ? DIAGONAL : 1);
        const tentative = current.g + stepCost;
        const known = gScore.get(neighbor);
        if (known !== undefined && tentative >= known) continue;
        gScore.set(neighbor, tentative);
        cameFrom.set(neighbor, current.index);
        push(neighbor, tentative, current.index);
      }
    }
  }

  return null;
}

function reconstruct(
  cameFrom: Map<number, number>,
  goal: number,
  start: number,
  width: number,
  map: GameMap,
): Vec2[] {
  const path: Vec2[] = [];
  let current = goal;
  while (current !== start) {
    const x = current % width;
    const y = (current - x) / width;
    path.push({ x: x + 0.5, y: y + 0.5 });
    const parent = cameFrom.get(current);
    if (parent === undefined) break;
    current = parent;
  }
  path.reverse();
  return smooth(path, map);
}

/**
 * Simplification de chemin : on supprime les points intermédiaires quand une ligne
 * droite reste franchissable. Évite les déplacements en escalier peu crédibles.
 */
function smooth(path: Vec2[], map: GameMap): Vec2[] {
  if (path.length < 3) return path;
  const result: Vec2[] = [path[0]!];
  let anchor = 0;
  for (let i = 2; i < path.length; i++) {
    if (!segmentWalkable(map, path[anchor]!, path[i]!)) {
      result.push(path[i - 1]!);
      anchor = i - 1;
    }
  }
  result.push(path[path.length - 1]!);
  return result;
}

/** Échantillonne un segment pour vérifier qu'il ne traverse pas de tuile pleine. */
function segmentWalkable(map: GameMap, from: Vec2, to: Vec2): boolean {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const steps = Math.max(1, Math.ceil(distance * 3));
  for (let s = 1; s < steps; s++) {
    const t = s / steps;
    const x = from.x + (to.x - from.x) * t;
    const y = from.y + (to.y - from.y) * t;
    if (isSolid(map, x, y)) return false;
  }
  return true;
}

/**
 * Recherche la meilleure couverture autour d'une position, en privilégiant les tuiles
 * qui coupent la vue du tireur. Utilisé par l'IA pour se mettre à l'abri.
 */
export function findCoverNear(
  map: GameMap,
  x: number,
  y: number,
  threatX: number,
  threatY: number,
  radius = 4,
  occupied?: (tx: number, ty: number) => boolean,
): Vec2 | null {
  let best: Vec2 | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  const cx = Math.floor(x);
  const cy = Math.floor(y);

  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (isSolid(map, nx, ny)) continue;
      if (nx === cx && ny === cy) continue;
      if (occupied && occupied(nx, ny)) continue;
      const px = nx + 0.5;
      const py = ny + 0.5;
      const cover = terrainAt(map, px, py).tileCover;
      const los = lineOfSight(map, threatX, threatY, px, py);
      if (los.visible && cover < 0.3) continue; // inutile d'y aller si on reste à découvert
      const travel = Math.hypot(px - x, py - y);
      const score = cover * 10 + (los.visible ? 0 : 4) - travel * 1.6;
      if (score > bestScore) {
        bestScore = score;
        best = { x: px, y: py };
      }
    }
  }
  return best;
}

/** Vrai si la tuile est praticable (utilitaire partagé par l'IA). */
export function isWalkableTile(map: GameMap, x: number, y: number): boolean {
  return tileAt(map, Math.floor(x), Math.floor(y)) !== null && !isSolid(map, x, y);
}
