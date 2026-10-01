import { clamp } from '../core/math';
import { unitDef } from '../data/units';
import type { SimState, Unit } from './types';

/** Seuils de comportement. Les modifier change tout le ressenti du jeu : à doser. */
export const MORALE_SHATTERED = 30;
export const MORALE_SHAKEN = 45;
export const MORALE_RALLYED = 50;
export const SUPPRESSION_PINNED = 55;

/** Une unité compte encore dans l'ordre de bataille si elle tient la ligne. */
export function isEffective(unit: Unit): boolean {
  return unit.alive && unit.state !== 'broken';
}

/** Applique une perte de moral, en tenant compte de la discipline. */
export function applyMoraleShock(state: SimState, unit: Unit, amount: number, label?: string): void {
  if (!unit.alive) return;
  const def = unitDef(unit.defId);
  const resistance = clamp(1 - def.discipline * 0.55, 0.2, 1);
  unit.morale = clamp(unit.morale - amount * resistance, 0, 100);
  if (def.traits.includes('fearless')) unit.morale = Math.max(unit.morale, 55);
  if (def.traits.includes('mechanical')) unit.morale = 100;
  markMoraleState(state, unit, label);
}

/** Ajoute de la suppression (balles qui claquent autour, explosions proches). */
export function addSuppression(state: SimState, unit: Unit, amount: number): void {
  if (!unit.alive) return;
  // Fureur de charge : la doctrine promet un assaut de huit secondes presque impossible à
  // arrêter (docs/GAME_DESIGN.md). Sans ce garde, un tir nourri cloue l'unité en pleine charge.
  if (unit.chargeTicks > 0) return;
  const def = unitDef(unit.defId);
  const cap = def.traits.includes('mechanical') ? 40 : 100;
  const resistance = clamp(1 - def.discipline * 0.5, 0.25, 1);
  unit.suppression = clamp(unit.suppression + amount * resistance, 0, cap);
  unit.sinceUnderFire = 0;
  markMoraleState(state, unit, 'suppression');
}

/**
 * Traduit l'état intérieur (moral + suppression) en état visible : engagé, cloué au sol
 * ou en fuite. C'est le seul endroit qui déclenche les transitions, pour éviter que
 * deux modules donnent des ordres contradictoires à la même unité.
 */
function markMoraleState(state: SimState, unit: Unit, label?: string): void {
  const wasBroken = unit.state === 'broken';
  const wasPinned = unit.state === 'pinned';

  if (unit.morale <= MORALE_SHATTERED || (unit.suppression >= 92 && unit.morale < 40)) {
    if (!wasBroken) {
      unit.state = 'broken';
      unit.path = [];
      unit.goal = null;
      unit.forcedTargetId = null;
      state.events.push({ tick: state.tick, type: 'broken', unitId: unit.id, faction: unit.faction, x: unit.x, y: unit.y, label });
    }
    return;
  }

  if (unit.suppression >= SUPPRESSION_PINNED) {
    if (!wasPinned) {
      unit.state = 'pinned';
      // Une unité clouée renonce à son assaut : elle se colle au sol et cherche un abri.
      unit.goal = null;
      state.events.push({ tick: state.tick, type: 'pinned', unitId: unit.id, faction: unit.faction, x: unit.x, y: unit.y, label });
    }
    return;
  }

  if (wasBroken) {
    if (unit.morale >= MORALE_RALLYED) {
      unit.state = 'idle';
      state.events.push({ tick: state.tick, type: 'recovered', unitId: unit.id, faction: unit.faction, x: unit.x, y: unit.y });
    }
    return;
  }

  if (wasPinned && unit.suppression < SUPPRESSION_PINNED - 12) {
    unit.state = 'idle';
    state.events.push({ tick: state.tick, type: 'recovered', unitId: unit.id, faction: unit.faction, x: unit.x, y: unit.y });
  }
}

/** Un chef à portée redonne du cœur aux troupes (rayon de commandement). */
export function leaderWithin(state: SimState, unit: Unit, radius = 8): Unit | null {
  let best: Unit | null = null;
  let bestDistance = radius;
  for (const other of state.units) {
    if (!other.alive || other.faction !== unit.faction || other.id === unit.id) continue;
    const def = unitDef(other.defId);
    const hasCommand = def.abilities.includes('rally');
    if (!hasCommand) continue;
    const dist = Math.hypot(other.x - unit.x, other.y - unit.y);
    if (dist < bestDistance) {
      bestDistance = dist;
      best = other;
    }
  }
  return best;
}

/** Récupération (ou érosion) du moral et de la suppression, appelée à chaque tick. */
export function updateMorale(state: SimState, unit: Unit, dt: number): void {
  if (!unit.alive) return;
  const def = unitDef(unit.defId);
  unit.sinceUnderFire += dt;

  // Décrue de la suppression : d'autant plus rapide que l'unité est disciplinée et abritée.
  // La suppression doit coller à la peau : c'est elle qui cloue la ligne au sol.
  // Trop rapide à se dissiper, elle ne pèse plus sur le jeu (mesuré en headless).
  const shelter = unit.cover * 0.5;
  const decay = (3 + def.discipline * 4.5) * (1 + shelter);
  unit.suppression = clamp(unit.suppression - decay * dt, 0, 100);

  const underFire = unit.sinceUnderFire < 2.5;
  if (!underFire) {
    const leader = leaderWithin(state, unit);
    // La récupération est volontairement lente : un moral qui remonte en deux secondes
    // rendrait les pertes et la suppression décoratives.
    const base = 0.9 + def.discipline * 2.2;
    unit.morale = clamp(unit.morale + (base + (leader ? 3 : 0)) * dt, 0, 100);
  } else {
    // Sous le feu, le moral s'effrite même sans être touché.
    const drain = (1.5 + (unit.suppression / 100) * 4) * dt;
    unit.morale = clamp(unit.morale - drain * clamp(1 - def.discipline * 0.5, 0.25, 1), 0, 100);
  }

  if (def.traits.includes('fearless')) unit.morale = Math.max(unit.morale, 55);
  if (def.traits.includes('mechanical')) unit.morale = 100;

  markMoraleState(state, unit);
}

/** Capacité « rally » : rend du moral et secoue la suppression dans un rayon. */
export function useRally(state: SimState, leader: Unit, radius = 8): number {
  let affected = 0;
  for (const other of state.units) {
    if (!other.alive || other.faction !== leader.faction) continue;
    const dist = Math.hypot(other.x - leader.x, other.y - leader.y);
    if (dist > radius) continue;
    const falloff = 1 - dist / radius;
    other.morale = clamp(other.morale + (25 + 30 * falloff), 0, 100);
    other.suppression = clamp(other.suppression - (30 + 40 * falloff), 0, 100);
    affected++;
    if (other.state === 'broken' && other.morale >= MORALE_RALLYED) {
      other.state = 'idle';
      other.path = [];
      state.events.push({ tick: state.tick, type: 'recovered', unitId: other.id, faction: other.faction, x: other.x, y: other.y });
    }
  }
  state.events.push({ tick: state.tick, type: 'rally', unitId: leader.id, faction: leader.faction, x: leader.x, y: leader.y, amount: affected, radius });
  return affected;
}
