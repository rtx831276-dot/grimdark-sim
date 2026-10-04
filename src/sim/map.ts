import { Rng } from '../core/rng';
import { TERRAIN, type TerrainDef, type TerrainId } from '../data/terrain';
import type { MapDefinition, ObjectiveDef } from '../data/map-types';
import type { GameMap, TileState } from './types';

/* ------------------------------------------------------------------ *
 * Compilation d'une carte ASCII en grille jouable
 * ------------------------------------------------------------------ */

/**
 * Normalise les rangées : complète les lignes courtes avec de la boue, tronque les
 * lignes longues. Évite qu'une faute de frappe dans la carte casse l'alignement
 * de toute la grille.
 */
function normalizeRows(def: MapDefinition): string[] {
  const rows: string[] = [];
  for (let y = 0; y < def.height; y++) {
    const raw = def.rows[y] ?? '';
    rows.push(raw.length >= def.width ? raw.slice(0, def.width) : raw.padEnd(def.width, '.'));
  }
  return rows;
}

function makeTile(terrain: TerrainId): TileState {
  const hp = TERRAIN[terrain].hp;
  return { terrain, hp, maxHp: hp };
}

/**
 * « Dégâts de guerre » : quelques cratères, gravats et arbres morts ajoutés
 * procéduralement dans une région donnée. Ne touche QUE les tuiles de boue, donc
 * les structures écrites à la main restent intactes. Déterministe (graine fixe).
 */
function applyScatter(def: MapDefinition, tiles: TileState[]): void {
  const { scatter } = def;
  const rng = new Rng(scatter.seed);
  const place = (count: number, terrain: TerrainId): void => {
    for (let i = 0; i < count; i++) {
      const x = rng.int(scatter.region.w) + scatter.region.x;
      const y = rng.int(scatter.region.h) + scatter.region.y;
      if (x < 0 || y < 0 || x >= def.width || y >= def.height) continue;
      const index = y * def.width + x;
      if (tiles[index]!.terrain !== 'mud') continue;
      tiles[index] = makeTile(terrain);
    }
  };
  place(scatter.craters, 'crater');
  place(scatter.rubble, 'rubble');
  place(scatter.trees, 'tree');
  place(scatter.water, 'water');
}

export function compileMap(def: MapDefinition): GameMap {
  const rows = normalizeRows(def);
  const tiles: TileState[] = new Array(def.width * def.height);
  for (let y = 0; y < def.height; y++) {
    const row = rows[y]!;
    for (let x = 0; x < def.width; x++) {
      const glyph = row[x]!;
      const terrain = def.legend[glyph];
      if (!terrain) throw new Error(`Carte ${def.id}: glyphe inconnu "${glyph}" en (${x},${y})`);
      tiles[y * def.width + x] = makeTile(terrain);
    }
  }
  applyScatter(def, tiles);
  return { def, width: def.width, height: def.height, tiles, objectives: def.objectives };
}

/* ------------------------------------------------------------------ *
 * Accès à la grille
 * ------------------------------------------------------------------ */

export function inBounds(map: GameMap, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < map.width && y < map.height;
}

export function tileAt(map: GameMap, x: number, y: number): TileState | null {
  if (!inBounds(map, x, y)) return null;
  return map.tiles[y * map.width + x] ?? null;
}

export function tileAtFloor(map: GameMap, x: number, y: number): TileState | null {
  return tileAt(map, Math.floor(x), Math.floor(y));
}

export function terrainAt(map: GameMap, x: number, y: number): TerrainDef {
  const tile = tileAtFloor(map, x, y);
  if (!tile) return TERRAIN.mud;
  return TERRAIN[tile.terrain];
}

export function isSolid(map: GameMap, x: number, y: number): boolean {
  const tile = tileAtFloor(map, x, y);
  if (!tile) return true; // hors carte = infranchissable
  return TERRAIN[tile.terrain].solid;
}

export function moveCostAt(map: GameMap, x: number, y: number): number {
  return terrainAt(map, x, y).moveCost;
}

/** Couverture offerte par la tuile elle-même. */
export function tileCoverAt(map: GameMap, x: number, y: number): number {
  return terrainAt(map, x, y).tileCover;
}

/**
 * Inflige des dégâts à une structure. Retourne le terrain résultant si la tuile
 * a été détruite, sinon null. C'est le seul point d'entrée de la destruction de terrain.
 */
export function damageTile(map: GameMap, x: number, y: number, amount: number): { destroyed: boolean; terrain: TerrainId } | null {
  const tile = tileAtFloor(map, x, y);
  if (!tile) return null;
  const def = TERRAIN[tile.terrain];
  if (def.hp <= 0 || def.becomes === null) return null;
  tile.hp -= amount;
  if (tile.hp > 0) return { destroyed: false, terrain: tile.terrain };
  // La structure s'effondre : elle devient un tas de gravats praticable.
  const next = makeTile(def.becomes);
  tile.terrain = next.terrain;
  tile.hp = next.hp;
  tile.maxHp = next.maxHp;
  return { destroyed: true, terrain: next.terrain };
}

/** Parcourt les tuiles dans un rayon (pour les explosions, le contrôle d'objectifs...). */
export function forEachTileInRadius(
  map: GameMap,
  cx: number,
  cy: number,
  radius: number,
  visit: (x: number, y: number, distance: number) => void,
): void {
  const minX = Math.max(0, Math.floor(cx - radius));
  const maxX = Math.min(map.width - 1, Math.ceil(cx + radius));
  const minY = Math.max(0, Math.floor(cy - radius));
  const maxY = Math.min(map.height - 1, Math.ceil(cy + radius));
  const radiusSq = radius * radius;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const distSq = dx * dx + dy * dy;
      if (distSq > radiusSq) continue;
      visit(x, y, Math.sqrt(distSq));
    }
  }
}

/* ------------------------------------------------------------------ *
 * Objectifs
 * ------------------------------------------------------------------ */

export function objectiveAt(map: GameMap, x: number, y: number): ObjectiveDef | null {
  for (const objective of map.objectives) {
    if (Math.hypot(objective.x - x, objective.y - y) <= objective.radius) return objective;
  }
  return null;
}

/** Objectif le plus proche d'un point, en privilégiant les objectifs les plus valorisés. */
export function bestObjectiveFor(map: GameMap, x: number, y: number, avoid?: { x: number; y: number }): ObjectiveDef {
  let best = map.objectives[0]!;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const objective of map.objectives) {
    const own = Math.hypot(objective.x - x, objective.y - y);
    const contested = avoid ? Math.hypot(avoid.x - objective.x, avoid.y - objective.y) : 0;
    // On veut un objectif proche, mais on évite de s'entasser sur celui où se trouve l'ennemi
    // s'il en existe un autre à portée raisonnable.
    const score = objective.value * 6 - own - contested * 0.35;
    if (score > bestScore) {
      bestScore = score;
      best = objective;
    }
  }
  return best;
}

/** Position libre la plus proche d'un point (pour les déploiements et les replis). */
export function nearestWalkable(map: GameMap, x: number, y: number, maxRadius = 8): { x: number; y: number } | null {
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  if (!isSolid(map, cx, cy)) return { x: cx + 0.5, y: cy + 0.5 };
  for (let radius = 1; radius <= maxRadius; radius++) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const nx = cx + dx;
        const ny = cy + dy;
        if (!isSolid(map, nx, ny)) return { x: nx + 0.5, y: ny + 0.5 };
      }
    }
  }
  return null;
}
