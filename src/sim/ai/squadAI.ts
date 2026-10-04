import { distance } from '../../core/math';
import type { ObjectiveDef } from '../../data/map-types';
import type { SimState, Unit } from '../types';
import { commanderDesignateObjective } from './commanderAI';

/**
 * COUCHE ESCOUADE — « que fait un groupe d'hommes, et pas un homme tout seul ? »
 *
 * Responsabilités prévues (mission V0/V1) : avancer, tenir, déborder, supprimer,
 * décrocher, prendre un objectif.
 *
 * ── Choix d'implémentation V0 ──────────────────────────────────────────────────────
 * Il n'existe PAS d'objet « escouade » dans l'état de la simulation. Les unités d'une
 * même faction forment une masse cohérente sans structure explicite. Les décisions
 * collectives sont donc dérivées localement, à partir de la situation des voisins :
 *
 *   - `squadMovementIntent`  : la posture collective déduite de la posture de l'unité
 *                              (assaut → objectif désigné par le commandement, tenir,
 *                              repli vers la ligne arrière) ;
 *   - `squadShouldRally`     : « la ligne flanche-t-elle assez pour qu'on ralliie ? »
 *   - `alliesInShock`        : combien de camarades sont cloués ou démoralisés.
 *
 * Ce choix garde la simulation déterministe et légère (aucun graphe d'escouades à
 * maintenir) tout en isolant clairement la décision collective de l'exécution
 * individuelle. La V1 introduira de vraies escouades (`SquadId` sur chaque unité,
 * assignation par le commandant) sans changer le contrat de ces fonctions.
 *
 * ── API prévue en V1 ───────────────────────────────────────────────────────────────
 *   assignSquads(state, faction): SquadId[]        // regroupement par proximité
 *   squadFlankTarget(state, squadId): Vec2 | null  // manœuvre de débordement
 *   squadSuppressOrder(state, squadId, targetId)   // concentration du feu
 */

/** Seuils collectifs, regroupés pour être réglables sans lire le reste du fichier. */
export const SQUAD_TUNING = {
  /** Nombre de camarades en détresse qui déclenche un ralliement. */
  rallyThreshold: 2,
  /** Suppression au-delà de laquelle un camarade est considéré comme cloué au sol. */
  shockSuppression: 60,
  /** Moral en dessous duquel un camarade est considéré comme démoralisé. */
  shockMorale: 40,
} as const;

/** Intention de déplacement décidée collectivement, exécutée par le soldat. */
export type SquadMovementIntent =
  | { kind: 'advance'; objective: ObjectiveDef }
  | { kind: 'hold' }
  | { kind: 'fallback'; line: { x: number; y: number } | null };

/**
 * Décide ce que le groupe fait quand aucun ennemi n'est à portée : pousser vers
 * l'objectif désigné par le commandement, tenir la position, ou décrocher.
 */
export function squadMovementIntent(state: SimState, unit: Unit): SquadMovementIntent {
  if (unit.stance === 'fallback') {
    return { kind: 'fallback', line: state.map.def.fallbackLine[unit.faction] ?? null };
  }
  if (unit.stance === 'hold') {
    return { kind: 'hold' };
  }
  return { kind: 'advance', objective: commanderDesignateObjective(state, unit) };
}

/** Combien de camarades sont, à cet instant, hors d'état de combattre correctement. */
export function alliesInShock(state: SimState, unit: Unit): number {
  let inShock = 0;
  for (const other of state.units) {
    if (!other.alive || other.faction !== unit.faction || other.id === unit.id) continue;
    if (other.suppression > SQUAD_TUNING.shockSuppression || other.morale < SQUAD_TUNING.shockMorale) inShock++;
  }
  return inShock;
}

/**
 * « Faut-il rallier ? » — décision collective : un officier ne dépense sa voix que si la
 * ligne flanche autour de lui, pas pour un homme qui a un peu peur.
 */
export function squadShouldRally(state: SimState, unit: Unit): boolean {
  return alliesInShock(state, unit) >= SQUAD_TUNING.rallyThreshold;
}

/** Nombre d'unités de la faction encore debout dans un rayon donné (cohésion locale). */
export function squadLocalStrength(state: SimState, unit: Unit, radius = 8): number {
  let count = 0;
  for (const other of state.units) {
    if (!other.alive || other.faction !== unit.faction || other.id === unit.id) continue;
    if (distance(unit.x, unit.y, other.x, other.y) <= radius) count++;
  }
  return count;
}
