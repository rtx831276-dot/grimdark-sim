import { clamp, lerp } from '../core/math';
import type { SimEvent } from '../sim';

export interface BulletSample { x: number; y: number; z: number; tailX: number; tailY: number; tailZ: number; dx: number; dy: number; dz: number }

/** Représente uniquement la portion réellement parcourue, même si la balle a
 * touché et quitté le tableau des projectiles au cours de ce tick. */
export function sampleBulletTrace(event: SimEvent, alpha: number): BulletSample | null {
  if (event.type !== 'bulletTrace' || !Number.isFinite(event.x) || !Number.isFinite(event.y) ||
      !Number.isFinite(event.tx) || !Number.isFinite(event.ty) || !Number.isFinite(alpha)) return null;
  const t = clamp(alpha, 0, 1);
  if (event.bulletEnd && t >= 1) return null;
  const x = event.x!, z = event.y!, y = Math.max(0, event.height ?? 0.93);
  const tx = event.tx!, tz = event.ty!, ty = Math.max(0, event.targetHeight ?? y);
  const dx = tx - x, dy = ty - y, dz = tz - z;
  const length = Math.hypot(dx, dy, dz);
  if (!Number.isFinite(length) || length < 1e-6) return null;
  const tail = Math.max(0, t - 0.45 / length);
  return { x: lerp(x, tx, t), y: lerp(y, ty, t), z: lerp(z, tz, t),
    tailX: lerp(x, tx, tail), tailY: lerp(y, ty, tail), tailZ: lerp(z, tz, tail), dx: dx / length, dy: dy / length, dz: dz / length };
}
