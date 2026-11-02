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
// Le front est une ville traversable, pas une succession d'obstacles aléatoires.
// Les deux voies principales restent libres d'un bord à l'autre ; au sud, deux
// rues et une transversale relient un petit quartier et ses dépôts au carrefour.
const district = OPERATION_CARREFOUR.rows.map(row => [...row.padEnd(OPERATION_CARREFOUR.width, '.')]);
const paint = (x: number, y: number, glyph: string) => { district[y]![x] = glyph; };
for (const y of [17, 18]) for (let x = 0; x < OPERATION_CARREFOUR.width; x++)
  if (district[y]![x] === '.') paint(x, y, '=');
for (let y = 19; y <= 31; y++) for (const x of [21, 22, 25, 26])
  if (['.', 'o', 'w'].includes(district[y]![x]!)) paint(x, y, '=');
for (const y of [30, 31]) for (let x = 12; x <= 33; x++)
  if (['.', 'o', 'w'].includes(district[y]![x]!)) paint(x, y, '=');
// Deux immeubles accessibles, avec une entrée côté nord.
for (const x of [14, 29]) for (const [dy, row] of ['#+##', '#rr#', '####'].entries())
  for (let dx = 0; dx < row.length; dx++) paint(x + dx, 26 + dy, row[dx]!);
// Épaves sur une seule des deux voies, conteneurs et barrages de part et d'autre.
for (const [x, y] of [[16, 18], [17, 18], [28, 18], [29, 18]]) paint(x, y, 'V');
for (const [x, y] of [[17, 24], [18, 24], [29, 24], [30, 24]]) paint(x, y, 'C');
for (const [x, y] of [[13, 19], [31, 19], [19, 27], [27, 27], [18, 13], [28, 13]]) paint(x, y, 'B');

/** Carte finie, bataille sans victoire automatique et remplacements illimités. */
export const ENDLESS_CARREFOUR: MapDefinition = {
  ...OPERATION_CARREFOUR,
  id: 'carrefour-infini',
  name: 'Carrefour — bataille sans fin',
  briefing: 'Les deux camps combattent sans fin. Une créature indépendante attaque les deux forces et réapparaît après sa mort.',
  rows: district.map(row => row.join('')),
  legend: { ...OPERATION_CARREFOUR.legend, '#': 'urbanWall', H: 'urbanWall', t: 'urbanWall',
    V: 'wreck', C: 'container', B: 'roadblock' },
  endlessBattle: true,
  ballisticWeapons: true,
  respawn: { reservesPerFaction: 0, delayTicks: 100, unlimited: true },
  rosters: { penitents: roster, marteau: roster.map(entry => ({ ...entry })) },
};
