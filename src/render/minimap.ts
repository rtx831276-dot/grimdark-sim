import { clamp } from '../core/math';
import { TERRAIN } from '../data/terrain';
import type { GameMap, SimState } from '../sim';
import type { Camera } from './camera';
import { TerrainChangeTracker } from './terrain-change';

/** Coordonnées de la mini-carte : toujours alignées sur la grille, quelle que soit la rotation de la caméra. */
export function minimapToWorld(x: number, y: number, width: number, height: number, mapWidth: number, mapHeight: number): { x: number; y: number } | null {
  if (![x, y, width, height, mapWidth, mapHeight].every(Number.isFinite) || width <= 0 || height <= 0 || mapWidth <= 0 || mapHeight <= 0) return null;
  return { x: clamp(x / width, 0, 1) * mapWidth, y: clamp(y / height, 0, 1) * mapHeight };
}

/** Les quatre coins dans l'ordre du périmètre (la caméra peut être pivotée). */
export function minimapViewCorners(camera: Camera): { x: number; y: number }[] {
  return [[0, 0], [camera.viewWidth, 0], [camera.viewWidth, camera.viewHeight], [0, camera.viewHeight]]
    .map(([x, y]) => camera.screenToWorld(x!, y!));
}

const TEAM_COLORS: Record<string, string> = { penitents: '#e2c681', marteau: '#80bfe2', creature: '#e85c50' };

/** Aperçu tactique : un fond de terrain en cache, puis objectifs et unités vivantes. */
export class Minimap {
  private readonly context: CanvasRenderingContext2D;
  private readonly background: HTMLCanvasElement;
  private readonly backgroundContext: CanvasRenderingContext2D;
  private readonly terrain = new TerrainChangeTracker();
  private movingPointer: number | null = null;
  private readonly summary: HTMLElement | null;

  constructor(private readonly canvas: HTMLCanvasElement, private readonly camera: Camera, private readonly map: () => GameMap) {
    const context = canvas.getContext('2d');
    this.background = document.createElement('canvas');
    this.background.width = canvas.width;
    this.background.height = canvas.height;
    const backgroundContext = this.background.getContext('2d');
    if (!context || !backgroundContext) throw new Error('Canvas 2D indisponible pour la carte tactique.');
    this.context = context;
    this.backgroundContext = backgroundContext;
    this.summary = canvas.closest('details')?.querySelector('summary') ?? null;
    this.summary?.addEventListener('keydown', this.onSummaryKeyDown);
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerEnd);
    canvas.addEventListener('pointercancel', this.onPointerEnd);
    canvas.addEventListener('keydown', this.onKeyDown);
    canvas.addEventListener('contextmenu', this.onContextMenu);
  }

  private centerFromPointer(event: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect(), map = this.map();
    const point = minimapToWorld(event.clientX - rect.left, event.clientY - rect.top, rect.width, rect.height, map.width, map.height);
    if (point) this.camera.centerOn(point.x, point.y);
  }
  private onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    event.preventDefault();
    this.movingPointer = event.pointerId;
    this.canvas.setPointerCapture(event.pointerId);
    this.centerFromPointer(event);
  };
  private onPointerMove = (event: PointerEvent): void => {
    if (event.pointerId === this.movingPointer) { event.preventDefault(); this.centerFromPointer(event); }
  };
  private onPointerEnd = (event: PointerEvent): void => {
    if (event.pointerId === this.movingPointer) this.movingPointer = null;
  };
  private onSummaryKeyDown = (event: KeyboardEvent): void => {
    if (event.key === ' ' || event.key === 'Enter') event.stopPropagation();
  };
  private onContextMenu = (event: Event): void => { event.preventDefault(); };
  private onKeyDown = (event: KeyboardEvent): void => {
    const delta: Record<string, [number, number]> = { ArrowLeft: [-2, 0], ArrowRight: [2, 0], ArrowUp: [0, -2], ArrowDown: [0, 2] };
    const step = delta[event.key];
    if (!step) return;
    const map = this.map();
    event.preventDefault(); event.stopPropagation();
    this.camera.centerOn(clamp(this.camera.x + step[0], 0, map.width), clamp(this.camera.y + step[1], 0, map.height));
  };

  render(state: SimState, selection: ReadonlySet<number>): void {
    const map = state.map, width = this.canvas.width, height = this.canvas.height;
    const sx = width / map.width, sy = height / map.height, ctx = this.context;
    if (this.terrain.changed(map)) {
      const bg = this.backgroundContext;
      for (let i = 0; i < map.tiles.length; i++) {
        const id = map.tiles[i]!.terrain;
        bg.fillStyle = TERRAIN[id].solid ? '#4b514b' : id === 'road' ? '#8a918c' :
          id === 'pavement' ? '#9a9c90' : id === 'trench' ? '#3e4033' : id === 'water' ? '#536e6d' : id === 'crater' ? '#5b564b' :
            id === 'rubble' ? '#797970' : id === 'sandbag' ? '#b0a47e' : '#747668';
        bg.fillRect(i % map.width * sx, Math.floor(i / map.width) * sy, Math.ceil(sx), Math.ceil(sy));
      }
    }
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(this.background, 0, 0);
    // Objectifs sous les unités, pour rester lisibles sans cacher les combattants.
    for (const objective of map.objectives) {
      const owner = state.objectiveControl[objective.id];
      ctx.strokeStyle = owner ? TEAM_COLORS[owner] ?? '#e0d8b4' : 'rgba(242,230,189,.8)';
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(objective.x * sx, objective.y * sy, 3.5, 0, Math.PI * 2); ctx.stroke();
    }
    for (const point of Object.values(map.def.hospitals ?? {})) {
      if (!point) continue;
      ctx.fillStyle = '#fff2da'; ctx.fillRect(point.x * sx - 3, point.y * sy - 3, 6, 6);
      ctx.fillStyle = '#cf5149'; ctx.fillRect(point.x * sx - 0.7, point.y * sy - 2.5, 1.4, 5);
      ctx.fillRect(point.x * sx - 2.5, point.y * sy - 0.7, 5, 1.4);
    }
    for (const cache of state.supplyCaches) {
      if (map.tiles[Math.floor(cache.y) * map.width + Math.floor(cache.x)]?.terrain !== 'supplyCrate') continue;
      ctx.fillStyle = '#e9c66c'; ctx.fillRect(cache.x * sx - 2, cache.y * sy - 2, 4, 4);
    }
    for (const unit of state.units) {
      if (!unit.alive) continue;
      const x = unit.x * sx, y = unit.y * sy;
      ctx.fillStyle = unit.state === 'wounded' ? '#ef7e72' : TEAM_COLORS[unit.faction] ?? '#e6e0c8';
      ctx.beginPath(); ctx.arc(x, y, unit.faction === 'creature' ? 2.8 : 2, 0, Math.PI * 2); ctx.fill();
      if (selection.has(unit.id)) { ctx.strokeStyle = '#fff7d4'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(x, y, 3.8, 0, Math.PI * 2); ctx.stroke(); }
    }
    // Le polygone suit le vrai zoom et la rotation, et est rogné au bord de la carte.
    const corners = minimapViewCorners(this.camera);
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, width, height); ctx.clip();
    ctx.strokeStyle = 'rgba(255,245,207,.85)'; ctx.lineWidth = 1; ctx.beginPath();
    corners.forEach((point, i) => { if (i === 0) ctx.moveTo(point.x * sx, point.y * sy); else ctx.lineTo(point.x * sx, point.y * sy); });
    ctx.closePath(); ctx.stroke(); ctx.restore();
  }

  dispose(): void {
    this.summary?.removeEventListener('keydown', this.onSummaryKeyDown);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerEnd);
    this.canvas.removeEventListener('pointercancel', this.onPointerEnd);
    this.canvas.removeEventListener('keydown', this.onKeyDown);
    this.canvas.removeEventListener('contextmenu', this.onContextMenu);
  }
}
