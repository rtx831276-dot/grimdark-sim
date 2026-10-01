import { describe, expect, it } from 'vitest';
import { compileMap, isSolid } from '../src/sim/map';
import { coverAgainst, lineOfSight } from '../src/sim/los';
import { TEST_MAP } from './fixtures/test-map';

const map = compileMap(TEST_MAP);

describe('ligne de vue', () => {
  it('voit à travers un terrain dégagé', () => {
    const los = lineOfSight(map, 0.5, 0.5, 10.5, 0.5);
    expect(los.visible).toBe(true);
    expect(los.obstruction).toBe(0);
    expect(los.blocker).toBeNull();
  });

  it('est bloquée par un mur, et rapporte l obstacle', () => {
    const los = lineOfSight(map, 3.5, 1.5, 1.5, 1.5);
    expect(los.visible).toBe(false);
    expect(los.blocker).toEqual({ x: 2, y: 1 });
  });

  it('est bloquée en travers, pas seulement à l horizontale', () => {
    expect(lineOfSight(map, 2.5, 0.5, 2.5, 2.5).visible).toBe(false);
  });

  it('traverse une clôture et des gravats en gardant une obstruction', () => {
    const los = lineOfSight(map, 5.5, 0.5, 5.5, 6.5);
    expect(los.visible).toBe(true);
    expect(los.obstruction).toBeGreaterThan(0.3);
  });

  it('ne considère pas la tuile de départ comme un obstacle (un mur ne bloque pas à bout portant)', () => {
    // Tireur collé au mur (tuile 2,1) visant la tuile voisine : sa propre tuile est ignorée.
    expect(lineOfSight(map, 2.4, 1.5, 3.5, 1.5).visible).toBe(true);
    // Même configuration, mais le mur est cette fois SUR le trajet : bloqué.
    expect(lineOfSight(map, 3.5, 1.5, 1.5, 1.5).visible).toBe(false);
  });
});

describe('couverture', () => {
  it('une tranchée protège bien mieux que la boue', () => {
    const inTrench = coverAgainst(map, 4.5, 5.5, 9.5, 5.5);
    const inMud = coverAgainst(map, 4.5, 6.5, 9.5, 6.5);
    expect(inTrench).toBeGreaterThan(0.7);
    expect(inMud).toBeLessThan(0.2);
    expect(inTrench).toBeGreaterThan(inMud);
  });

  it('les gravats entre les deux donnent une protection intermédiaire', () => {
    const behindRubble = coverAgainst(map, 5.5, 5.5, 5.5, 0.5);
    expect(behindRubble).toBeGreaterThan(0.2);
    expect(behindRubble).toBeLessThan(0.75);
  });

  it('ne rend jamais une unité intouchable', () => {
    const cover = coverAgainst(map, 4.5, 5.5, 5.5, 5.5);
    expect(cover).toBeLessThanOrEqual(0.85);
  });
});

describe('grille', () => {
  it('bloque le déplacement dans un mur et laisse passer ailleurs', () => {
    expect(isSolid(map, 2, 1)).toBe(true);
    expect(isSolid(map, 3, 1)).toBe(false);
    expect(isSolid(map, -1, 0)).toBe(true);
    expect(isSolid(map, 0, 99)).toBe(true);
  });
});
