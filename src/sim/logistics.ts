import { distance } from '../core/math';
import { unitDef } from '../data/units';
import { weapon } from '../data/weapons';
import { reloadFirearm } from './combat';
import { lineOfSight } from './los';
import { isSolid, tileAtFloor } from './map';
import { findPath } from './pathfinding';
import { followPath, requestPath } from './movement';
import type { SimState, Unit } from './types';

/** Ressources finies par caisse, réapprovisionnées périodiquement tant qu'elle existe. */
const RESTOCK_TICKS = 600;
const SELF_HEAL_TICKS = 30;
const MAX_TASK_TICKS = 200;

export function cancelLogistics(unit: Unit): void {
  if (!unit.logisticsTask) return;
  unit.logisticsTask = undefined;
  unit.path = []; unit.pathIndex = 0; unit.pathGoal = null; unit.nextRepathTick = 0;
}

function threatened(state: SimState, unit: Unit): boolean {
  return unit.suppression >= 35 || unit.sinceUnderFire < 3 || state.units.some(enemy => enemy.alive &&
    enemy.state !== 'wounded' && enemy.faction !== unit.faction && distance(unit.x, unit.y, enemy.x, enemy.y) < 3 &&
    lineOfSight(state.map, unit.x, unit.y, enemy.x, enemy.y).visible);
}

function accessible(state: SimState, unit: Unit, cache: SimState['supplyCaches'][number]): boolean {
  return distance(unit.x, unit.y, cache.x, cache.y) <= 1.35 && lineOfSight(state.map, unit.x, unit.y, cache.x, cache.y).visible;
}

function useful(unit: Unit, cache: SimState['supplyCaches'][number]): boolean {
  const gun = weapon(unitDef(unit.defId).weapon);
  return (unit.reserveSalvos !== undefined && gun.reloadEvery > 0 && unit.reserveSalvos < gun.reloadEvery && cache.ammo > 0) ||
    ((unit.bandages ?? 1) < 1 && cache.medicine > 0) ||
    (unit.abilities.heal !== undefined && unit.abilities.heal.charges < (unitDef(unit.defId).charges.heal ?? 0) && cache.medicine > 0) ||
    (unit.abilities.grenade !== undefined && unit.abilities.grenade.charges < (unitDef(unit.defId).charges.grenade ?? 0) && cache.grenades > 0);
}

/** Transfert réel, borné par le stock et l'équipement individuel. */
function collect(state: SimState, unit: Unit, cache: SimState['supplyCaches'][number]): void {
  const def = unitDef(unit.defId), gun = weapon(def.weapon);
  let ammo = 0, medical = 0, grenades = 0;
  if (unit.reserveSalvos !== undefined && gun.reloadEvery > 0) {
    const maximum = Math.floor(gun.ammo / gun.burst);
    ammo = Math.min(cache.ammo, Math.max(0, maximum - unit.salvosLeft - unit.reserveSalvos));
    unit.reserveSalvos += ammo; cache.ammo -= ammo;
    if (unit.salvosLeft === 0) reloadFirearm(unit, gun);
  }
  if (unit.bandages !== undefined && unit.bandages < 1 && cache.medicine > 0) {
    unit.bandages++; cache.medicine--; medical++;
  }
  const heal = unit.abilities.heal;
  if (heal) {
    const count = Math.min(cache.medicine, Math.max(0, (def.charges.heal ?? 0) - heal.charges));
    heal.charges += count; cache.medicine -= count; medical += count;
  }
  const grenade = unit.abilities.grenade;
  if (grenade) {
    grenades = Math.min(cache.grenades, Math.max(0, (def.charges.grenade ?? 0) - grenade.charges));
    grenade.charges += grenades; cache.grenades -= grenades;
  }
  if (ammo || medical || grenades) state.events.push({ tick: state.tick, type: 'resupplied', unitId: unit.id,
    faction: unit.faction, x: unit.x, y: unit.y, label: `${ammo} salves, ${medical} soins, ${grenades} grenades` });
}

/** Unités libres : premiers soins et recherche d'une caisse proche, sans remplacer les ordres du joueur. */
export function updateLogistics(state: SimState, dt: number, controlledUnitId?: number): void {
  if (!state.map.def.logistics) return;
  for (const cache of state.supplyCaches) {
    if (tileAtFloor(state.map, cache.x, cache.y)?.terrain !== 'supplyCrate') continue;
    if (state.tick >= cache.nextRestockTick) {
      cache.ammo = Math.min(60, cache.ammo + 30);
      cache.medicine = Math.min(6, cache.medicine + 3);
      cache.grenades = Math.min(3, cache.grenades + 1);
      cache.nextRestockTick = state.tick + RESTOCK_TICKS;
    }
  }
  for (const unit of state.units) {
    if (!unit.alive || unit.defId === 'creature' || unit.state === 'wounded' || unit.state === 'broken' || unit.rescue) {
      cancelLogistics(unit); continue;
    }
    if (unit.id === controlledUnitId) {
      cancelLogistics(unit);
      // En FPS, il suffit de s'approcher d'une caisse intacte : aucun déplacement imposé.
      if (state.tick % 10 === 0) {
        const cache = state.supplyCaches.find(c => accessible(state, unit, c) &&
          tileAtFloor(state.map, c.x, c.y)?.terrain === 'supplyCrate' && useful(unit, c));
        if (cache) collect(state, unit, cache);
      }
      continue;
    }
    if (unit.goal || unit.forcedTargetId !== null || unit.state === 'pinned' || unit.meleeAttack || unit.meleeDodge || threatened(state, unit)) {
      cancelLogistics(unit); continue;
    }
    let task = unit.logisticsTask;
    if (!task && state.tick % 10 === 0) {
      if ((unit.bandages ?? 0) > 0 && unit.hp <= unit.maxHp * 0.65 && unit.sinceUnderFire >= 5) {
        unit.logisticsTask = task = { kind: 'selfHeal', until: state.tick + SELF_HEAL_TICKS };
        unit.path = []; unit.pathGoal = null; unit.pathIndex = 0;
      } else if (unit.stance === 'advance') {
        const candidates = state.supplyCaches.map((cache, index) => ({ cache, index, dist: distance(unit.x, unit.y, cache.x, cache.y) }))
          .filter(({cache, dist}) => dist <= 9 && useful(unit, cache) && tileAtFloor(state.map, cache.x, cache.y)?.terrain === 'supplyCrate')
          .sort((a, b) => a.dist - b.dist || a.index - b.index);
        for (const candidate of candidates) {
          const {cache, index} = candidate;
          const approaches = [[-1, 0], [1, 0], [0, -1], [0, 1]]
            .map(([x, y]) => ({ x: cache.x + x!, y: cache.y + y! }))
            .filter(point => !isSolid(state.map, point.x, point.y))
            .sort((a, b) => distance(unit.x, unit.y, a.x, a.y) - distance(unit.x, unit.y, b.x, b.y));
          for (const destination of approaches) {
            const path = findPath(state.map, unit.x, unit.y, destination.x, destination.y);
            if (path === null) continue;
            unit.logisticsTask = task = { kind: 'supply', cache: index, startedTick: state.tick, destination };
            unit.path = path; unit.pathGoal = destination; unit.pathIndex = 0; unit.nextRepathTick = 0;
            break;
          }
          if (task) break;
        }
      }
    }
    if (!task) continue;
    if (task.kind === 'selfHeal') {
      unit.intent = 'premiers soins'; unit.state = 'idle';
      if (state.tick >= task.until) {
        const amount = Math.min(unit.maxHp - unit.hp, unit.maxHp * 0.4);
        if (amount > 0 && (unit.bandages ?? 0) > 0) {
          unit.bandages!--; unit.hp += amount;
          state.events.push({ tick: state.tick, type: 'healed', unitId: unit.id, targetId: unit.id, faction: unit.faction, x: unit.x, y: unit.y, amount });
        }
        cancelLogistics(unit);
      }
      continue;
    }
    const cache = state.supplyCaches[task.cache];
    if (!cache || !useful(unit, cache) || tileAtFloor(state.map, cache.x, cache.y)?.terrain !== 'supplyCrate' || state.tick - task.startedTick > MAX_TASK_TICKS) {
      cancelLogistics(unit); continue;
    }
    if (accessible(state, unit, cache)) {
      collect(state, unit, cache); cancelLogistics(unit); continue;
    }
    unit.intent = 'ravitaillement';
    if (!unit.path.length) requestPath(state, unit, task.destination.x, task.destination.y, 1.5);
    followPath(state, unit, dt);
  }
}
