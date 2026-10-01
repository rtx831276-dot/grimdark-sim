import { lerp } from '../core/math';
import type { Vec2 } from '../core/ids';
import { TERRAIN } from '../data/terrain';
import { factionDef, FACTION_IDS } from '../data/factions';
import { unitDef } from '../data/units';
import { weapon } from '../data/weapons';
import { lineOfSight, type SimState, type TileState, type Unit } from '../sim';
import type { Camera } from './camera';
import { drawEffects, Effects } from './effects';
import { depthOf, TILE_H } from './iso';
import { drawCorpse, drawUnit } from './sprites';

export interface RenderFlags {
  cover: boolean;
  los: boolean;
  paths: boolean;
}

export interface RenderOptions {
  ctx: CanvasRenderingContext2D;
  camera: Camera;
  state: SimState;
  selection: ReadonlySet<number>;
  hoveredUnitId: number | null;
  hoveredTile: Vec2 | null;
  effects: Effects;
  flags: RenderFlags;
  mode: 'none' | 'grenade' | 'artillery';
  /** Interpolation 0..1 entre le tick précédent et le tick courant. */
  alpha: number;
  time: number;
  /** Rectangle de sélection à la souris, en pixels écran. */
  selectionRect?: { x: number; y: number; w: number; h: number } | null;
  /** Aperçu de la zone visée par une grenade ou un barrage. */
  ghostTarget?: { x: number; y: number; radius: number; label: string; color: string; fill: string } | null;
}

interface Drawable {
  depth: number;
  layer: number;
  draw: () => void;
}

/**
 * Rendu de la bataille.
 *
 * Le tri des éléments se fait par profondeur isométrique (x + y) : c'est ce qui permet à un
 * mur de masquer correctement l'unité qui se trouve derrière lui, sans moteur 3D.
 */
export function renderBattle(options: RenderOptions): void {
  const { ctx, camera, state } = options;

  ctx.save();
  ctx.fillStyle = '#0a0b09';
  ctx.fillRect(0, 0, camera.viewWidth, camera.viewHeight);

  drawGround(ctx, camera);

  const bounds = camera.visibleBounds();
  const minX = Math.max(0, Math.floor(bounds.minX));
  const maxX = Math.min(state.map.width - 1, Math.ceil(bounds.maxX));
  const minY = Math.max(0, Math.floor(bounds.minY));
  const maxY = Math.min(state.map.height - 1, Math.ceil(bounds.maxY));

  const drawables: Drawable[] = [];

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const tile = state.map.tiles[y * state.map.width + x];
      if (!tile) continue;
      drawables.push({
        depth: depthOf(x, y),
        layer: 0,
        draw: () => drawTile(ctx, camera, tile, x, y, options),
      });
    }
  }

  // Marqueurs d'objectifs : posés au sol, sous les unités mais au-dessus des tuiles.
  for (const objective of state.map.objectives) {
    drawables.push({
      depth: depthOf(objective.x, objective.y) - 0.5,
      layer: 1,
      draw: () => drawObjective(ctx, camera, objective.x, objective.y, objective.radius, objective.label, state.objectiveControl[objective.id] ?? null),
    });
  }

  for (const unit of state.units) {
    const renderX = lerp(unit.prevX, unit.x, options.alpha);
    const renderY = lerp(unit.prevY, unit.y, options.alpha);
    const screen = camera.worldToScreen(renderX, renderY);
    if (screen.x < -80 || screen.y < -80 || screen.x > camera.viewWidth + 80 || screen.y > camera.viewHeight + 80) continue;
    drawables.push({
      depth: depthOf(renderX, renderY),
      layer: 2,
      draw: () => {
        if (unit.alive) {
          drawUnit(ctx, unit, screen, {
            selected: options.selection.has(unit.id),
            hovered: options.hoveredUnitId === unit.id,
            zoom: camera.zoom,
          });
        } else if (unit.state === 'dead' && unit.hp === 0) {
          drawCorpse(ctx, unit, screen, camera.zoom);
        }
      },
    });
  }

  // Projectiles (grenades, obus) : trajectoire en cloche rendue par-dessus le monde.
  for (const projectile of state.projectiles) {
    const start = projectile.impactTick - projectile.flightTicks;
    const t = Math.max(0, Math.min(1, (state.tick - start + options.alpha) / Math.max(1, projectile.flightTicks)));
    const screen = camera.worldToScreen(projectile.x, projectile.y);
    const arc = Math.sin(t * Math.PI) * (projectile.kind === 'shell' ? 190 : 60) * camera.zoom;
    drawables.push({
      depth: depthOf(projectile.x, projectile.y) + 0.4,
      layer: 3,
      draw: () => {
        ctx.fillStyle = projectile.kind === 'shell' ? 'rgba(240, 200, 140, 0.95)' : '#3a3527';
        ctx.beginPath();
        ctx.arc(screen.x, screen.y - arc, projectile.kind === 'shell' ? 3.4 : 2.6, 0, Math.PI * 2);
        ctx.fill();
        if (projectile.kind === 'shell') {
          ctx.strokeStyle = 'rgba(240, 200, 140, 0.25)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(screen.x, screen.y - arc);
          ctx.lineTo(screen.x, screen.y - arc + 26 * camera.zoom);
          ctx.stroke();
        }
      },
    });
  }

  drawables.sort((a, b) => (a.depth === b.depth ? a.layer - b.layer : a.depth - b.depth));
  for (const drawable of drawables) drawable.draw();

  drawEffects(ctx, options.effects, camera);
  drawOverlays(options);
  drawDragSelectionHint(options);
  drawGhostTarget(options);
  drawModeCursor(options);

  ctx.restore();
}

/* ------------------------------------------------------------------ *
 * Sol
 * ------------------------------------------------------------------ */

function drawGround(ctx: CanvasRenderingContext2D, camera: Camera): void {
  const gradient = ctx.createLinearGradient(0, 0, 0, camera.viewHeight);
  gradient.addColorStop(0, '#121310');
  gradient.addColorStop(1, '#080907');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, camera.viewWidth, camera.viewHeight);
}

/** Bruit déterministe par tuile : cassure la monotonie du sol sans texture externe. */
function tileNoise(x: number, y: number): number {
  const hash = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return hash - Math.floor(hash);
}

function drawTile(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  tile: TileState,
  x: number,
  y: number,
  options: RenderOptions,
): void {
  const def = TERRAIN[tile.terrain];
  const north = camera.worldToScreen(x, y);
  const east = camera.worldToScreen(x + 1, y);
  const south = camera.worldToScreen(x + 1, y + 1);
  const west = camera.worldToScreen(x, y + 1);
  const height = def.height * TILE_H * camera.zoom;
  const noise = tileNoise(x, y);

  // Faces verticales (murs, parapets) : plus sombres que le dessus.
  if (height > 0) {
    const shade = 0.72 + noise * 0.1;
    ctx.fillStyle = mix(def.color, '#000000', 1 - shade);
    ctx.beginPath();
    ctx.moveTo(east.x, east.y);
    ctx.lineTo(south.x, south.y);
    ctx.lineTo(south.x, south.y - height);
    ctx.lineTo(east.x, east.y - height);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = mix(def.color, '#000000', 1 - (shade - 0.14));
    ctx.beginPath();
    ctx.moveTo(west.x, west.y);
    ctx.lineTo(south.x, south.y);
    ctx.lineTo(south.x, south.y - height);
    ctx.lineTo(west.x, west.y - height);
    ctx.closePath();
    ctx.fill();
  }

  const offsetY = -height;
  // Variation de teinte très légère (94 % à 108 %) : casse la monotonie du sol sans
  // créer l'effet damier qu'une alternance franche de couleurs produisait.
  ctx.fillStyle = mix(def.topColor, '#000000', 0.94 + noise * 0.14);
  ctx.beginPath();
  ctx.moveTo(north.x, north.y + offsetY);
  ctx.lineTo(east.x, east.y + offsetY);
  ctx.lineTo(south.x, south.y + offsetY);
  ctx.lineTo(west.x, west.y + offsetY);
  ctx.closePath();
  ctx.fill();

  // Les arbres morts sont dessinés comme tels : un tronc et des branches, pas une caisse.
  if (tile.terrain === 'tree') {
    drawDeadTree(ctx, north.x, north.y, camera.zoom, noise);
  }

  // Structures endommagées : fissures proportionnelles aux dégâts encaissés.
  if (tile.maxHp > 0 && tile.hp < tile.maxHp) {
    const damage = 1 - tile.hp / tile.maxHp;
    ctx.strokeStyle = `rgba(20, 16, 12, ${0.25 + damage * 0.55})`;
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 3; i++) {
      const cx = lerp(north.x, south.x, 0.2 + i * 0.3);
      const cy = lerp(north.y, south.y, 0.35 + i * 0.15) + offsetY;
      ctx.beginPath();
      ctx.moveTo(cx - 5, cy - 3 - damage * 6);
      ctx.lineTo(cx + 4, cy + 3 + damage * 5);
      ctx.stroke();
    }
  }

  // Dégradé de couverture (touche C) : bleu = abri, rouge = à découvert.
  if (options.flags.cover) {
    const cover = def.tileCover;
    const color = cover > 0.5 ? `rgba(80, 150, 210, ${0.12 + cover * 0.35})` : `rgba(200, 90, 70, ${0.28 * (1 - cover)})`;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(north.x, north.y + offsetY);
    ctx.lineTo(east.x, east.y + offsetY);
    ctx.lineTo(south.x, south.y + offsetY);
    ctx.lineTo(west.x, west.y + offsetY);
    ctx.closePath();
    ctx.fill();
  }

  if (options.mode !== 'none') {
    drawTileOutline(ctx, [north, east, south, west], offsetY, 'rgba(255, 255, 255, 0.03)');
  }

  // Surbrillance de la tuile survolée.
  const hovered = options.hoveredTile;
  if (hovered && Math.floor(hovered.x) === x && Math.floor(hovered.y) === y) {
    ctx.strokeStyle = 'rgba(240, 226, 176, 0.55)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(north.x, north.y + offsetY);
    ctx.lineTo(east.x, east.y + offsetY);
    ctx.lineTo(south.x, south.y + offsetY);
    ctx.lineTo(west.x, west.y + offsetY);
    ctx.closePath();
    ctx.stroke();
  }
}

/** Arbre mort : tronc sec et branches cassées, dessinés au-dessus de la tuile. */
function drawDeadTree(ctx: CanvasRenderingContext2D, x: number, y: number, zoom: number, noise: number): void {
  const scale = Math.max(0.6, Math.min(1.5, zoom));
  const trunk = 26 * scale;
  ctx.strokeStyle = '#2a2319';
  ctx.lineWidth = 2.4 * scale;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + noise * 4 - 2, y - trunk);
  ctx.stroke();

  ctx.strokeStyle = '#332b1f';
  ctx.lineWidth = 1.6 * scale;
  for (let i = 0; i < 3; i++) {
    const branchY = y - trunk * (0.55 + i * 0.16);
    const direction = i % 2 === 0 ? 1 : -1;
    ctx.beginPath();
    ctx.moveTo(x, branchY);
    ctx.lineTo(x + direction * (8 + i * 3) * scale, branchY - (6 + i * 2) * scale);
    ctx.stroke();
  }
}

function drawTileOutline(ctx: CanvasRenderingContext2D, points: Array<{ x: number; y: number }>, offsetY: number, color: string): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y + offsetY);
    else ctx.lineTo(point.x, point.y + offsetY);
  });
  ctx.closePath();
  ctx.stroke();
}

/* ------------------------------------------------------------------ *
 * Objectifs
 * ------------------------------------------------------------------ */

function drawObjective(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  x: number,
  y: number,
  radius: number,
  label: string,
  owner: string | null,
): void {
  const center = camera.worldToScreen(x, y);
  const zoom = camera.zoom;
  const color = owner ? factionDef(owner).color : 'rgba(220, 214, 190, 0.5)';
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 5]);
  ctx.beginPath();
  ctx.ellipse(center.x, center.y, radius * 24 * zoom, radius * 12 * zoom, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  if (zoom > 0.62) {
    ctx.fillStyle = 'rgba(12, 12, 10, 0.6)';
    const textWidth = ctx.measureText(label).width + 10;
    ctx.fillRect(center.x - textWidth / 2, center.y - 8, textWidth, 15);
    ctx.fillStyle = owner ? factionDef(owner).colorBright : '#cfc8b4';
    ctx.font = '11px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, center.x, center.y + 3);
  }
}

/* ------------------------------------------------------------------ *
 * Calques tactiques (couverture, ligne de vue, chemins)
 * ------------------------------------------------------------------ */

function drawOverlays(options: RenderOptions): void {
  const { ctx, camera, state } = options;

  if (options.flags.paths) {
    for (const unit of state.units) {
      if (!unit.alive || unit.path.length === 0) continue;
      ctx.strokeStyle = options.selection.has(unit.id) ? 'rgba(240, 226, 176, 0.8)' : 'rgba(240, 226, 176, 0.22)';
      ctx.lineWidth = options.selection.has(unit.id) ? 2 : 1;
      ctx.beginPath();
      const start = camera.worldToScreen(unit.x, unit.y);
      ctx.moveTo(start.x, start.y);
      for (let i = unit.pathIndex; i < unit.path.length; i++) {
        const node = unit.path[i]!;
        const point = camera.worldToScreen(node.x, node.y);
        ctx.lineTo(point.x, point.y);
      }
      ctx.stroke();
    }
  }

  if (options.flags.los) {
    for (const unit of state.units) {
      if (!unit.alive || !options.selection.has(unit.id)) continue;
      const def = unitDef(unit.defId);
      const origin = camera.worldToScreen(unit.x, unit.y);
      ctx.strokeStyle = 'rgba(120, 200, 240, 0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(origin.x, origin.y, def.vision * 24 * camera.zoom, def.vision * 12 * camera.zoom, 0, 0, Math.PI * 2);
      ctx.stroke();

      const gun = weapon(def.weapon);
      ctx.strokeStyle = 'rgba(255, 210, 120, 0.16)';
      ctx.beginPath();
      ctx.ellipse(origin.x, origin.y, gun.range * 24 * camera.zoom, gun.range * 12 * camera.zoom, 0, 0, Math.PI * 2);
      ctx.stroke();

      for (const other of state.units) {
        if (!other.alive || other.faction === unit.faction) continue;
        const distance = Math.hypot(other.x - unit.x, other.y - unit.y);
        if (distance > def.vision) continue;
        const los = lineOfSight(state.map, unit.x, unit.y, other.x, other.y);
        const target = camera.worldToScreen(other.x, other.y);
        ctx.strokeStyle = los.visible ? 'rgba(160, 220, 140, 0.55)' : 'rgba(220, 100, 90, 0.45)';
        ctx.lineWidth = los.visible ? 1.6 : 1;
        ctx.beginPath();
        ctx.moveTo(origin.x, origin.y - 6);
        ctx.lineTo(target.x, target.y - 6);
        ctx.stroke();
      }
    }
  }

  // Ligne d'ordre en cours : où va l'unité sélectionnée.
  for (const unit of state.units) {
    if (!unit.alive || !unit.goal || !options.selection.has(unit.id)) continue;
    const from = camera.worldToScreen(unit.x, unit.y);
    const to = camera.worldToScreen(unit.goal.x, unit.goal.y);
    ctx.strokeStyle = 'rgba(160, 230, 160, 0.7)';
    ctx.lineWidth = 1.6;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(to.x, to.y, 5, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawDragSelectionHint(options: RenderOptions): void {
  const selectionRect = options.selectionRect;
  if (!selectionRect) return;
  const { ctx } = options;
  ctx.strokeStyle = 'rgba(240, 226, 176, 0.7)';
  ctx.fillStyle = 'rgba(240, 226, 176, 0.08)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.rect(selectionRect.x, selectionRect.y, selectionRect.w, selectionRect.h);
  ctx.fill();
  ctx.stroke();
}

/** Aperçu de la zone d'effet d'une grenade ou d'un barrage. */
function drawGhostTarget(options: RenderOptions): void {
  const target = options.ghostTarget;
  if (!target) return;
  const { ctx, camera } = options;
  const center = camera.worldToScreen(target.x, target.y);
  const radius = target.radius;
  ctx.strokeStyle = target.color;
  ctx.fillStyle = target.fill;
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.ellipse(center.x, center.y, radius * 24 * camera.zoom, radius * 12 * camera.zoom, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = target.color;
  ctx.font = 'bold 12px "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(target.label, center.x, center.y - radius * 12 * camera.zoom - 8);
}

function drawModeCursor(options: RenderOptions): void {
  const { ctx, camera, mode } = options;
  if (mode === 'none') return;
  const label = mode === 'grenade' ? 'GRENADE — clic gauche pour lancer, Échap pour annuler' : 'BARRAGE — clic gauche pour désigner la cible, Échap pour annuler';
  ctx.fillStyle = 'rgba(12, 12, 10, 0.75)';
  ctx.fillRect(12, camera.viewHeight - 34, Math.min(camera.viewWidth - 24, 520), 22);
  ctx.fillStyle = mode === 'grenade' ? '#c9a227' : '#e0703c';
  ctx.font = '12px "Segoe UI", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(label, 20, camera.viewHeight - 19);
}

/* ------------------------------------------------------------------ *
 * Utilitaires
 * ------------------------------------------------------------------ */

/** Mélange deux couleurs hexadécimales (t = 1 -> couleur A). */
function mix(a: string, b: string, t: number): string {
  const valueA = a.replace('#', '');
  const valueB = b.replace('#', '');
  const channels = [0, 2, 4].map((offset) => {
    const ca = parseInt(valueA.slice(offset, offset + 2), 16);
    const cb = parseInt(valueB.slice(offset, offset + 2), 16);
    return Math.round(cb + (ca - cb) * t);
  });
  return `rgb(${channels[0]}, ${channels[1]}, ${channels[2]})`;
}

/** Position d'une unité projetée à l'écran (utilisée par le HUD et la souris). */
export function unitScreenPosition(camera: Camera, unit: Unit): { x: number; y: number } {
  return camera.worldToScreen(unit.x, unit.y);
}

/** Factions présentes sur la carte (ordre stable, pour l'affichage). */
export const RENDER_FACTION_ORDER = FACTION_IDS;
