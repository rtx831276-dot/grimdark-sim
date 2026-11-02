import { distance } from '../../core/math';
import { unitDef } from '../../data/units';
import { weapon } from '../../data/weapons';
import { canFire, fireSalvo } from '../combat';
import { lineOfSight } from '../los';
import type { SimState, Unit } from '../types';
import { pursueMeleeTarget } from './meleeAI';

/** Prédateur indépendant : choisit le soldat détecté le plus proche, quel que soit son camp. */
export function updateCreature(state: SimState, creature: Unit, dt: number): void {
  const vision = unitDef(creature.defId).vision;
  let target: Unit | null = null;
  let closest = Infinity;
  for (const other of state.units) {
    if (!other.alive || other.faction === creature.faction) continue;
    const dist = distance(creature.x, creature.y, other.x, other.y);
    if (dist > vision || dist > closest || !lineOfSight(state.map, creature.x, creature.y, other.x, other.y).visible) continue;
    if (dist < closest || other.id < (target?.id ?? Infinity)) { target = other; closest = dist; }
  }
  if (!target) { creature.targetId = null; creature.path = []; creature.pathGoal = null; creature.intent = 'à l’affût'; return; }
  if (creature.targetId !== target.id) { creature.path = []; creature.pathGoal = null; creature.nextRepathTick = 0; }
  creature.targetId = target.id;
  creature.facing = Math.atan2(target.y - creature.y, target.x - creature.x);
  if (closest <= weapon('creature_claw').range) {
    creature.path = []; creature.pathGoal = null; creature.state = 'engaging'; creature.intent = 'attaque';
    if (canFire(creature)) fireSalvo(state, creature, target);
  } else {
    creature.intent = 'chasse';
    pursueMeleeTarget(state, creature, target, dt);
  }
}
