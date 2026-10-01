import type { Vec2 } from '../core/ids';

/**
 * Projection isométrique 2:1 (la vraie 2.5D du prototype) : une tuile fait 48 x 24 px.
 *
 * Toute la couche de rendu passe par ces quatre fonctions. Le jour où l'on migre vers
 * un vrai moteur ou vers une caméra inclinée en 3D, c'est ce fichier qu'on remplace.
 */
export const TILE_W = 48;
export const TILE_H = 24;
export const HALF_W = TILE_W / 2;
export const HALF_H = TILE_H / 2;

export interface ScreenPoint {
  x: number;
  y: number;
}

/** Tuile (x, y) -> pixel écran, avant transformation caméra. */
export function worldToIso(x: number, y: number): ScreenPoint {
  return { x: (x - y) * HALF_W, y: (x + y) * HALF_H };
}

/** Pixel écran isométrique -> coordonnées tuile (inverse exact de worldToIso). */
export function isoToWorld(sx: number, sy: number): Vec2 {
  const a = sx / HALF_W;
  const b = sy / HALF_H;
  return { x: (a + b) / 2, y: (b - a) / 2 };
}

/** Profondeur de tri du peintre : plus x+y est grand, plus l'objet est « devant ». */
export function depthOf(x: number, y: number): number {
  return x + y;
}

/**
 * Direction monde -> direction écran. Sert à orienter les armes et les corps des
 * unités dans le plan isométrique.
 */
export function worldDirectionToScreen(dx: number, dy: number): ScreenPoint {
  const sx = (dx - dy) * HALF_W;
  const sy = (dx + dy) * HALF_H;
  const length = Math.hypot(sx, sy) || 1;
  return { x: sx / length, y: sy / length };
}
