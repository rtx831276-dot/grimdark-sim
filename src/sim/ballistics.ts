import { clamp } from '../core/math';
import { TERRAIN } from '../data/terrain';
import { weapon, type WeaponDef } from '../data/weapons';
import { applyDamage } from './combat';
import { damageTile, tileAtFloor } from './map';
import { addSuppression } from './morale';
import type { Projectile, SimState, Unit } from './types';

/** Vitesse en tuiles/seconde, volontairement ralentie pour rester lisible à 10 ticks/s. */
export function muzzleSpeed(gun: WeaponDef): number {
  if (gun.kind === 'pistol') return 38;
  if (gun.kind === 'sniper') return 70;
  if (gun.kind === 'shotgun' || gun.kind === 'smg') return 44;
  return 55;
}
export const BULLET_GRAVITY = 9.81;
const STEP_DISTANCE = 0.08;
const unitRadius = (unit: Unit): number => unit.defId === 'creature' ? 0.65 : 0.27;
const unitHeight = (unit: Unit): number => unit.defId === 'creature' ? 1.36 : unit.state === 'pinned' ? 0.7 : 1.06;

export interface BulletMotion {
  height: number;
  previousHeight: number;
  previousX: number;
  previousY: number;
  velocityX: number;
  velocityY: number;
  velocityHeight: number;
  travelled: number;
  maxRange: number;
  /** Chaque passant n'est soumis à la suppression qu'une seule fois par balle. */
  suppressedIds: number[];
}

/** Crée une balle réelle. Les angles sont calculés au départ et ne suivent plus la cible. */
export function spawnBullet(state: SimState, shooter: Unit, gun: WeaponDef, yaw: number, pitch: number, startHeight = 0.93): Projectile {
  const speed = muzzleSpeed(gun), horizontal = Math.cos(pitch) * speed;
  const motion: BulletMotion = {
    height: startHeight, previousHeight: startHeight, previousX: shooter.x, previousY: shooter.y,
    velocityX: Math.cos(yaw) * horizontal, velocityY: Math.sin(yaw) * horizontal,
    velocityHeight: Math.sin(pitch) * speed, travelled: 0, maxRange: gun.range,
    suppressedIds: [],
  };
  const p: Projectile = { id: state.nextProjectileId++, kind: 'bullet', ownerId: shooter.id, faction: shooter.faction,
    weaponId: gun.id, fromX: shooter.x, fromY: shooter.y, x: shooter.x, y: shooter.y,
    tx: shooter.x + Math.cos(yaw) * gun.range, ty: shooter.y + Math.sin(yaw) * gun.range,
    impactTick: state.tick + Math.ceil(gun.range / Math.max(horizontal, 1) * 10) + 2, flightTicks: 1, bulletMotion: motion };
  state.projectiles.push(p);
  return p;
}

/** Hauteur de collision du décor : volumes simplifiés cohérents avec le rendu des tuiles. */
function obstacleAt(state: SimState, x: number, y: number, h: number): boolean {
  const tile = tileAtFloor(state.map, x, y);
  if (!tile) return true;
  const def = TERRAIN[tile.terrain];
  const top = tile.terrain === 'tree' ? Math.max(1.2, def.height * 0.82) : def.height * 0.82;
  if (top <= 0 || h > top) return false;
  const half = tile.terrain === 'tree' ? 0.09 : 0.48;
  return Math.abs(x - (Math.floor(x) + 0.5)) <= half && Math.abs(y - (Math.floor(y) + 0.5)) <= half;
}

/** Avance par petits pas pour que même une balle rapide ne traverse pas un mur ou un soldat. */
export function advanceBullet(state: SimState, p: Projectile, dt: number): boolean {
  const m = p.bulletMotion;
  if (!m || dt <= 0) return false;
  m.previousX = p.x; m.previousY = p.y; m.previousHeight = m.height;
  const startX = p.x, startY = p.y, startHeight = m.height;
  const speed = Math.hypot(m.velocityX, m.velocityY, m.velocityHeight);
  const count = Math.max(1, Math.ceil(speed * dt / STEP_DISTANCE)), slice = dt / count;
  const gun = weapon(p.weaponId);
  const horizontalSpeed = Math.hypot(m.velocityX, m.velocityY);
  let stopped = false;
  for (let i = 0; i < count && !stopped; i++) {
    const step = horizontalSpeed > 0 ? Math.min(slice, Math.max(0, m.maxRange - m.travelled) / horizontalSpeed) : slice;
    const dx = m.velocityX * step, dy = m.velocityY * step;
    p.x += dx; p.y += dy;
    m.height += m.velocityHeight * step - 0.5 * BULLET_GRAVITY * step * step;
    m.velocityHeight -= BULLET_GRAVITY * step;
    m.travelled += horizontalSpeed * step;
    if (m.height <= 0 || obstacleAt(state, p.x, p.y, m.height)) {
      const result = m.height > 0 && gun.tileDamage > 0 ? damageTile(state.map, p.x, p.y, gun.tileDamage) : null;
      if (result?.destroyed) { state.stats.tilesDestroyed++; state.events.push({tick: state.tick, type: 'terrainDestroyed', x: p.x, y: p.y, label: result.terrain}); }
      state.events.push({tick: state.tick, type: 'impact', x: p.x, y: p.y, height: Math.max(0, m.height), unitId: p.ownerId, weaponId: p.weaponId});
      stopped = true; break;
    }
    for (const unit of state.units) {
      if (!unit.alive || unit.id === p.ownerId) continue;
      const offsetX = unit.x - p.x, offsetY = unit.y - p.y;
      const radius = unitRadius(unit);
      const reach = radius + 0.8;
      if (Math.abs(offsetX) > reach || Math.abs(offsetY) > reach) continue;
      const distSquared = offsetX * offsetX + offsetY * offsetY;
      const height = unitHeight(unit);
      if (unit.faction !== p.faction && distSquared < reach * reach && m.height >= 0 && m.height <= height + 0.4 && !m.suppressedIds.includes(unit.id)) {
        addSuppression(state, unit, gun.suppression * 0.55);
        m.suppressedIds.push(unit.id);
      }
      if (distSquared > radius * radius || m.height < 0 || m.height > height) continue;
      // Les alliés arrêtent les balles sans subir de dégâts ; aucune pénétration.
      if (unit.faction !== p.faction) {
        const damage = gun.damage * clamp(1 - unit.armor * (1 - gun.armorPen), 0.15, 1);
        state.stats.hits++;
        state.events.push({tick: state.tick, type: 'hit', unitId: p.ownerId, targetId: unit.id, faction: p.faction, weaponId: p.weaponId, x: p.x, y: p.y, height: m.height, amount: Math.round(damage)});
        applyDamage(state, unit, damage, {sourceId: p.ownerId, faction: p.faction, kind: 'kinetic'});
        const shooter = state.units.find(u => u.id === p.ownerId);
        if (!unit.alive && shooter) shooter.kills++;
      } else state.events.push({tick: state.tick, type: 'impact', x: p.x, y: p.y, height: m.height, unitId: p.ownerId, weaponId: p.weaponId});
      stopped = true; break;
    }
    if (m.travelled >= m.maxRange - 1e-9) stopped = true;
  }
  state.events.push({tick: state.tick, type: 'bulletTrace', x: startX, y: startY, height: startHeight,
    tx: p.x, ty: p.y, targetHeight: Math.max(0, m.height), unitId: p.ownerId, weaponId: p.weaponId, bulletEnd: stopped});
  return !stopped;
}

/**
 * Prévisualisation centrale du viseur, sans RNG ni mutation. Elle emploie les mêmes
 * volumes, la même gravité et le même ordre d'intersection que les balles réelles ;
 * la dispersion d'une cartouche peut néanmoins produire un résultat différent.
 */
export function ballisticTargetInSight(state: SimState, shooter: Unit, gun: WeaponDef, yaw: number, pitch: number): Unit | null {
  if (!Number.isFinite(yaw) || !Number.isFinite(pitch) || gun.kind === 'melee') return null;
  const speed = muzzleSpeed(gun), horizontal = Math.cos(pitch) * speed;
  const vx = Math.cos(yaw) * horizontal, vy = Math.sin(yaw) * horizontal;
  let vz = Math.sin(pitch) * speed;
  let x = shooter.x, y = shooter.y, height = 0.93, travelled = 0;
  // Préfiltre en 2D : la gravité ne modifie pas le trajet horizontal. Les volumes
  // derrière le joueur ou hors du rayon ne peuvent pas être touchés ; conserver
  // l'ordre original garantit la même priorité pour les volumes qui se chevauchent.
  const sign = horizontal < 0 ? -1 : 1, dx = Math.cos(yaw) * sign, dy = Math.sin(yaw) * sign;
  const candidates = state.units.filter(unit => {
    if (!unit.alive || unit.id === shooter.id) return false;
    if (Math.abs(horizontal) < 1e-8) return true;
    const ux = unit.x - shooter.x, uy = unit.y - shooter.y, radius = unitRadius(unit);
    const along = ux * dx + uy * dy, lateral = Math.abs(ux * dy - uy * dx);
    return along + radius >= 0 && along - radius <= gun.range && lateral <= radius;
  });
  if (!candidates.length) return null;
  // Une tranche fait au plus 0,08 unité ; le plafond évite toute boucle anormale
  // en cas d'entrées externes invalides, même si l'arme est modifiée plus tard.
  const dt = STEP_DISTANCE / speed;
  for (let i = 0; i < 4000 && travelled < gun.range; i++) {
    const step = Math.abs(horizontal) > 1e-8 ? Math.min(dt, (gun.range - travelled) / Math.abs(horizontal)) : dt;
    x += vx * step; y += vy * step;
    height += vz * step - 0.5 * BULLET_GRAVITY * step * step;
    vz -= BULLET_GRAVITY * step;
    travelled += Math.abs(horizontal) * step;
    if (height <= 0 || obstacleAt(state, x, y, height)) return null;
    for (const unit of candidates) {
      const radius = unitRadius(unit);
      const top = unitHeight(unit);
      const dx = unit.x - x, dy = unit.y - y;
      if (height <= top && dx * dx + dy * dy <= radius * radius) return unit;
    }
  }
  return null;
}
