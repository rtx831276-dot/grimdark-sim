import { weapon } from '../../data/weapons';
import { unitDef } from '../../data/units';
import { moveWithTerrain, segmentClearOfTerrain } from '../collision';
import { meleeHitboxIntersects } from '../melee-hitbox';
import { meleeMove } from '../melee-timing';
import type { SimState, Unit } from '../types';

export const DODGE_CLIPS = [
  { name: 'Stand_Dodge', durationTicks: 12 }, { name: 'Stand_Dodge_1', durationTicks: 12 },
  { name: 'Stand_Dodge_2', durationTicks: 15 }, { name: 'Stand_Dodge_3', durationTicks: 18 },
  { name: 'Roll_Dodge', durationTicks: 14 }, { name: 'Roll_Dodge_1', durationTicks: 12 },
  { name: 'Roll_Dodge_2', durationTicks: 15 }, { name: 'Roll_Dodge_3', durationTicks: 14 },
  { name: 'Roll_Dodge_4', durationTicks: 18 },
] as const;
export type DodgeClipName = typeof DODGE_CLIPS[number]['name'];
const STEPS = 4;
const STEP_DISTANCE = 0.23;
const COOLDOWN_TICKS = 30;

function stepDodge(state: SimState, unit: Unit): void {
  const dodge = unit.meleeDodge;
  if (!dodge) return;
  if (!unit.alive || unit.state === 'broken' || unit.goal || unit.stance === 'fallback') {
    unit.meleeDodge = null;
    return;
  }
  if (state.tick >= dodge.endTick) {
    unit.meleeDodge = null;
    return;
  }
  if (state.tick < dodge.startTick + STEPS) {
    const position = moveWithTerrain(state.map, unit.x, unit.y, dodge.stepX, dodge.stepY);
    unit.x = position.x; unit.y = position.y;
  }
}

/** Esquive réelle, mais sans invulnérabilité : le déplacement seul peut éviter la hitbox. */
export function updateMeleeDodges(state: SimState, controlledUnitId?: number): void {
  for (const unit of state.units) {
    if (unit.id === controlledUnitId) continue;
    if (unit.meleeDodge) { stepDodge(state, unit); continue; }
    if (!unit.alive || unit.state === 'broken' || unit.state === 'pinned' || unit.meleeAttack?.resolved || unit.goal ||
        unit.stance !== 'advance' || state.tick < unit.nextDodgeTick || !['unarmed', 'modern_sword'].includes(weapon(unitDef(unit.defId).weapon).id)) continue;
    const attacker = state.units.find(other => {
      const attack = other.meleeAttack;
      return other.alive && other.faction !== unit.faction && attack && !attack.resolved && attack.targetId === unit.id &&
        attack.impactTick - state.tick >= 0 && attack.impactTick - state.tick <= 4 &&
        meleeHitboxIntersects(other.x, other.y, attack.facing, meleeMove(attack.clip), unit.x, unit.y);
    });
    if (!attacker?.meleeAttack) continue;
    // Départage sans RNG et avec récupération : toutes les attaques ne sont pas esquivées.
    if ((unit.id * 13 + attacker.id * 7 + attacker.meleeAttack.startTick) % 3 !== 0) continue;
    const direction = attacker.meleeAttack.facing;
    const preferred = (unit.id + attacker.id) % 2 === 0 ? 1 : -1;
    let stepX = 0, stepY = 0;
    for (const side of [preferred, -preferred]) {
      const dx = -Math.sin(direction) * side * STEP_DISTANCE;
      const dy = Math.cos(direction) * side * STEP_DISTANCE;
      if (!segmentClearOfTerrain(state.map, unit, { x: unit.x + dx * STEPS, y: unit.y + dy * STEPS })) continue;
      stepX = dx; stepY = dy; break;
    }
    if (stepX === 0 && stepY === 0) continue;
    const clip = DODGE_CLIPS[(unit.id + attacker.meleeAttack.startTick) % DODGE_CLIPS.length]!;
    // Une esquive peut sacrifier un coup encore en préparation, jamais un impact déjà résolu.
    unit.meleeAttack = null;
    unit.meleeDodge = { clip: clip.name, startTick: state.tick, endTick: state.tick + clip.durationTicks, stepX, stepY };
    unit.nextDodgeTick = state.tick + COOLDOWN_TICKS;
    unit.path = []; unit.pathGoal = null; unit.pathIndex = 0;
    unit.facing = Math.atan2(attacker.y - unit.y, attacker.x - unit.x);
    unit.intent = 'esquive';
    state.events.push({ tick: state.tick, type: 'dodge', unitId: unit.id, targetId: attacker.id, faction: unit.faction, x: unit.x, y: unit.y, label: clip.name });
    stepDodge(state, unit);
  }
}
