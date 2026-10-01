import type { MapDefinition } from '../../src/data/map-types';

/**
 * Carte de test minuscule : un mur, une clôture, des gravats et une tranchée.
 * Elle sert à vérifier la ligne de vue, la couverture et le pathfinding sur des cas
 * connus, sans dépendre du grand niveau de village.
 */
export const TEST_MAP: MapDefinition = {
  id: 'test-proving-ground',
  name: 'Champ de tir',
  briefing: 'Terrain d essai.',
  width: 11,
  height: 7,
  legend: {
    '.': 'mud',
    '#': 'wall',
    r: 'rubble',
    f: 'fence',
    T: 'trench',
    o: 'crater',
  },
  rows: [
    '...........',
    '..#........',
    '...........',
    '.....f.....',
    '.....r.....',
    '....T......',
    '...........',
  ],
  scatter: {
    seed: 1,
    region: { x: 0, y: 0, w: 0, h: 0 },
    craters: 0,
    rubble: 0,
    trees: 0,
    water: 0,
  },
  objectives: [{ id: 'center', label: 'Centre', x: 5, y: 3, radius: 1.5, value: 1 }],
  deployment: {
    penitents: { x: 0, y: 0, w: 2, h: 7 },
    marteau: { x: 9, y: 0, w: 2, h: 7 },
  },
  fallbackLine: {
    penitents: { x: 0.5, y: 3 },
    marteau: { x: 10.5, y: 3 },
  },
};
