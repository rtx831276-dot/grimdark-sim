import type { MapDefinition } from '../map-types';
import { OPERATION_CARREFOUR } from './operation-carrefour';

const roster = [
  { unit: 'modern_melee_leader', count: 1 },
  { unit: 'modern_fighter', count: 3 },
  { unit: 'modern_blade', count: 2 },
  { unit: 'modern_rifleman', count: 3 },
  { unit: 'modern_pistol_fighter', count: 2 },
  { unit: 'modern_grenadier', count: 1 },
  { unit: 'modern_medic', count: 1 },
];
/** Carte finie, bataille sans victoire automatique et remplacements illimités. */
export const ENDLESS_CARREFOUR: MapDefinition = {
  ...OPERATION_CARREFOUR,
  id: 'carrefour-infini',
  name: 'Carrefour — bataille sans fin',
  briefing: 'Les deux camps combattent sans fin. Une créature indépendante attaque les deux forces et réapparaît après sa mort.',
  endlessBattle: true,
  respawn: { reservesPerFaction: 0, delayTicks: 100, unlimited: true },
  rosters: { penitents: roster, marteau: roster.map(entry => ({ ...entry })) },
};
