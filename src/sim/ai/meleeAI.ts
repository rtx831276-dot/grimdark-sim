import { distance } from '../../core/math';
import type { Vec2 } from '../../core/ids';
import { unitDef } from '../../data/units';
import { weapon } from '../../data/weapons';
import { lineOfSight } from '../los';
import { isSolid } from '../map';
import { followPath } from '../movement';
import { findPath } from '../pathfinding';
import type { SimState, Unit } from '../types';
import { COMMS_RADIUS, reportForTarget } from './communications';

/** Nombre d'alliés déjà occupés par un ennemi donné : évite de délaisser un flanc. */
function alliesEngaging(state: SimState, unit: Unit, target: Unit): number {
  let count = 0;
  for (const ally of state.units) {
    if (!ally.alive || ally.id === unit.id || ally.faction !== unit.faction || ally.state === 'broken') continue;
    if (ally.goal || distance(ally.x, ally.y, target.x, target.y) > 8) continue;
    if ((ally.forcedTargetId ?? ally.targetId) === target.id) count++;
  }
  return count;
}

/**
 * Choisit un adversaire visible ou détecté, en privilégiant les menaces proches et en
 * répartissant les alliés entre plusieurs cibles. Ne change jamais un ordre explicite.
 */
export function selectMeleeTarget(state: SimState, unit: Unit): Unit | null {
  const def = unitDef(unit.defId);
  const range = weapon(def.weapon).range;
  let best: Unit | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const enemy of state.units) {
    if (!enemy.alive || enemy.faction === unit.faction) continue;
    const dist = distance(unit.x, unit.y, enemy.x, enemy.y);
    const visible = dist <= def.vision && lineOfSight(state.map, unit.x, unit.y, enemy.x, enemy.y).visible;
    const report = dist <= def.vision + COMMS_RADIUS ? reportForTarget(state, unit, enemy) : null;
    // L'IA ne voit pas à travers les murs. Un renseignement récent peut néanmoins
    // lui signaler une menace, sans lui donner une portée de détection illimitée.
    if (state.map.def.tacticalCommunications ? !visible && !report : dist > def.vision) continue;
    const engaged = alliesEngaging(state, unit, enemy);
    const threatensUnit = (enemy.forcedTargetId ?? enemy.targetId) === unit.id;
    const score = -dist + (dist <= range ? 4 : 0) + (visible ? 0.8 : 0)
      + (threatensUnit ? 1.5 : 0) + (report?.kind === 'help' ? 2.5 : 0) + (unit.targetId === enemy.id ? 1 : 0)
      - Math.max(0, engaged - 1) * 2.5;
    if (score > bestScore || (score === bestScore && enemy.id < (best?.id ?? Infinity))) {
      best = enemy;
      bestScore = score;
    }
  }
  return best;
}

/** Positions de contact praticables, classées par proximité et encombrement allié. */
export function meleeApproachSlots(state: SimState, unit: Unit, target: Unit): Vec2[] {
  const range = weapon(unitDef(unit.defId).weapon).range;
  const cx = Math.floor(target.x);
  const cy = Math.floor(target.y);
  const slots: Array<{ point: Vec2; score: number }> = [];
  const radius = Math.ceil(range + 1);
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      if (isSolid(state.map, x, y)) continue;
      const point = { x: x + 0.5, y: y + 0.5 };
      const dist = distance(point.x, point.y, target.x, target.y);
      // On se tient à portée sans viser le centre occupé par l'adversaire.
      if (dist > range || dist < 0.62) continue;
      if (!lineOfSight(state.map, point.x, point.y, target.x, target.y).visible) continue;
      let occupied = 0;
      for (const ally of state.units) {
        if (!ally.alive || ally.id === unit.id || ally.faction !== unit.faction) continue;
        const sameTarget = (ally.forcedTargetId ?? ally.targetId) === target.id;
        if (distance(ally.x, ally.y, point.x, point.y) < 0.7 ||
          (sameTarget && ally.path.length > 0 && ally.pathGoal && distance(ally.pathGoal.x, ally.pathGoal.y, point.x, point.y) < 0.7)) occupied++;
      }
      slots.push({ point, score: distance(unit.x, unit.y, point.x, point.y) + occupied * 5 });
    }
  }
  slots.sort((a, b) => a.score - b.score || a.point.y - b.point.y || a.point.x - b.point.x);
  return slots.map((slot) => slot.point);
}

/**
 * Approche un ennemi mobile. Essaye les positions de contact accessibles au lieu de
 * faire converger tous les attaquants sur la même case ; A* reste borné et espacé.
 */
export function pursueMeleeTarget(state: SimState, unit: Unit, target: Unit, dt: number): void {
  const range = weapon(unitDef(unit.defId).weapon).range;
  const currentGoalStillUseful = unit.pathGoal && unit.path.length > 0 &&
    distance(unit.pathGoal.x, unit.pathGoal.y, target.x, target.y) <= range + 0.8 &&
    lineOfSight(state.map, unit.pathGoal.x, unit.pathGoal.y, target.x, target.y).visible;
  if (state.tick < unit.nextRepathTick || currentGoalStillUseful) {
    followPath(state, unit, dt);
    return;
  }
  // Les cases candidates sont peu nombreuses (voisines de l'ennemi). Les parcourir
  // jusqu'au premier chemin possible évite de rester bloqué derrière un mur.
  const slots = meleeApproachSlots(state, unit, target);
  for (const slot of [...slots, { x: target.x, y: target.y }]) {
    const path = findPath(state.map, unit.x, unit.y, slot.x, slot.y);
    if (path === null) continue;
    // A* renvoie [] pour deux positions dans la même tuile ; atteindre quand même
    // le centre retenu si l'attaquant n'est pas encore à portée.
    if (path.length === 0 && distance(unit.x, unit.y, slot.x, slot.y) > 0.05) path.push(slot);
    unit.path = path;
    unit.pathIndex = 0;
    unit.pathGoal = slot;
    unit.nextRepathTick = state.tick + 12;
    followPath(state, unit, dt);
    return;
  }
  unit.path = [];
  unit.pathIndex = 0;
  unit.pathGoal = null;
  unit.nextRepathTick = state.tick + 12;
}
