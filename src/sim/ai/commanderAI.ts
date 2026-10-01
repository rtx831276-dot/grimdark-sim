import { distance } from '../../core/math';
import type { Vec2 } from '../../core/ids';
import type { ObjectiveDef } from '../../data/map-types';
import { artilleryReady } from '../abilities';
import { lineOfSight } from '../los';
import { bestObjectiveFor } from '../map';
import type { SimState, Unit } from '../types';

/**
 * COUCHE COMMANDEMENT — « que veut la faction sur ce champ de bataille ? »
 *
 * Rôle d'un commandant : choisir les objectifs, décider où concentrer le feu lourd,
 * réagir aux pertes. Cette couche ne donne jamais d'ordre de mouvement à une unité :
 * elle produit des désignations que les couches inférieures appliquent.
 *
 * En V0, elle possède deux décisions réelles :
 *   1. **la désignation d'objectif** (quel point du terrain vaut qu'on y marche) ;
 *   2. **l'allocation du feu d'artillerie** (est-ce qu'un groupe ennemi vaut 5 obus).
 *
 * Aucun modèle de langage n'intervient ici, et il ne doit pas en intervenir : la
 * décision tactique est déterministe et testable. Un LLM (ou Master Copilot) n'aurait sa
 * place qu'**au-dessus** de cette couche, pour écrire une doctrine, un briefing ou un
 * scénario — jamais pour décider, tir par tir, ce que fait un soldat.
 *
 * ── API prévue en V1 (non implémentée, décrite pour cadrer la suite) ────────────────
 *   commanderPlanOffensive(state): { axis: ObjectiveDef; reserveRatio: number }
 *   commanderAssignSquads(state, plan): SquadAssignment[]
 *   commanderReactToLosses(state): void   // replier un flanc, barrage de couverture,
 *                                         // ou tenir coûte que coûte selon la doctrine
 */

export interface CommanderSituation {
  faction: string;
  effectiveUnits: number;
  objectivesHeld: number;
  score: number;
  barragesRemaining: number;
  /** Objectif actuellement désigné par le commandant pour l'axe d'attaque. */
  designatedObjective: ObjectiveDef | null;
}

/**
 * Désigne l'objectif que doit viser une unité : le plus valorisé, en évitant de
 * s'entasser là où l'ennemi est déjà massé.
 *
 * NOTE V0 : la désignation est recalculée par unité (donc légèrement différente d'un bout
 * à l'autre de la ligne). C'est volontaire — cela étale le front au lieu de faire suivre
 * une colonne. La V1 la calculera une fois par faction puis la diffusera aux escouades.
 */
export function commanderDesignateObjective(state: SimState, unit: Unit): ObjectiveDef {
  const contested = enemyConcentration(state, unit.faction);
  return bestObjectiveFor(state.map, unit.x, unit.y, contested ?? undefined);
}

/**
 * Concentration ennemie : centre de gravité des forces adverses. Sert à éviter qu'un
 * assaut converge tout entier sur l'objectif où l'ennemi est le plus dense.
 */
export function enemyConcentration(state: SimState, faction: string): Vec2 | null {
  let sx = 0;
  let sy = 0;
  let count = 0;
  for (const other of state.units) {
    if (!other.alive || other.faction === faction) continue;
    sx += other.x;
    sy += other.y;
    count++;
  }
  if (count === 0) return null;
  return { x: sx / count, y: sy / count };
}

/**
 * Allocation du feu d'artillerie : où le commandant engage-t-il ses obus ?
 *
 * Le feu hors-carte est une ressource rare (2 barrages par bataille). On ne le dépense
 * que sur un groupe ennemi **visible** et dense. Retourne null si l'observateur est à
 * bout de charges, tient un temps de recharge, est sous le feu, ou si la faction n'a plus
 * de barrage disponible.
 */
export function commanderFireSupportTarget(state: SimState, unit: Unit): Vec2 | null {
  // Même règle que pour le joueur : charges restantes et pas de recharge en cours.
  if (!artilleryReady(unit)) return null;
  if (unit.suppression >= 45) return null; // un observateur sous le feu ne désigne rien

  const runtime = state.factions[unit.faction];
  if (!runtime || runtime.barrages <= 0) return null;

  return enemyCluster(state, unit, 24);
}

/**
 * Cherche un groupe d'ennemis visible : c'est la seule cible qui vaut un barrage.
 * Un observateur ne gaspille pas 5 obus sur un éclaireur isolé.
 */
function enemyCluster(state: SimState, unit: Unit, maxRange: number): Vec2 | null {
  let best: Vec2 | null = null;
  let bestScore = 0;
  for (const other of state.units) {
    if (!other.alive || other.faction === unit.faction) continue;
    if (distance(unit.x, unit.y, other.x, other.y) > maxRange) continue;
    if (!lineOfSight(state.map, unit.x, unit.y, other.x, other.y).visible) continue;

    let neighbours = 0;
    for (const third of state.units) {
      if (!third.alive || third.faction === unit.faction || third.id === other.id) continue;
      if (distance(other.x, other.y, third.x, third.y) <= 3) neighbours++;
    }
    // Seuil volontairement élevé : un barrage est une ressource rare, pas un réflexe.
    if (neighbours < 2) continue;

    const score = neighbours * 2 + (1 - other.cover) + (1 - other.hp / other.maxHp);
    if (score > bestScore) {
      bestScore = score;
      best = { x: other.x, y: other.y };
    }
  }
  return best;
}

/** Nombre d'unités réellement opérationnelles, tel que le commandant le perçoit. */
export function commanderEffectiveCount(state: SimState, faction: string): number {
  let count = 0;
  for (const unit of state.units) {
    if (!unit.alive || unit.faction !== faction) continue;
    if (unit.state === 'broken') continue;
    count++;
  }
  return count;
}

/**
 * Instantané de situation, destiné au HUD et aux tests de diagnostic. Cette fonction est
 * en lecture seule : elle ne participe à aucune décision.
 */
export function commanderSituation(state: SimState, faction: string): CommanderSituation {
  const runtime = state.factions[faction];
  return {
    faction,
    effectiveUnits: commanderEffectiveCount(state, faction),
    objectivesHeld: runtime ? runtime.objectivesHeld : 0,
    score: runtime ? runtime.score : 0,
    barragesRemaining: runtime ? runtime.barrages : 0,
    designatedObjective: null,
  };
}
