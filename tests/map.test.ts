import { describe, expect, it } from 'vitest';
import { VILLAGE_CHURCH } from '../src/data/maps/village-church';
import { compileMap, damageTile, isSolid, moveCostAt, tileAtFloor } from '../src/sim/map';
import { createSimulation } from '../src/sim/simulation';

describe('compilation de la carte du hameau', () => {
  const map = compileMap(VILLAGE_CHURCH);

  it('respecte les dimensions déclarées et remplit toute la grille', () => {
    expect(map.width).toBe(44);
    expect(map.height).toBe(34);
    expect(map.tiles.length).toBe(44 * 34);
    expect(map.tiles.every((tile) => tile.terrain !== undefined)).toBe(true);
  });

  it('place l église, son beffroi et sa porte', () => {
    expect(tileAtFloor(map, 20, 5)?.terrain).toBe('tower');
    expect(tileAtFloor(map, 21, 6)?.terrain).toBe('tower');
    expect(tileAtFloor(map, 23, 8)?.terrain).toBe('churchFloor');
    expect(tileAtFloor(map, 23, 11)?.terrain).toBe('door');
    // Les murs de l'église sont bien pleins (on ne traverse pas une église).
    expect(isSolid(map, 26, 8)).toBe(true);
  });

  it('creuse deux lignes de tranchées protégées par des sacs de sable', () => {
    expect(tileAtFloor(map, 9, 12)?.terrain).toBe('trench');
    expect(tileAtFloor(map, 10, 25)?.terrain).toBe('trench');
    expect(tileAtFloor(map, 34, 12)?.terrain).toBe('trench');
    expect(tileAtFloor(map, 33, 12)?.terrain).toBe('sandbag');
    expect(tileAtFloor(map, 11, 12)?.terrain).toBe('sandbag');
  });

  it('trace une Grand-Rue praticable qui traverse le no man s land', () => {
    expect(tileAtFloor(map, 22, 17)?.terrain).toBe('road');
    expect(moveCostAt(map, 22.5, 17.5)).toBeLessThan(1);
  });

  it('est déterministe : deux compilations donnent la même grille', () => {
    const again = compileMap(VILLAGE_CHURCH);
    const fingerprint = (grid: typeof map): string => grid.tiles.map((tile) => `${tile.terrain}:${tile.hp}`).join('|');
    expect(fingerprint(again)).toBe(fingerprint(map));
  });

  it('détruit un mur et le remplace par des gravats praticables', () => {
    const grid = compileMap(VILLAGE_CHURCH);
    expect(isSolid(grid, 22, 5)).toBe(true);
    const result = damageTile(grid, 22, 5, 500);
    expect(result?.destroyed).toBe(true);
    expect(result?.terrain).toBe('rubble');
    expect(isSolid(grid, 22, 5)).toBe(false);
    expect(tileAtFloor(grid, 22, 5)?.terrain).toBe('rubble');
  });

  it('ne détruit pas les terrains sans structure (boue, route)', () => {
    const grid = compileMap(VILLAGE_CHURCH);
    expect(damageTile(grid, 22, 17, 9999)).toBeNull();
    expect(tileAtFloor(grid, 22, 17)?.terrain).toBe('road');
  });

  it('déploie 13 unités par camp sur des tuiles praticables', () => {
    const state = createSimulation({ seed: 1 });
    expect(state.units.length).toBe(26);
    for (const unit of state.units) {
      expect(isSolid(state.map, unit.x, unit.y)).toBe(false);
    }
  });
});
