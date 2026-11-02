import type { MapDefinition } from '../map-types';
import { VILLAGE_CHURCH } from './village-church';

// Nouvelle mission sur une grille dérivée du village d'origine. Les grandes lignes de
// tranchées disparaissent : de petits barrages remplacent le front continu.
const rows = VILLAGE_CHURCH.rows.map((row, y) => [...row].map((glyph, x) => {
  if (glyph === 'T') return '.';
  if (glyph === '"') return y % 7 < 3 ? '"' : '.';
  if (glyph === 'c') return y % 2 === 0 && x % 2 === 0 ? 'r' : '.';
  return glyph;
}).join(''));

export const OPERATION_CARREFOUR: MapDefinition = {
  ...VILLAGE_CHURCH,
  id: 'operation-carrefour',
  name: 'Opération Carrefour',
  tacticalCommunications: true,
  respawn: { reservesPerFaction: 13, delayTicks: 100 },
  briefing: 'Deux forces fictives se disputent le quartier. Rapprochez-vous de l’adversaire et combattez à mains nues pour prendre le carrefour. Chaque camp dispose de 13 renforts, après 10 secondes.',
  rows,
  // Les anciennes structures d'église deviennent un poste en béton et une tour de communications.
  legend: { ...VILLAGE_CHURCH.legend, H: 'wall', t: 'wall', _: 'road' },
  scatter: { ...VILLAGE_CHURCH.scatter, seed: 30421, craters: 8, rubble: 17, water: 2 },
  objectives: [
    { id: 'hq', label: 'Poste de commandement', x: 23, y: 8, radius: 4, value: 4 },
    { id: 'comms', label: 'Relais radio', x: 20.5, y: 5.5, radius: 2, value: 2 },
    { id: 'crossroads', label: 'Carrefour', x: 23, y: 17.5, radius: 3, value: 3 },
    { id: 'yard', label: 'Dépôt ouest', x: 15.5, y: 5.5, radius: 2.5, value: 1 },
    { id: 'house_west', label: 'Bâtiment ouest', x: 15.5, y: 21, radius: 2, value: 1 },
    { id: 'house_east', label: 'Bâtiment est', x: 30.5, y: 21, radius: 2, value: 1 },
    { id: 'depot', label: 'Dépôt nord', x: 29.5, y: 8, radius: 2, value: 1 },
  ],
  rosters: {
    penitents: [
      { unit: 'modern_melee_leader', count: 1 }, { unit: 'modern_fighter', count: 4 },
      { unit: 'modern_assault_melee', count: 3 }, { unit: 'modern_defender', count: 2 },
      { unit: 'modern_recon_melee', count: 2 }, { unit: 'modern_medic', count: 1 },
    ],
    marteau: [
      { unit: 'modern_melee_leader', count: 1 }, { unit: 'modern_fighter', count: 4 },
      { unit: 'modern_assault_melee', count: 3 }, { unit: 'modern_defender', count: 2 },
      { unit: 'modern_recon_melee', count: 2 }, { unit: 'modern_medic', count: 1 },
    ],
  },
};
