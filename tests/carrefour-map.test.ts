import { describe, expect, it } from 'vitest';
import { ENDLESS_CARREFOUR } from '../src/data/maps/endless-carrefour';
import { OPERATION_CARREFOUR } from '../src/data/maps/operation-carrefour';
import { TERRAIN, type TerrainId } from '../src/data/terrain';
import { weapon } from '../src/data/weapons';
import { modernDecorParts } from '../src/render/modern-decor';
import { advanceBullet, createSimulation, detonate, isSolid, lineOfSight, moveWithTerrain, spawnBullet } from '../src/sim';
import { compileMap, nearestWalkable, tileAt } from '../src/sim/map';
import { findPath } from '../src/sim/pathfinding';

describe('champ de bataille à tranchées', () => {
  it('conserve le scénario original et crée une carte ouverte déterministe sans bâtiment', () => {
    const map = compileMap(ENDLESS_CARREFOUR);
    expect(compileMap(ENDLESS_CARREFOUR).tiles).toEqual(map.tiles);
    expect(OPERATION_CARREFOUR.legend.V).toBeUndefined();
    expect(TERRAIN.urbanWall.height).toBeGreaterThan(TERRAIN.wall.height);
    expect(ENDLESS_CARREFOUR.rows.every(row => row.length === 44)).toBe(true);
    expect(new Set(map.tiles.map(tile => tile.terrain))).toEqual(new Set(['mud', 'trench', 'sandbag', 'supplyCrate']));
    expect(map.tiles.filter(tile => tile.terrain === 'trench').length).toBeGreaterThan(100);
    expect(map.tiles.filter(tile => tile.terrain === 'supplyCrate')).toHaveLength(8);
    expect(TERRAIN.trench.solid).toBe(false);
    expect(TERRAIN.trench.tileCover).toBeGreaterThan(TERRAIN.mud.tileCover);
    expect(tileAt(map, 12, 10)?.terrain).toBe('supplyCrate');
  });

  it('relie les déploiements, les tranchées, les postes de secours, les caisses et les objectifs', () => {
    const map = compileMap(ENDLESS_CARREFOUR);
    const reached = new Set<number>();
    const queue: [number, number][] = [[23, 17]];
    for (let i = 0; i < queue.length; i++) {
      const [x, y] = queue[i]!, key = y * map.width + x;
      if (reached.has(key) || isSolid(map, x, y)) continue;
      reached.add(key);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < map.width && ny < map.height && !reached.has(ny * map.width + nx)) queue.push([nx, ny]);
      }
    }
    for (const faction of ['penitents', 'marteau'] as const) {
      const zone = ENDLESS_CARREFOUR.deployment[faction]!;
      let walkable = 0;
      for (let y = zone.y; y < zone.y + zone.h; y++) for (let x = zone.x; x < zone.x + zone.w; x++) {
        if (!isSolid(map, x, y)) { walkable++; expect(reached.has(y * map.width + x)).toBe(true); }
      }
      expect(walkable).toBeGreaterThan(100);
      const hospital = ENDLESS_CARREFOUR.hospitals![faction]!;
      expect(reached.has(Math.floor(hospital.y) * map.width + Math.floor(hospital.x))).toBe(true);
      expect(findPath(map, zone.x + 2.5, 17.5, hospital.x, hospital.y)).not.toBeNull();
      for (const objective of map.objectives) {
        const target = nearestWalkable(map, objective.x, objective.y, 6)!;
        expect(reached.has(Math.floor(target.y) * map.width + Math.floor(target.x)), objective.id).toBe(true);
        expect(findPath(map, zone.x + 2.5, 17.5, objective.x, objective.y), objective.id).not.toBeNull();
      }
    }
    for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) {
      if (tileAt(map, x, y)?.terrain !== 'supplyCrate') continue;
      expect([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => reached.has((y + dy!) * map.width + x + dx!))).toBe(true);
    }
  });

  it('représente les bords des tranchées sans bloquer leur accès et enlève le décor si le terrain change', () => {
    const map = compileMap(ENDLESS_CARREFOUR), x = 11, y = 10;
    expect(tileAt(map, x, y)?.terrain).toBe('trench');
    expect(isSolid(map, x, y)).toBe(false);
    const withinTile = () => modernDecorParts(map).filter(p => p.x >= x && p.x < x + 1 && p.z >= y && p.z < y + 1);
    expect(withinTile().some(p => p.color === 0x776b50)).toBe(true);
    tileAt(map, x, y)!.terrain = 'mud';
    expect(withinTile().some(p => p.color === 0x776b50 || p.color === 0x8a7657)).toBe(false);
  });

  it.each([
    ['wreck', 20, 10], ['container', 20, 10], ['roadblock', 20, 10], ['supplyCrate', 20, 10],
  ] as [TerrainId, number, number][])('%s bloque, arrête une balle et disparaît après destruction', (kind, x, y) => {
    const state = createSimulation({ map: ENDLESS_CARREFOUR, seed: 4 });
    for (const u of state.units) u.alive = false;
    const shooter = state.units[0]!;
    Object.assign(shooter, { alive: true, x: x - 0.5, y: y + 0.5 });
    // Nettoyer la seule case de départ pour isoler le test de la configuration voisine.
    const start = tileAt(state.map, x - 1, y)!;
    Object.assign(start, { terrain: 'road', hp: 0, maxHp: 0 });
    Object.assign(tileAt(state.map, x, y)!, { terrain: kind, hp: TERRAIN[kind].hp, maxHp: TERRAIN[kind].hp });
    expect(tileAt(state.map, x, y)?.terrain).toBe(kind);
    expect(TERRAIN[kind].solid).toBe(true);
    expect(isSolid(state.map, x, y)).toBe(true);
    expect(moveWithTerrain(state.map, x - 0.5, y + 0.5, 1.2, 0).x).toBeLessThan(x);
    expect(lineOfSight(state.map, x - 0.5, y + 0.5, x + 1.5, y + 0.5).visible).toBe(false);
    const bullet = spawnBullet(state, shooter, weapon('modern_rifle'), 0, 0, 0.5);
    expect(advanceBullet(state, bullet, 0.1)).toBe(false);
    expect(bullet.x).toBeLessThan(x + 0.1);
    const before = modernDecorParts(state.map).filter(p => p.x >= x && p.x < x + 1 && p.z >= y && p.z < y + 1);
    expect(before.length).toBeGreaterThan(2);
    // Deux explosions suffisent même pour le conteneur le plus résistant.
    for (let n = 0; n < 3 && tileAt(state.map, x, y)?.terrain === kind; n++)
      detonate(state, x + 0.5, y + 0.5, weapon('grenade_frag'), shooter.faction, shooter.id);
    expect(tileAt(state.map, x, y)?.terrain).toBe('rubble');
    expect(isSolid(state.map, x, y)).toBe(false);
    const after = modernDecorParts(state.map).filter(p => p.x >= x && p.x < x + 1 && p.z >= y && p.z < y + 1);
    expect(after.some(p => p.color === 0x5d776e || p.color === 0x657164 || p.color === 0x969b90 || p.color === 0x867b60)).toBe(false);
  });
});
