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
// Contournements ouest et est : ils relient les deux lignes du front à une
// rue nord et évitent de forcer tous les combats sur le carrefour central.
for (let y = 3; y <= 31; y++) for (const x of [9, 10, 34, 35])
  if (['.', 'o', 'w'].includes(district[y]![x]!)) paint(x, y, '=');
for (let x = 9; x <= 35; x++) paint(x, 3, '=');
for (const y of [30, 31]) for (let x = 9; x <= 35; x++)
  if (['.', 'o', 'w'].includes(district[y]![x]!)) paint(x, y, '=');
// Deux petits ateliers au nord, ouvrant directement sur la rue transversale.
for (const x of [12, 29]) for (const [dy, row] of ['####', '#rr#', '#+##'].entries())
  for (let dx = 0; dx < row.length; dx++) paint(x + dx, dy, row[dx]!);
// Cours de service au nord et au sud ; les objets existants sont conservés.
for (const [x0, x1, y0, y1] of [[12, 18, 9, 12], [27, 32, 10, 12], [12, 19, 23, 25], [28, 32, 23, 25]])
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++)
    if (district[y]![x] === '.') paint(x, y, 'p');
// Postes médicaux aux arrières : une entrée au sud, intérieur praticable.
for (const x of [3, 37]) for (const [dy, row] of ['####', '#pp#', '#pp#', '#pp#', '#+##'].entries())
  for (let dx = 0; dx < row.length; dx++) paint(x + dx, 5 + dy, row[dx]!);
// Deux immeubles accessibles, avec une entrée côté nord.
for (const x of [14, 29]) for (const [dy, row] of ['#+##', '#rr#', '####'].entries())
  for (let dx = 0; dx < row.length; dx++) paint(x + dx, 26 + dy, row[dx]!);
// Épaves sur une seule des deux voies, conteneurs et barrages de part et d'autre.
for (const [x, y] of [[16, 18], [17, 18], [28, 18], [29, 18]]) paint(x, y, 'V');
for (const [x, y] of [[17, 24], [18, 24], [29, 24], [30, 24]]) paint(x, y, 'C');
for (const [x, y] of [[13, 19], [31, 19], [19, 27], [27, 27], [18, 13], [28, 13]]) paint(x, y, 'B');
// Caisses réelles et destructibles dans les cours, jamais dans les zones de spawn.
for (const [x, y] of [[12, 5], [12, 6], [31, 5], [32, 5], [12, 10], [30, 11], [12, 24], [32, 24]]) paint(x, y, 'K');
for (const [x, y] of [[13, 12], [32, 12], [14, 23], [31, 23]]) paint(x, y, '"');

/** Carte finie, bataille sans victoire automatique et remplacements illimités. */
export const ENDLESS_CARREFOUR: MapDefinition = {
  ...OPERATION_CARREFOUR,
  id: 'carrefour-infini',
  name: 'Carrefour — bataille sans fin',
  briefing: 'Les deux camps combattent sans fin. Une créature indépendante attaque les deux forces et réapparaît après sa mort.',
  rows: district.map(row => row.join('')),
  legend: { ...OPERATION_CARREFOUR.legend, '#': 'urbanWall', H: 'urbanWall', t: 'urbanWall',
    V: 'wreck', C: 'container', B: 'roadblock', K: 'supplyCrate', p: 'pavement' },
  objectives: [
    ...OPERATION_CARREFOUR.objectives,
    { id: 'north_street', label: 'Rue des ateliers', x: 24.5, y: 3.5, radius: 2.5, value: 1 },
    { id: 'south_street', label: 'Rue du dépôt', x: 23.5, y: 30.5, radius: 2.5, value: 1 },
  ],
  hospitals: { penitents: { x: 4.5, y: 8.5 }, marteau: { x: 38.5, y: 8.5 } },
  endlessBattle: true,
  ballisticWeapons: true,
  logistics: true,
  respawn: { reservesPerFaction: 0, delayTicks: 100, unlimited: true },
  rosters: { penitents: roster, marteau: roster.map(entry => ({ ...entry })) },
};
