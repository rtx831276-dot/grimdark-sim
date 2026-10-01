import type { SimState } from '../types';
import { updateSoldier } from './soldierAI';

/**
 * IA du jeu, en quatre couches — voir chaque module pour son contrat :
 *
 *   commanderAI.ts  « que veut la faction ? »      objectifs, feu d'artillerie, pertes
 *   squadAI.ts      « que fait le groupe ? »       avancer/tenir/décrocher, ralliement
 *   soldierAI.ts    « que fait cet homme ? »       couvert, feu, recharge, panique
 *   undeadAI.ts     « où va la horde ? »           troisième force — NON câblée en V0
 *
 * Règle de dépendance : une couche inférieure ne consulte jamais une couche supérieure.
 * `soldierAI` applique les désignations de `squadAI` et `commanderAI` ; l'inverse n'existe
 * pas. C'est ce qui permet de remplacer la couche escouade par de vraies escouades en V1
 * sans toucher au comportement du soldat.
 *
 * Le sens de circulation est : le commandement désigne, l'escouade décide de la posture,
 * le soldat exécute, et la panique remonte d'elle-même (le moral d'un soldat est lu par
 * l'escouade, pas imposé par elle).
 */

/**
 * Avance l'IA d'un tick pour toutes les unités vivantes.
 *
 * L'ordre de parcours est celui du tableau `state.units`, et la cascade d'un soldat est
 * évaluée exactement une fois par tick : deux conditions indispensables au déterminisme
 * (même graine ⇒ même bataille, vérifié par `tests/simulation.test.ts`).
 */
export function updateAi(state: SimState, dt: number): void {
  for (const unit of state.units) {
    if (!unit.alive) continue;
    updateSoldier(state, unit, dt);
  }
}

export * from './commanderAI';
export * from './squadAI';
export * from './soldierAI';
export * from './undeadAI';
