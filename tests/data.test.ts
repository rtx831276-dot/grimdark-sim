import { describe, expect, it } from 'vitest';
import { FACTIONS, FACTION_IDS, rosterSize } from '../src/data/factions';
import { VILLAGE_CHURCH } from '../src/data/maps/village-church';
import { TERRAIN, terrain } from '../src/data/terrain';
import { UNITS, unitDef } from '../src/data/units';
import { WEAPONS, weapon } from '../src/data/weapons';
import { compileMap, isSolid } from '../src/sim/map';

describe('cohérence des données', () => {
  it('chaque unité des rosters existe et chaque arme référencée est définie', () => {
    for (const factionId of FACTION_IDS) {
      for (const entry of FACTIONS[factionId]!.roster) {
        const def = unitDef(entry.unit);
        expect(def).toBeDefined();
        expect(WEAPONS[def.weapon]).toBeDefined();
        expect(entry.count).toBeGreaterThan(0);
      }
    }
  });

  it('les deux camps alignent entre 10 et 15 unités (objectif de la V1)', () => {
    for (const factionId of FACTION_IDS) {
      const size = rosterSize(factionId);
      expect(size).toBeGreaterThanOrEqual(10);
      expect(size).toBeLessThanOrEqual(15);
    }
  });

  it('aucune unité commune n est rattachée à une faction inexistante', () => {
    for (const [id, def] of Object.entries(UNITS)) {
      if (!def.faction) continue;
      expect(FACTION_IDS, `unité ${id}`).toContain(def.faction);
    }
  });

  it('chaque arme a des valeurs de tir exploitables', () => {
    for (const [id, def] of Object.entries(WEAPONS)) {
      expect(def.range, id).toBeGreaterThan(0);
      expect(def.cooldown, id).toBeGreaterThan(0);
      expect(def.accuracy, id).toBeGreaterThan(0);
      expect(def.burst, id).toBeGreaterThanOrEqual(1);
      if (def.kind === 'grenade' || def.kind === 'artillery') {
        expect(def.splashRadius, id).toBeGreaterThan(0);
        expect(def.tileDamage, id).toBeGreaterThan(0);
      }
    }
  });

  it('chaque terrain destructible sait en quoi il se transforme', () => {
    for (const def of Object.values(TERRAIN)) {
      if (def.hp <= 0) {
        expect(def.becomes, def.id).toBeNull();
      } else {
        expect(def.becomes, def.id).not.toBeNull();
        expect(TERRAIN[def.becomes!], def.id).toBeDefined();
      }
      expect(def.tileCover).toBeGreaterThanOrEqual(0);
      expect(def.tileCover).toBeLessThanOrEqual(1);
    }
  });

  it('la table des terrains est cohérente avec ses clés', () => {
    for (const [key, def] of Object.entries(TERRAIN)) expect(def.id).toBe(key);
    expect(terrain('trench').tileCover).toBeGreaterThan(terrain('mud').tileCover);
  });
});

describe('cohérence de la carte', () => {
  it('compile sans glyphe inconnu et place les objectifs sur du terrain existant', () => {
    const map = compileMap(VILLAGE_CHURCH);
    for (const objective of map.objectives) {
      const x = Math.floor(objective.x);
      const y = Math.floor(objective.y);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(map.width);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThan(map.height);
    }
  });

  it('les zones de déploiement des deux camps contiennent du terrain praticable', () => {
    const map = compileMap(VILLAGE_CHURCH);
    for (const factionId of FACTION_IDS) {
      const zone = VILLAGE_CHURCH.deployment[factionId];
      expect(zone, factionId).toBeDefined();
      let walkable = 0;
      for (let y = zone!.y; y < zone!.y + zone!.h; y++) {
        for (let x = zone!.x; x < zone!.x + zone!.w; x++) {
          if (!isSolid(map, x, y)) walkable++;
        }
      }
      expect(walkable, factionId).toBeGreaterThan(20);
    }
  });

  it('les lignes de repli sont à l intérieur de la carte', () => {
    for (const factionId of FACTION_IDS) {
      const line = VILLAGE_CHURCH.fallbackLine[factionId];
      expect(line, factionId).toBeDefined();
      expect(line!.x).toBeGreaterThanOrEqual(0);
      expect(line!.x).toBeLessThan(VILLAGE_CHURCH.width);
      expect(line!.y).toBeGreaterThanOrEqual(0);
      expect(line!.y).toBeLessThan(VILLAGE_CHURCH.height);
    }
  });

  it('la légende couvre tous les glyphes utilisés dans les rangées', () => {
    for (const row of VILLAGE_CHURCH.rows) {
      for (const glyph of row) {
        expect(VILLAGE_CHURCH.legend[glyph], `glyphe "${glyph}"`).toBeDefined();
      }
    }
  });

  it('la carte contient bien un village, une église et des tranchées', () => {
    const map = compileMap(VILLAGE_CHURCH);
    const counts = new Map<string, number>();
    for (const tile of map.tiles) counts.set(tile.terrain, (counts.get(tile.terrain) ?? 0) + 1);
    expect(counts.get('churchWall') ?? 0).toBeGreaterThan(10);
    expect(counts.get('churchFloor') ?? 0).toBeGreaterThan(5);
    expect(counts.get('tower') ?? 0).toBeGreaterThan(0);
    expect(counts.get('trench') ?? 0).toBeGreaterThan(30);
    expect(counts.get('wall') ?? 0).toBeGreaterThan(10);
    expect(counts.get('rubble') ?? 0).toBeGreaterThan(5);
    expect(counts.get('grave') ?? 0).toBeGreaterThan(5);
    // Tout identifiant de terrain présent sur la carte doit exister dans la table.
    for (const terrainId of counts.keys()) expect(TERRAIN[terrainId as keyof typeof TERRAIN], terrainId).toBeDefined();
    expect(counts.get('road') ?? 0).toBeGreaterThan(30);
    expect(weapon('artillery_barrage').splashRadius).toBeGreaterThanOrEqual(3);
  });
});
