import type { GameMap } from '../sim';
import type { TerrainId } from '../data/terrain';

/** Suivi purement visuel : les PV ne changent pas les formes tant que la tuile reste identique. */
export class TerrainChangeTracker {
  private types: TerrainId[] = [];
  private map: GameMap | null = null;

  changed(map: GameMap): boolean {
    if (this.map !== map || this.types.length !== map.tiles.length) {
      this.map = map;
      this.types = map.tiles.map(tile => tile.terrain);
      return true;
    }
    let changed = false;
    for (let i = 0; i < map.tiles.length; i++) {
      const type = map.tiles[i]!.terrain;
      if (this.types[i] !== type) { this.types[i] = type; changed = true; }
    }
    return changed;
  }
}
