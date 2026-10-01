import type { Vec2 } from './ids';

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function distance(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(bx - ax, by - ay);
}

/** Distance « tactique » : la grille est en tuiles, le mouvement est libre. */
export function distanceTo(a: Vec2, b: Vec2): number {
  return distance(a.x, a.y, b.x, b.y);
}

export function normalize(x: number, y: number): Vec2 {
  const len = Math.hypot(x, y);
  if (len === 0) return { x: 0, y: 0 };
  return { x: x / len, y: y / len };
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
