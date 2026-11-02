/** Vérification reproductible d'une longue bataille sans fin : npx tsx scripts/stress-endless.ts [ticks]. */
import assert from 'node:assert/strict';
import { ENDLESS_CARREFOUR } from '../src/data/maps/endless-carrefour';
import { createSimulation, hashState, stepSimulation } from '../src/sim';

const ticks = Number(process.argv[2] ?? 10000);
assert(Number.isSafeInteger(ticks) && ticks > 0, 'nombre de ticks invalide');
const seeds = process.argv[3] === undefined ? [1, 42, 2026] : [Number(process.argv[3])];
assert(seeds.every(Number.isSafeInteger), 'graine invalide');
for (const seed of seeds) {
  const a = createSimulation({seed, map: ENDLESS_CARREFOUR});
  const b = createSimulation({seed, map: ENDLESS_CARREFOUR});
  let maxUnits = 0, maxProjectiles = 0, deaths = 0, spawns = 0;
  const start = performance.now();
  for (let i = 0; i < ticks; i++) {
    const events = stepSimulation(a);
    stepSimulation(b);
    for (const e of events) { if (e.type === 'kill') deaths++; if (e.type === 'respawn') spawns++; }
    maxUnits = Math.max(maxUnits, a.units.length);
    maxProjectiles = Math.max(maxProjectiles, a.projectiles.length);
    assert(!a.over && a.tick === i + 1, 'la bataille sans fin s’est arrêtée');
    if (i % 1000 === 0 || i === ticks - 1) {
      assert.equal(hashState(a), hashState(b), `divergence déterministe tick ${i + 1}`);
      assert(a.units.length < 100 && a.projectiles.length < 250, 'ressources de simulation non bornées');
      assert(a.units.every(u => Number.isFinite(u.x) && Number.isFinite(u.y) && Number.isFinite(u.hp)), 'état de soldat invalide');
      assert(a.projectiles.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)), 'état de projectile invalide');
    }
  }
  console.log(JSON.stringify({ seed, ticks, simulatedMinutes: ticks / 600, deaths, spawns, maxUnits, maxProjectiles,
    hash: hashState(a), seconds: +((performance.now() - start) / 1000).toFixed(2) }));
}
