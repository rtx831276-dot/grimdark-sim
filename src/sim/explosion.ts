import { distance } from '../core/math';
import type { FactionId } from '../core/ids';
import { TERRAIN } from '../data/terrain';
import type { WeaponDef } from '../data/weapons';
import { applyDamage } from './combat';
import { addSuppression, applyMoraleShock } from './morale';
import { damageTile, forEachTileInRadius, tileAtFloor } from './map';
import type { SimState } from './types';

/**
 * Point unique de résolution des explosions (grenade, obus d'artillerie, et demain :
 * charges de démolition, barrages de mortier...).
 *
 * Trois effets simultanés, dans cet ordre :
 *   1. le terrain encaisse et peut s'effondrer (murs -> gravats),
 *   2. le sol nu est retourné (boue -> cratère) : le champ de bataille se dégrade,
 *   3. les unités subissent dégâts, suppression et effondrement du moral.
 */
export function detonate(
  state: SimState,
  x: number,
  y: number,
  gun: WeaponDef,
  faction: FactionId,
  ownerId: number,
): void {
  const radius = Math.max(0.5, gun.splashRadius);

  state.events.push({
    tick: state.tick,
    type: 'explosion',
    x,
    y,
    faction,
    unitId: ownerId,
    weaponId: gun.id,
    radius,
    amount: Math.round(gun.splashDamage),
  });

  forEachTileInRadius(state.map, x, y, radius, (tx, ty, dist) => {
    const falloff = 1 - dist / radius;
    const result = damageTile(state.map, tx, ty, gun.tileDamage * falloff);
    if (result) {
      if (result.destroyed) {
        state.stats.tilesDestroyed++;
        state.events.push({
          tick: state.tick,
          type: 'terrainDestroyed',
          x: tx + 0.5,
          y: ty + 0.5,
          amount: Math.round(gun.tileDamage * falloff),
          label: result.terrain,
        });
      }
      return;
    }

    // Terrain indestructible (boue, route, dalles) : sous le choc, il est retourné.
    const tile = tileAtFloor(state.map, tx, ty);
    if (!tile) return;
    const def = TERRAIN[tile.terrain];
    if (def.solid || def.hp > 0) return;
    if (falloff > 0.45 && tile.terrain !== 'crater') {
      tile.terrain = 'crater';
      tile.hp = 0;
      tile.maxHp = 0;
    }
  });

  for (const unit of state.units) {
    if (!unit.alive) continue;
    const dist = distance(unit.x, unit.y, x, y);
    if (dist > radius) continue;
    const falloff = Math.pow(1 - dist / radius, 1.25);
    addSuppression(state, unit, gun.suppression * falloff);
    applyMoraleShock(state, unit, gun.splashDamage * 0.3 * falloff, 'explosion');
    applyDamage(state, unit, gun.splashDamage * falloff, {
      sourceId: ownerId,
      faction,
      kind: 'explosive',
      label: 'explosion',
    });
    if (unit.alive && gun.kind === 'grenade') {
      // Une grenade qui n'a pas tué laisse l'unité à terre, hébétée.
      applyMoraleShock(state, unit, 8 * falloff, 'concussion');
    }
  }
}
