/**
 * API publique de la simulation.
 *
 * Frontière d'architecture (testée par tests/architecture.test.ts) : ce dossier et ses
 * dépendances (src/core, src/data) ne doivent JAMAIS importer quoi que ce soit de
 * src/render, src/ui, src/input ou du DOM. La simulation doit tourner dans Node, sans
 * canvas, sans navigateur — c'est ce qui permet de la tester et de la rejouer.
 */
export * from './simulation';
export * from './ai';
export * from './combat';
export * from './morale';
export * from './explosion';
export * from './pathfinding';
export * from './map';
export * from './los';
export * from './movement';
export * from './abilities';

export type {
  GameMap,
  Order,
  Projectile,
  SimEvent,
  SimEventType,
  SimState,
  SimStats,
  Stance,
  TileState,
  Unit,
  UnitState,
} from './types';
