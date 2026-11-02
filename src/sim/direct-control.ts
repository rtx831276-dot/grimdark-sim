import { clamp } from '../core/math';
import { unitDef } from '../data/units';
import { weapon, type WeaponDef } from '../data/weapons';
import { canFire, fireAtPoint, fireBallistic, fireSalvo } from './combat';
import { lineOfSight } from './los';
import { isSolid, terrainAt } from './map';
import { moveWithTerrain } from './collision';
import { ballisticTargetInSight } from './ballistics';
import type { SimState, Unit } from './types';

/** Intentions en coordonnées de la simulation, reproductibles sans navigateur. */
export interface DirectControl {
  unitId: number;
  yaw: number;
  pitch: number;
  forward: number;
  strafe: number;
  fire: boolean;
  reload: boolean;
  /** Clic droit maintenu : affine la dispersion balistique. */
  aiming?: boolean;
}

/** Écart angulaire maximal (radians) du tir FPS : valeurs ludiques bornées. */
export function directFireSpread(unit: Pick<Unit, 'suppression'>, gun: WeaponDef, moving: boolean, aiming: boolean): number {
  const base = gun.kind === 'pistol' ? 0.009 : gun.kind === 'sniper' ? 0.004 :
    gun.kind === 'lmg' ? 0.012 : gun.kind === 'shotgun' ? 0.018 : 0.006;
  const stability = aiming ? 0.55 : 1;
  const suppression = Number.isFinite(unit.suppression) ? clamp(unit.suppression, 0, 100) / 100 : 0;
  return clamp(base * stability + (moving ? 0.012 * stability : 0) + suppression * 0.012, 0.001, 0.04);
}

const EYE_HEIGHT = 0.93;
const BODY_HEIGHT = 1.06;
const BODY_RADIUS = 0.27;
/** Intersection du rayon du viseur avec les volumes simples des soldats, sans traverser les murs. */
export function targetInSight(state: SimState, player: Unit, yaw: number, pitch: number, range: number): Unit | null {
  const dx = Math.cos(yaw), dy = Math.sin(yaw);
  let closest: Unit | null = null, nearest = range + 1;
  for (const other of state.units) {
    if (!other.alive || other.id === player.id) continue;
    const ox = other.x - player.x, oy = other.y - player.y;
    const along = ox * dx + oy * dy;
    const lateral = Math.abs(ox * dy - oy * dx);
    const radius = other.defId === 'creature' ? 0.65 : BODY_RADIUS;
    if (along <= 0 || along > range || lateral > radius || along >= nearest) continue;
    const height = EYE_HEIGHT + Math.tan(pitch) * along;
    if (height < 0 || height > (other.defId === 'creature' ? 1.4 : BODY_HEIGHT)) continue;
    if (!lineOfSight(state.map, player.x, player.y, other.x, other.y).visible) continue;
    closest = other; nearest = along;
  }
  return closest;
}

function rayEndpoint(state: SimState, unit: Unit, yaw: number, pitch: number, range: number): { x: number; y: number } {
  const groundDistance = pitch < 0 ? EYE_HEIGHT / -Math.tan(pitch) : range;
  const max = Math.max(0, Math.min(range, groundDistance));
  let x = unit.x, y = unit.y;
  for (let d = 0.1; d <= max; d += 0.1) {
    x = unit.x + Math.cos(yaw) * d; y = unit.y + Math.sin(yaw) * d;
    if (isSolid(state.map, x, y)) break;
  }
  return { x, y };
}

export function updateDirectControl(state: SimState, input: DirectControl, dt: number): void {
  const unit = state.units.find(u => u.id === input.unitId && u.alive);
  if (!unit || !Number.isFinite(input.yaw) || !Number.isFinite(input.pitch)) return;
  const gun = weapon(unitDef(unit.defId).weapon);
  const yaw = input.yaw, pitch = clamp(input.pitch, -1.2, 1.2);
  unit.goal = null; unit.path = []; unit.pathGoal = null; unit.pathIndex = 0; unit.forcedTargetId = null;
  unit.facing = yaw;
  if (unit.reloading && unit.cooldown <= 0) unit.reloading = false;
  if (input.reload && unit.state !== 'broken' && gun.kind !== 'melee' && gun.reloadEvery > 0 && unit.salvosLeft < gun.reloadEvery && !unit.reloading) {
    unit.salvosLeft = gun.reloadEvery; unit.cooldown = gun.reloadTime; unit.reloading = true;
  }
  const startX = unit.x, startY = unit.y;
  const forward = Number.isFinite(input.forward) ? clamp(input.forward, -1, 1) : 0;
  const strafe = Number.isFinite(input.strafe) ? clamp(input.strafe, -1, 1) : 0;
  const length = Math.hypot(forward, strafe);
  if (length > 0 && !unit.meleeAttack && !unit.meleeDodge) {
    const factor = clamp(1 / terrainAt(state.map, unit.x, unit.y).moveCost, 0.55, 1);
    const speed = unitDef(unit.defId).speed * factor * (unit.state === 'pinned' ? 0.45 : 1);
    const distance = speed * dt / Math.max(1, length);
    const mx = (Math.cos(yaw) * forward - Math.sin(yaw) * strafe) * distance;
    const my = (Math.sin(yaw) * forward + Math.cos(yaw) * strafe) * distance;
    const position = moveWithTerrain(state.map, unit.x, unit.y, mx, my);
    unit.x = position.x; unit.y = position.y;
    if (unit.state !== 'pinned' && unit.state !== 'broken') unit.state = 'moving';
  } else if (unit.state !== 'pinned' && unit.state !== 'broken') unit.state = 'idle';
  unit.intent = unit.reloading ? 'rechargement' : 'contrôle direct';
  if (!input.fire || !canFire(unit)) return;
  const target = state.map.def.ballisticWeapons && gun.kind !== 'melee' ?
    ballisticTargetInSight(state, unit, gun, yaw, pitch) : targetInSight(state, unit, yaw, pitch, gun.range);
  if (gun.kind !== 'melee' && state.map.def.ballisticWeapons) {
    // La balle suit le viseur, même dans le vide ou contre un mur : pas d'auto-visée.
    const moved = Math.hypot(unit.x - startX, unit.y - startY) > 0.001;
    fireBallistic(state, unit, yaw, pitch, directFireSpread(unit, gun, moved, input.aiming === true), target?.faction !== unit.faction ? target?.id : undefined);
    return;
  }
  if (target && target.faction !== unit.faction) {
    fireSalvo(state, unit, target);
    // La visée à la souris, et non la cible automatique, pilote l'orientation FPS.
    unit.facing = yaw;
  } else if (gun.kind !== 'melee') {
    const endpoint = target ?? rayEndpoint(state, unit, yaw, pitch, gun.range);
    fireAtPoint(state, unit, endpoint.x, endpoint.y);
  }
}
