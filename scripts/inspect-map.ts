/**
 * Outil d'édition de carte : imprime la carte compilée avec une règle de colonnes,
 * puis la liste des glyphes utilisés et des colonnes de tranchées détectées.
 *
 *   npm run map:inspect
 *
 * C'est l'outil à lancer après avoir retouché une carte en ASCII : il montre
 * immédiatement si une ligne est décalée d'une colonne.
 */
import { VILLAGE_CHURCH } from '../src/data/maps/village-church';
import { compileMap } from '../src/sim/map';
import { TERRAIN, type TerrainId } from '../src/data/terrain';

const def = VILLAGE_CHURCH;
const map = compileMap(def);

/** Glyphe représentatif d'un terrain, déduit de la légende de la carte. */
const inverse = new Map<TerrainId, string>();
for (const [glyph, terrainId] of Object.entries(def.legend)) {
  if (!inverse.has(terrainId)) inverse.set(terrainId, glyph);
}
inverse.set('mud', '.');

const ruler = (width: number): string => {
  let units = '';
  let tens = '';
  for (let x = 0; x < width; x++) {
    tens += x % 10 === 0 ? String(Math.floor(x / 10) % 10) : ' ';
    units += String(x % 10);
  }
  return `     ${tens}\n     ${units}`;
};

console.log(`${def.name} — ${map.width} x ${map.height}\n`);
console.log(ruler(map.width));
for (let y = 0; y < map.height; y++) {
  let line = '';
  for (let x = 0; x < map.width; x++) {
    const tile = map.tiles[y * map.width + x]!;
    line += inverse.get(tile.terrain) ?? '?';
  }
  const raw = def.rows[y] ?? '';
  const drift = raw.length === map.width ? '   ' : `  <-- ${raw.length} col. (attendu ${map.width})`;
  console.log(`${String(y).padStart(3)}  ${line}${drift}`);
}

console.log('\nGlyphes :');
for (const [glyph, terrainId] of Object.entries(def.legend)) {
  const count = map.tiles.filter((tile) => tile.terrain === terrainId).length;
  console.log(`  ${glyph}  ${TERRAIN[terrainId].label.padEnd(18)} x${count}`);
}

const columnsOf = (terrainId: TerrainId): number[] => {
  const columns = new Set<number>();
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (map.tiles[y * map.width + x]!.terrain === terrainId) columns.add(x);
    }
  }
  return [...columns].sort((a, b) => a - b);
};

console.log('\nVérification des lignes de tranchées :');
console.log(`  tranchées  : colonnes ${columnsOf('trench').join(', ')}`);
console.log(`  parapets   : colonnes ${columnsOf('sandbag').join(', ')}`);
console.log('\nObjectifs :');
for (const objective of map.objectives) {
  console.log(`  ${objective.label.padEnd(30)} (${objective.x}, ${objective.y}) r=${objective.radius} valeur=${objective.value}`);
}
