import { clamp, distance } from '../core/math';
import { unitDef } from '../data/units';
import { terrainAt } from './map';
import { findPath } from './pathfinding';
import type { SimState, Unit } from './types';

/** Une unité va au maximum 25 % plus vite que sa vitesse de base, et 45 % plus lentement en terrain difficile. */
const SPEED_MIN_FACTOR = 0.55;
const SPEED_MAX_FACTOR = 1.25;

/**
 * Demande un chemin vers une destination. Le calcul est « throttlé » : une unité ne
 * recalcule pas son A* à chaque tick, sinon 26 unités suffisent à faire ramer la simulation.
 */
export function requestPath(state: SimState, unit: Unit, x: number, y: number, repathDelaySeconds = 1.4): boolean {
  if (state.tick < unit.nextRepathTick) return false;
  const sameGoal = unit.pathGoal !== null && distance(unit.pathGoal.x, unit.pathGoal.y, x, y) < 2.5;
  if (sameGoal && unit.path.length > 0) return false;

  const path = findPath(state.map, unit.x, unit.y, x, y);
  unit.nextRepathTick = state.tick + Math.round((repathDelaySeconds * 10) | 0);
  if (path === null) {
    // Chemin introuvable (objectif muré) : on abandonne proprement cet ordre.
    unit.path = [];
    unit.pathIndex = 0;
    unit.goal = null;
    unit.pathGoal = null;
    return false;
  }
  unit.path = path;
  unit.pathIndex = 0;
  unit.pathGoal = { x, y };
  return true;
}

/**
 * Avance l'unité le long de son chemin. Le coût du terrain ralentit les déplacements
 * (boue, tranchées, ruines) : traverser le no man's land coûte cher en temps, et c'est
 * là que le feu adverse fait la différence.
 */
export function followPath(state: SimState, unit: Unit, dt: number): boolean {
  if (unit.path.length === 0) return false;
  const def = unitDef(unit.defId);
  const node = unit.path[unit.pathIndex];
  if (!node) {
    unit.path = [];
    unit.pathIndex = 0;
    return false;
  }

  const terrain = terrainAt(state.map, unit.x, unit.y);
  const terrainFactor = clamp(1 / terrain.moveCost, SPEED_MIN_FACTOR, 1);
  let speed = def.speed * terrainFactor;
  if (unit.state === 'pinned') speed *= 0.45;
  if (unit.state === 'broken') speed *= 1.15;
  if (unit.morale <= 45) speed *= 0.9;
  speed = clamp(speed, def.speed * SPEED_MIN_FACTOR * 0.4, def.speed * SPEED_MAX_FACTOR);

  const step = speed * dt;
  const dx = node.x - unit.x;
  const dy = node.y - unit.y;
  const remaining = Math.hypot(dx, dy);

  if (remaining <= step || remaining < 1e-4) {
    unit.x = node.x;
    unit.y = node.y;
    unit.pathIndex++;
    if (unit.pathIndex >= unit.path.length) {
      unit.path = [];
      unit.pathIndex = 0;
      unit.pathGoal = null;
    }
  } else {
    unit.x += (dx / remaining) * step;
    unit.y += (dy / remaining) * step;
    unit.facing = Math.atan2(dy, dx);
  }

  if (unit.state === 'idle') unit.state = 'moving';
  return true;
}

/** Vrai si l'unité est arrivée (ou presque) à sa destination. */
export function hasArrived(unit: Unit, x: number, y: number, tolerance = 0.6): boolean {
  return Math.hypot(unit.x - x, unit.y - y) <= tolerance;
}

/**
 * Séparation : les unités ne peuvent pas se superposer. Un simple écart de positions
 * suffit à l'échelle du prototype et évite un système de collision complet.
 */
export function separateUnits(state: SimState, dt: number): void {
  const units = state.units;
  const minDistance = 0.62;
  for (let i = 0; i < units.length; i++) {
    const a = units[i]!;
    if (!a.alive) continue;
    for (let j = i + 1; j < units.length; j++) {
      const b = units[j]!;
      if (!b.alive) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy);
      if (dist >= minDistance) continue;
      // Deux unités exactement superposées : on les écarte d'un pas déterministe.
      const nx = dist === 0 ? (i % 2 === 0 ? 1 : -1) : dx / dist;
      const ny = dist === 0 ? 1 : dy / dist;
      const push = (minDistance - dist) * 0.5 * clamp(dt * 20, 0, 1);
      a.x -= nx * push;
      a.y -= ny * push;
      b.x += nx * push;
      b.y += ny * push;
    }
  }
}
