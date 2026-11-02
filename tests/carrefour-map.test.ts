import { describe, expect, it } from 'vitest';
import { ENDLESS_CARREFOUR } from '../src/data/maps/endless-carrefour';
import { OPERATION_CARREFOUR } from '../src/data/maps/operation-carrefour';
import { TERRAIN, type TerrainId } from '../src/data/terrain';
import { weapon } from '../src/data/weapons';
import { modernDecorParts } from '../src/render/modern-decor';
import { advanceBullet, createSimulation, detonate, isSolid, lineOfSight, moveWithTerrain, spawnBullet } from '../src/sim';
import { compileMap, nearestWalkable, tileAt } from '../src/sim/map';
import { findPath } from '../src/sim/pathfinding';

describe('quartier Carrefour sans fin', () => {
  it('garde le scénario original intact et crée des rues, bâtiments et obstacles déterministes', () => {
    const map = compileMap(ENDLESS_CARREFOUR);
    expect(compileMap(ENDLESS_CARREFOUR).tiles).toEqual(map.tiles);
    expect(OPERATION_CARREFOUR.legend.V).toBeUndefined();
    expect(TERRAIN.urbanWall.height).toBeGreaterThan(TERRAIN.wall.height);
    expect(ENDLESS_CARREFOUR.rows.every(row => row.length === 44)).toBe(true);
    for (let x = 0; x < 44; x++) expect(tileAt(map, x, 17)?.terrain).toBe('road');
    for (const [x, y, terrain] of [[16, 18, 'wreck'], [17, 24, 'container'], [19, 27, 'roadblock'],
      [15, 26, 'door'], [30, 26, 'door'], [14, 26, 'urbanWall'],
      [12, 10, 'supplyCrate'], [14, 10, 'pavement'], [13, 2, 'door'], [30, 2, 'door']] as const) expect(tileAt(map, x, y)?.terrain).toBe(terrain);
  });

  it('relie toutes les cases de déploiement praticables aux deux camps et aux objectifs', () => {
    const map = compileMap(ENDLESS_CARREFOUR);
    // Une composante à 4 directions garantit aussi l'absence de coupe de coin.
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
      for (const objective of map.objectives) {
        const target = nearestWalkable(map, objective.x, objective.y, 6)!;
        expect(target, objective.id).toBeDefined();
        expect(reached.has(Math.floor(target.y) * map.width + Math.floor(target.x)), objective.id).toBe(true);
        expect(findPath(map, zone.x + 2.5, 17.5, objective.x, objective.y), objective.id).not.toBeNull();
      }
    }
    for (const [x, y] of [[15, 26], [30, 26], [13, 2], [30, 2], [13, 1], [30, 1]])
      expect(reached.has(y * map.width + x), `${x},${y}`).toBe(true);
    for (const objective of ['north_street', 'south_street']) expect(map.objectives.some(o => o.id === objective)).toBe(true);
    for (const x of [9, 10, 34, 35]) for (let y = 3; y <= 31; y++)
      expect(tileAt(map, x, y)?.terrain, `contournement ${x},${y}`).toBe('road');
    for (let x = 9; x <= 35; x++) expect(tileAt(map, x, 3)?.terrain).toBe('road');
  });

  it('les marquages de cour restent plats et disparaissent quand le sol est détruit', () => {
    const map = compileMap(ENDLESS_CARREFOUR), x = 14, y = 10;
    expect(tileAt(map, x, y)?.terrain).toBe('pavement');
    const withinTile = () => modernDecorParts(map).filter(p => p.x >= x && p.x < x + 1 && p.z >= y && p.z < y + 1);
    const before = withinTile();
    expect(before.length).toBeGreaterThanOrEqual(2);
    expect(before.every(p => p.y + p.sy / 2 <= 0.025)).toBe(true);
    tileAt(map, x, y)!.terrain = 'crater';
    expect(withinTile()).toHaveLength(0);
  });

  it.each([
    ['wreck', 16, 18], ['container', 17, 24], ['roadblock', 19, 27], ['supplyCrate', 12, 10],
  ] as [TerrainId, number, number][])('%s bloque, arrête une balle et disparaît après destruction', (kind, x, y) => {
    const state = createSimulation({ map: ENDLESS_CARREFOUR, seed: 4 });
    for (const u of state.units) u.alive = false;
    const shooter = state.units[0]!;
    Object.assign(shooter, { alive: true, x: x - 0.5, y: y + 0.5 });
    // Nettoyer la seule case de départ pour isoler le test de la configuration voisine.
    const start = tileAt(state.map, x - 1, y)!;
    Object.assign(start, { terrain: 'road', hp: 0, maxHp: 0 });
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
