import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ENDLESS_CARREFOUR } from '../src/data/maps/endless-carrefour';
import { ModernDecor, modernDecorParts } from '../src/render/modern-decor';
import { compileMap } from '../src/sim/map';
import type { GameMap } from '../src/sim';

function smallMap(): GameMap {
  const map = compileMap(ENDLESS_CARREFOUR);
  return { ...map, width: 3, height: 2, tiles: [
    { terrain: 'road', hp: 0, maxHp: 0 }, { terrain: 'road', hp: 0, maxHp: 0 }, { terrain: 'mud', hp: 0, maxHp: 0 },
    { terrain: 'road', hp: 0, maxHp: 0 }, { terrain: 'road', hp: 0, maxHp: 0 }, { terrain: 'sandbag', hp: 90, maxHp: 90 },
  ] };
}

describe('décors modernes', () => {
  it('ajoute des marquages sur les routes et six sacs, sans changer la carte', () => {
    const map = smallMap();
    const original = structuredClone(map.tiles);
    const parts = modernDecorParts(map);
    expect(parts.filter(p => p.color === 0xd2cfb6).length).toBeGreaterThan(0);
    expect(parts.filter(p => p.color === 0xada27d || p.color === 0x968a69)).toHaveLength(6);
    expect(map.tiles).toEqual(original);
  });
  it('retire les sacs visuels lorsque le terrain est détruit et réutilise le maillage tant que rien ne change', () => {
    const map = smallMap();
    const scene = new THREE.Scene();
    const decor = new ModernDecor(scene);
    decor.update(map);
    const initial = scene.children[0] as THREE.InstancedMesh;
    const count = initial.count;
    decor.update(map);
    expect(scene.children[0]).toBe(initial);
    map.tiles[5]!.terrain = 'mud';
    decor.update(map);
    expect(scene.children).toHaveLength(1);
    expect((scene.children[0] as THREE.InstancedMesh).count).toBe(count - 6);
    decor.dispose();
    expect(scene.children).toHaveLength(0);
  });
  it('ajoute des fenêtres uniquement sur les côtés exposés des murs', () => {
    const map = smallMap();
    map.tiles.forEach(tile => { tile.terrain = 'mud'; });
    map.tiles[0]!.terrain = 'wall';
    map.tiles[1]!.terrain = 'wall';
    expect(modernDecorParts(map).filter(p => p.color === 0x344a4d)).toHaveLength(6);
  });
});
