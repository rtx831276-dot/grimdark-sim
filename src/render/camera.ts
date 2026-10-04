import { clamp } from '../core/math';
import type { Vec2 } from '../core/ids';
import { isoToWorld, worldToIso } from './iso';
import type { ScreenPoint } from './iso';

/**
 * Caméra isométrique : elle porte le zoom, le déplacement et — point crucial pour
 * l'interface — la conversion écran <-> tuile utilisée par la souris.
 */
export class Camera {
  /** Centre de la caméra, en tuiles. */
  x = 22;
  y = 15;
  zoom = 1;
  minZoom = 0.45;
  maxZoom = 2.8;

  constructor(
    public viewWidth = 1280,
    public viewHeight = 720,
  ) {}

  resize(width: number, height: number): void {
    this.viewWidth = width;
    this.viewHeight = height;
  }

  /** Origine écran, en pixels isométriques (avant zoom). */
  private origin(): ScreenPoint {
    const iso = worldToIso(this.x, this.y);
    return { x: iso.x - this.viewWidth / 2 / this.zoom, y: iso.y - this.viewHeight / 2 / this.zoom };
  }

  worldToScreen(wx: number, wy: number): ScreenPoint {
    const iso = worldToIso(wx, wy);
    const origin = this.origin();
    return { x: (iso.x - origin.x) * this.zoom, y: (iso.y - origin.y) * this.zoom };
  }

  screenToWorld(sx: number, sy: number): Vec2 {
    const origin = this.origin();
    return isoToWorld(sx / this.zoom + origin.x, sy / this.zoom + origin.y);
  }

  /** Déplacement en pixels écran (glisser-déposer, molette, flèches). */
  panByScreen(dx: number, dy: number): void {
    const origin = this.origin();
    const world = isoToWorld(origin.x + dx / this.zoom, origin.y + dy / this.zoom);
    const current = isoToWorld(origin.x, origin.y);
    this.x -= world.x - current.x;
    this.y -= world.y - current.y;
  }

  /** Zoom centré sur un point de l'écran (typiquement le curseur de la souris). */
  zoomAt(factor: number, screenX: number, screenY: number): void {
    const before = this.screenToWorld(screenX, screenY);
    this.zoom = clamp(this.zoom * factor, this.minZoom, this.maxZoom);
    const after = this.screenToWorld(screenX, screenY);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
  }

  centerOn(x: number, y: number): void {
    this.x = x;
    this.y = y;
  }

  /** Empêche la caméra de s'égarer hors du champ de bataille. */
  clampToMap(width: number, height: number): void {
    const margin = 6;
    this.x = clamp(this.x, -margin, width + margin);
    this.y = clamp(this.y, -margin, height + margin);
  }

  /** Cadre visible en coordonnées tuiles : sert au culling du rendu. */
  visibleBounds(): { minX: number; minY: number; maxX: number; maxY: number } {
    const corners = [
      this.screenToWorld(0, 0),
      this.screenToWorld(this.viewWidth, 0),
      this.screenToWorld(0, this.viewHeight),
      this.screenToWorld(this.viewWidth, this.viewHeight),
    ];
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const corner of corners) {
      minX = Math.min(minX, corner.x);
      minY = Math.min(minY, corner.y);
      maxX = Math.max(maxX, corner.x);
      maxY = Math.max(maxY, corner.y);
    }
    return { minX: minX - 2, minY: minY - 2, maxX: maxX + 2, maxY: maxY + 2 };
  }
}
