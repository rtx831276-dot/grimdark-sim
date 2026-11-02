import { TERRAIN } from '../data/terrain';
import type { GameMap, Projectile } from './types';

const GRAVITY = 9.81;
const RADIUS = 0.06;
const BOUNCE = 0.34;
const SURFACE_FRICTION = 0.72;
const MAX_DISTANCE_STEP = 0.035;

/** État physique déterministe, indépendant du moteur de rendu. */
export interface GrenadeMotion {
  height: number;
  previousHeight: number;
  previousX: number;
  previousY: number;
  velocityX: number;
  velocityY: number;
  velocityHeight: number;
  bounces: number;
}

/** Vitesse initiale : arc balistique qui retombe sur la cible à l'échéance prévue. */
export function createGrenadeMotion(fromX: number, fromY: number, toX: number, toY: number, duration: number): GrenadeMotion {
  const time = Math.max(0.1, duration);
  const height = 0.9;
  return { height, previousHeight: height, previousX: fromX, previousY: fromY,
    velocityX: (toX - fromX) / time, velocityY: (toY - fromY) / time,
    velocityHeight: (RADIUS - height + 0.5 * GRAVITY * time * time) / time, bounces: 0 };
}

/** Hauteur des volumes visibles touchant la sphère ; la limite de carte est infranchissable. */
function obstacleTop(map: GameMap, x: number, y: number): number {
  if (x - RADIUS < 0 || y - RADIUS < 0 || x + RADIUS > map.width || y + RADIUS > map.height) return Infinity;
  let top = 0;
  for (let ty = Math.floor(y - RADIUS); ty <= Math.floor(y + RADIUS); ty++) {
    for (let tx = Math.floor(x - RADIUS); tx <= Math.floor(x + RADIUS); tx++) {
      const tile = map.tiles[ty * map.width + tx];
      if (!tile || tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) continue;
      const def = TERRAIN[tile.terrain];
      const h = def.height * 0.82;
      if (h < 0.08) continue;
      const half = tile.terrain === 'tree' ? 0.09 : 0.48;
      const dx = Math.max(Math.abs(x - (tx + 0.5)) - half, 0);
      const dy = Math.max(Math.abs(y - (ty + 0.5)) - half, 0);
      if (dx * dx + dy * dy <= RADIUS * RADIUS) top = Math.max(top, tile.terrain === 'tree' ? Math.max(h, 1.2) : h);
    }
  }
  return top;
}

/** Trajectoire par petits pas, rebonds amortis sur sol, obstacles et limites de carte. */
export function advanceGrenade(map: GameMap, projectile: Projectile, dt: number): void {
  const m = projectile.grenadeMotion;
  if (!m || dt <= 0) return;
  m.previousX = projectile.x; m.previousY = projectile.y; m.previousHeight = m.height;
  const speed = Math.max(Math.abs(m.velocityX), Math.abs(m.velocityY), Math.abs(m.velocityHeight));
  const steps = Math.max(1, Math.ceil(speed * dt / MAX_DISTANCE_STEP));
  const slice = dt / steps;
  for (let i = 0; i < steps; i++) {
    const nextX = projectile.x + m.velocityX * slice;
    if (obstacleTop(map, nextX, projectile.y) > m.height - RADIUS) {
      m.velocityX = -m.velocityX * BOUNCE; m.velocityY *= SURFACE_FRICTION; m.bounces++;
    } else projectile.x = nextX;
    const nextY = projectile.y + m.velocityY * slice;
    if (obstacleTop(map, projectile.x, nextY) > m.height - RADIUS) {
      m.velocityY = -m.velocityY * BOUNCE; m.velocityX *= SURFACE_FRICTION; m.bounces++;
    } else projectile.y = nextY;
    const prevHeight = m.height;
    const nextHeight = m.height + m.velocityHeight * slice - 0.5 * GRAVITY * slice * slice;
    m.velocityHeight -= GRAVITY * slice;
    const floor = Math.max(RADIUS, obstacleTop(map, projectile.x, projectile.y) + RADIUS);
    if (nextHeight <= floor && prevHeight >= floor - 1e-6) {
      m.height = floor;
      if (m.velocityHeight < -0.25) { m.velocityHeight = -m.velocityHeight * BOUNCE; m.bounces++; }
      else m.velocityHeight = 0;
      m.velocityX *= SURFACE_FRICTION; m.velocityY *= SURFACE_FRICTION;
      if (Math.abs(m.velocityX) < 0.02) m.velocityX = 0;
      if (Math.abs(m.velocityY) < 0.02) m.velocityY = 0;
    } else m.height = nextHeight;
  }
}
