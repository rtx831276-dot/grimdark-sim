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

// Champ de bataille ouvert et délimité : aucune façade ni bâtiment.
// Les tranchées sont des tuiles franchissables et protectrices, pas des murs.
const width = OPERATION_CARREFOUR.width, height = OPERATION_CARREFOUR.height;
const field = Array.from({length: height}, () => Array<string>(width).fill('.'));
const paint = (x: number, y: number, glyph: string): void => { field[y]![x] = glyph; };
for (let y = 4; y <= 29; y++) {
  // Légers décrochements pour éviter deux couloirs parfaitement rectilignes.
  const offset = Math.floor((y - 4) / 5) % 2;
  for (const x of [10 + offset, 11 + offset, 32 - offset, 33 - offset]) paint(x, y, 'T');
  // Parapets franchissables, espacés pour conserver des entrées faciles.
  if (y % 4 === 0 || y % 4 === 1) {
    paint(12 + offset, y, '"'); paint(31 - offset, y, '"');
  }
}
// Boyaux courts vers l'arrière de chaque camp.
for (const y of [12, 23]) for (let x = 6; x <= 10; x++) paint(x, y, 'T');
for (const y of [12, 23]) for (let x = 33; x <= 38; x++) paint(x, y, 'T');
// Caisses préservées pour les soins et les munitions ; elles restent destructibles.
for (const [x, y] of [[12, 5], [12, 6], [31, 5], [32, 5], [12, 10], [30, 11], [12, 24], [32, 24]]) paint(x!, y!, 'K');

/** Carte finie, bataille sans victoire automatique et remplacements illimités. */
export const ENDLESS_CARREFOUR: MapDefinition = {
  ...OPERATION_CARREFOUR,
  id: 'carrefour-infini',
  name: 'Champ de bataille — tranchées',
  briefing: 'Deux camps s’affrontent entre leurs lignes de tranchées. La bataille ne s’arrête pas et la créature attaque les deux forces.',
  rows: field.map(row => row.join('')),
  legend: { '.': 'mud', T: 'trench', '"': 'sandbag', K: 'supplyCrate' },
  scatter: { ...OPERATION_CARREFOUR.scatter, craters: 0, rubble: 0, trees: 0, water: 0 },
  objectives: [
    { id: 'trench_west', label: 'Tranchée ouest', x: 10.5, y: 17.5, radius: 2, value: 1 },
    { id: 'no_mans_land', label: 'Terrain central', x: 22, y: 17.5, radius: 3, value: 3 },
    { id: 'trench_east', label: 'Tranchée est', x: 33.5, y: 17.5, radius: 2, value: 1 },
  ],
  // Postes de secours à ciel ouvert, marqués par une croix au sol.
  hospitals: { penitents: { x: 4.5, y: 8.5 }, marteau: { x: 38.5, y: 8.5 } },
  endlessBattle: true,
  ballisticWeapons: true,
  logistics: true,
  respawn: { reservesPerFaction: 0, delayTicks: 100, unlimited: true },
  rosters: { penitents: roster, marteau: roster.map(entry => ({ ...entry })) },
};
