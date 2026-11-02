import type { SimState, Unit } from './types';

/** Réserver un renfort une seule fois, sur décès ou sortie en mode infini. */
export function queueReplacement(state: SimState, unit: Unit): void {
  const config = state.respawn;
  if (!config || (!config.unlimited && (config.reserves[unit.faction] ?? 0) <= 0)) return;
  if (!config.unlimited) config.reserves[unit.faction]!--;
  config.pending.push({ faction: unit.faction, defId: unit.defId, atTick: state.tick + config.delayTicks });
}
