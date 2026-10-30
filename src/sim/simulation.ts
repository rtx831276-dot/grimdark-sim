import type { FactionId, Vec2 } from '../core/ids';
import { clamp } from '../core/math';
import { hashString, Rng } from '../core/rng';
import { FACTION_IDS, factionDef } from '../data/factions';
import type { DeploymentZone, MapDefinition } from '../data/map-types';
import { VILLAGE_CHURCH } from '../data/maps/village-church';
import { unitDef } from '../data/units';
import { weapon } from '../data/weapons';
import { callArtilleryStrike, updateAbilityCooldowns, useGrenade } from './abilities';
import { updateAi } from './ai/index';
import { updateMeleeDodges } from './ai/meleeDodge';
import { updateMeleeAttacks } from './combat';
import { updateDirectControl, type DirectControl } from './direct-control';
import { updateCommunications } from './ai/communications';
import { detonate } from './explosion';
import { advanceGrenade } from './grenade-physics';
import { compileMap, inBounds, isSolid, nearestWalkable, tileAtFloor } from './map';
import { isEffective, updateMorale, useRally } from './morale';
import { separateUnits } from './movement';
import type { FactionRuntime, GameMap, Order, Projectile, SimEvent, SimState, Unit } from './types';

/** La simulation avance à pas fixe de 100 ms : 10 ticks par seconde. */
export const SIM_DT = 0.1;
export const TICKS_PER_SECOND = 10;
/** Barrages d'artillerie disponibles par faction et par bataille. */
export const BARRAGES_PER_FACTION = 3;

export interface SimulationOptions {
  seed?: number;
  map?: MapDefinition;
  /** Nombre de barrages par faction (par défaut BARRAGES_PER_FACTION). */
  barrages?: number;
  /** Désactive les renforts du scénario si faux. */
  respawns?: boolean;
}

/* ------------------------------------------------------------------ *
 * Création
 * ------------------------------------------------------------------ */

export function createSimulation(options: SimulationOptions = {}): SimState {
  const mapDef = options.map ?? VILLAGE_CHURCH;
  const seed = options.seed ?? (hashString(mapDef.id) ^ 0x5eed);
  const rng = new Rng(seed);
  const map = compileMap(mapDef);

  const factions: Record<FactionId, FactionRuntime> = {};
  for (const id of FACTION_IDS) {
    factions[id] = {
      id,
      barrages: options.barrages ?? BARRAGES_PER_FACTION,
      casualties: 0,
      fled: 0,
      effective: 0,
      avgMorale: 0,
      objectivesHeld: 0,
      score: 0,
    };
  }

  const state: SimState = {
    tick: 0,
    elapsed: 0,
    seed,
    map,
    respawn: options.respawns !== false && mapDef.respawn ? {
      delayTicks: mapDef.respawn.delayTicks,
      unlimited: mapDef.respawn.unlimited ?? false,
      reserves: Object.fromEntries(FACTION_IDS.map(id => [id, mapDef.respawn!.reservesPerFaction])),
      pending: [],
    } : null,
    units: [],
    projectiles: [],
    events: [],
    communications: { reports: [], nextSpeakerTick: {}, nextFactionTick: Object.fromEntries(FACTION_IDS.map((id) => [id, 0])) },
    factions,
    objectiveControl: {},
    over: null,
    rng,
    stats: { shotsFired: 0, hits: 0, damage: 0, kills: 0, grenades: 0, barrages: 0, shells: 0, tilesDestroyed: 0 },
    nextUnitId: 1,
    nextProjectileId: 1,
    stableTicks: 0,
  };

  for (const objective of map.objectives) state.objectiveControl[objective.id] = null;

  deployArmies(state, rng);
  // La menace indépendante n'apparaît que dans le scénario infini.
  if (mapDef.id === 'carrefour-infini') {
    const point = nearestWalkable(map, 23, 17, 12);
    if (point) state.units.push(createUnit(state, 'creature', 'creature', point.x, point.y, factionDef('creature').color));
  }
  refreshRuntimes(state);
  return state;
}

function deployArmies(state: SimState, rng: Rng): void {
  for (const factionId of FACTION_IDS) {
    const def = factionDef(factionId);
    const zone = state.map.def.deployment[factionId] ?? def.deployment;
    const roster: string[] = [];
    for (const entry of state.map.def.rosters?.[factionId] ?? def.roster) {
      for (let i = 0; i < entry.count; i++) roster.push(entry.unit);
    }
    const slots = deploymentSlots(state.map, zone, roster.length, rng);
    roster.forEach((unitId, index) => {
      const slot = slots[index % slots.length]!;
      state.units.push(createUnit(state, factionId, unitId, slot.x, slot.y, def.color));
    });
  }
}

/** Répartit les unités dans la zone de déploiement, en évitant les murs. */
function deploymentSlots(map: GameMap, zone: DeploymentZone, count: number, rng: Rng): Vec2[] {
  const walkable: Vec2[] = [];
  for (let y = zone.y; y < zone.y + zone.h; y++) {
    for (let x = zone.x; x < zone.x + zone.w; x++) {
      if (!inBounds(map, x, y)) continue;
      if (isSolid(map, x, y)) continue;
      walkable.push({ x: x + 0.5, y: y + 0.5 });
    }
  }
  if (walkable.length === 0) {
    const fallback = nearestWalkable(map, zone.x + zone.w / 2, zone.y + zone.h / 2, 12);
    return [fallback ?? { x: zone.x + 0.5, y: zone.y + 0.5 }];
  }
  const slots: Vec2[] = [];
  for (let i = 0; i < count; i++) {
    const slot = walkable[Math.floor((i * walkable.length) / count)]!;
    slots.push({ x: slot.x + rng.spread(0.22), y: slot.y + rng.spread(0.22) });
  }
  return slots;
}

function createUnit(state: SimState, faction: FactionId, defId: string, x: number, y: number, factionColor: string): Unit {
  const def = unitDef(defId);
  const abilities: Unit['abilities'] = {};
  for (const ability of def.abilities) {
    abilities[ability] = { charges: def.charges[ability] ?? 0, cooldown: 0 };
  }
  void factionColor;
  const unit: Unit = {
    id: state.nextUnitId++,
    faction,
    defId,
    x,
    y,
    prevX: x,
    prevY: y,
    hp: def.hp,
    maxHp: def.hp,
    armor: def.armor,
    morale: def.morale,
    suppression: 0,
    state: 'idle',
    stance: 'advance',
    alive: true,
    removedTick: null,
    targetId: null,
    goal: null,
    forcedTargetId: null,
    path: [],
    pathIndex: 0,
    pathGoal: null,
    nextRepathTick: 0,
    cooldown: state.rng.range(0, 1.2),
    meleeAttack: null,
    meleeDodge: null,
    nextDodgeTick: 0,
    deathImpulse: null,
    salvosLeft: weapon(def.weapon).reloadEvery || Number.MAX_SAFE_INTEGER,
    reloading: false,
    burstLeft: 0,
    burstTargetId: null,
    facing: 0,
    cover: 0,
    abilities,
    sinceUnderFire: 99,
    speed: def.speed,
    kills: 0,
    shotsFired: 0,
    damageDealt: 0,
    intent: 'en attente',
    chargeTicks: 0,
  };
  return unit;
}

/* ------------------------------------------------------------------ *
 * Boucle
 * ------------------------------------------------------------------ */

/** Avance la simulation d'un pas fixe. Retourne les événements produits par ce tick. */
export function stepSimulation(state: SimState, dt: number = SIM_DT, direct?: DirectControl): SimEvent[] {
  state.events.length = 0;
  if (state.over) return state.events;

  state.tick++;
  state.elapsed += dt;

  for (const unit of state.units) {
    if (!unit.alive) continue;
    unit.prevX = unit.x;
    unit.prevY = unit.y;
    if (unit.cooldown > 0) unit.cooldown = Math.max(0, unit.cooldown - dt);
    if (unit.burstLeft > 0) unit.burstLeft = Math.max(0, unit.burstLeft - dt * 8);
    updateAbilityCooldowns(state, unit, dt);
    updateMorale(state, unit, dt);
  }

  // En mode sans fin, éliminer les anciens cadavres et références pour borner la mémoire.
  if (state.map.def.endlessBattle) {
    const expired = state.units.filter(unit => !unit.alive && unit.removedTick !== null && state.tick - unit.removedTick >= 150);
    if (expired.length) {
      const ids = new Set(expired.map(unit => unit.id));
      state.units = state.units.filter(unit => !ids.has(unit.id));
      for (const id of ids) delete state.communications.nextSpeakerTick[id];
    }
  }
  updateRespawns(state);
  updateCommunications(state);
  updateAi(state, dt, direct?.unitId);
  if (direct) updateDirectControl(state, direct, dt);
  updateMeleeDodges(state, direct?.unitId);
  separateUnits(state, dt);
  updateMeleeAttacks(state);
  updateProjectiles(state);
  updateObjectives(state);
  if (state.tick % TICKS_PER_SECOND === 0) refreshRuntimes(state);
  checkVictory(state);

  return state.events;
}

/** Crée une nouvelle unité sans réutiliser le cadavre ni son identifiant. */
function updateRespawns(state: SimState): void {
  const respawn = state.respawn;
  if (!respawn) return;
  const remaining: typeof respawn.pending = [];
  for (const entry of respawn.pending) {
    if (entry.atTick > state.tick) { remaining.push(entry); continue; }
    const zone = state.map.def.deployment[entry.faction] ?? factionDef(entry.faction).deployment;
    const candidates: Vec2[] = [];
    for (let y = zone.y; y < zone.y + zone.h; y++) for (let x = zone.x; x < zone.x + zone.w; x++) {
      if (!isSolid(state.map, x + 0.5, y + 0.5)) candidates.push({ x: x + 0.5, y: y + 0.5 });
    }
    if (!candidates.length) {
      const fallback = nearestWalkable(state.map, zone.x + zone.w / 2, zone.y + zone.h / 2, 12);
      if (fallback) candidates.push(fallback);
    }
    if (!candidates.length) { remaining.push(entry); continue; }
    // Privilégier une place libre, loin des soldats, avec départage stable.
    const living = state.units.filter(unit => unit.alive);
    const clearance = (pos: Vec2): number => living.reduce((best, unit) => Math.min(best, Math.hypot(unit.x - pos.x, unit.y - pos.y)), Infinity);
    candidates.sort((a, b) => clearance(b) - clearance(a) || a.y - b.y || a.x - b.x);
    const point = candidates[0]!;
    const unit = createUnit(state, entry.faction, entry.defId, point.x, point.y, factionDef(entry.faction).color);
    state.units.push(unit);
    state.events.push({ tick: state.tick, type: 'respawn', unitId: unit.id, faction: unit.faction, x: unit.x, y: unit.y, label: unitDef(unit.defId).label });
  }
  respawn.pending = remaining;
}

function updateProjectiles(state: SimState): void {
  if (state.projectiles.length === 0) return;
  const alive: Projectile[] = [];
  for (const projectile of state.projectiles) {
    const start = projectile.impactTick - projectile.flightTicks;
    const t = clamp((state.tick - start) / Math.max(1, projectile.flightTicks), 0, 1);
    if (projectile.kind === 'grenade' && projectile.grenadeMotion) advanceGrenade(state.map, projectile, SIM_DT);
    else {
      projectile.x = projectile.fromX + (projectile.tx - projectile.fromX) * t;
      projectile.y = projectile.fromY + (projectile.ty - projectile.fromY) * t;
    }
    if (state.tick >= projectile.impactTick) {
      const x = projectile.kind === 'grenade' && projectile.grenadeMotion ? projectile.x : projectile.tx;
      const y = projectile.kind === 'grenade' && projectile.grenadeMotion ? projectile.y : projectile.ty;
      detonate(state, x, y, weapon(projectile.weaponId), projectile.faction, projectile.ownerId);
    } else {
      alive.push(projectile);
    }
  }
  state.projectiles = alive;
}

/* ------------------------------------------------------------------ *
 * Objectifs, tableau de bord, victoire
 * ------------------------------------------------------------------ */

function updateObjectives(state: SimState): void {
  for (const objective of state.map.objectives) {
    const counts = new Map<FactionId, number>();
    for (const unit of state.units) {
      if (!isEffective(unit) || unit.faction === 'creature') continue;
      if (Math.hypot(unit.x - objective.x, unit.y - objective.y) > objective.radius) continue;
      counts.set(unit.faction, (counts.get(unit.faction) ?? 0) + 1);
    }

    let owner: FactionId | null = null;
    if (counts.size === 1) {
      owner = counts.keys().next().value as FactionId;
    } else if (counts.size > 1) {
      const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
      const [firstId, firstCount] = sorted[0]!;
      const secondCount = sorted[1]?.[1] ?? 0;
      owner = firstCount > secondCount ? firstId : null; // égalité = contesté
    }

    const previous = state.objectiveControl[objective.id] ?? null;
    if (previous !== owner) {
      state.objectiveControl[objective.id] = owner;
      state.events.push({
        tick: state.tick,
        type: 'objectiveCaptured',
        label: objective.label,
        faction: owner ?? undefined,
        x: objective.x,
        y: objective.y,
        amount: objective.value,
      });
    }
  }
}

export function effectiveUnits(state: SimState, faction: FactionId): Unit[] {
  return state.units.filter((unit) => unit.alive && unit.faction === faction && isEffective(unit));
}

export function refreshRuntimes(state: SimState): void {
  for (const factionId of FACTION_IDS) {
    const runtime = state.factions[factionId];
    if (!runtime) continue;
    const living = state.units.filter((unit) => unit.alive && unit.faction === factionId);
    runtime.effective = living.filter(isEffective).length;
    runtime.avgMorale = living.length === 0 ? 0 : living.reduce((sum, unit) => sum + unit.morale, 0) / living.length;

    let held = 0;
    let score = 0;
    for (const objective of state.map.objectives) {
      if (state.objectiveControl[objective.id] !== factionId) continue;
      held++;
      score += objective.value;
    }
    runtime.objectivesHeld = held;
    runtime.score = score;
  }
}

function checkVictory(state: SimState): void {
  if (state.over || state.map.def.endlessBattle) return;
  const counts = FACTION_IDS.map((id) => effectiveUnits(state, id).length + (state.respawn?.pending.filter(entry => entry.faction === id).length ?? 0));
  const total = counts.reduce((sum, count) => sum + count, 0);
  if (total === 0) {
    state.over = { winner: null, reason: 'Les deux camps ont cessé le combat.' };
  } else {
    const loserIndex = counts.findIndex((count) => count === 0);
    if (loserIndex >= 0) {
      const winner = FACTION_IDS[(loserIndex + 1) % FACTION_IDS.length] ?? null;
      state.over = { winner, reason: `${factionDef(winner ?? '').name} tient le terrain.` };
    } else {
      return;
    }
  }
  state.events.push({ tick: state.tick, type: 'gameOver', faction: state.over.winner ?? undefined, label: state.over.reason });
}

/* ------------------------------------------------------------------ *
 * Ordres du joueur
 * ------------------------------------------------------------------ */

/** Applique un ordre. Retourne false si aucune unité n'a pu l'exécuter. */
export function issueOrder(state: SimState, order: Order): boolean {
  switch (order.type) {
    case 'move': {
      let accepted = 0;
      const units = [...new Map(selectUnits(state, order.units).map((unit) => [unit.id, unit])).values()];
      const destinations = formationDestinations(state.map, units.filter((unit) => unit.state !== 'broken'), order.x, order.y);
      for (const unit of units) {
        if (unit.state === 'broken') {
          state.events.push({ tick: state.tick, type: 'orderRefused', unitId: unit.id, faction: unit.faction, x: unit.x, y: unit.y, label: 'unité démoralisée' });
          continue;
        }
        const destination = destinations.get(unit.id);
        if (!destination) continue;
        unit.meleeAttack = null;
        unit.meleeDodge = null;
        unit.goal = destination;
        unit.forcedTargetId = null;
        unit.stance = 'advance';
        unit.nextRepathTick = 0;
        unit.path = [];
        unit.pathIndex = 0;
        unit.pathGoal = null;
        accepted++;
      }
      return accepted > 0;
    }

    case 'attack': {
      const target = state.units.find(unit => unit.id === order.target);
      if (!target || !target.alive) return false;
      let accepted = 0;
      for (const unit of selectUnits(state, order.units)) {
        if (unit.state === 'broken' || unit.faction === target.faction) continue;
        unit.meleeAttack = null;
        unit.meleeDodge = null;
        unit.forcedTargetId = target.id;
        unit.goal = null;
        unit.path = [];
        unit.pathIndex = 0;
        unit.pathGoal = null;
        unit.nextRepathTick = 0;
        accepted++;
      }
      return accepted > 0;
    }

    case 'hold': {
      let accepted = 0;
      for (const unit of selectUnits(state, order.units)) {
        if (unit.state === 'broken') continue;
        unit.meleeAttack = null;
        unit.meleeDodge = null;
        unit.stance = 'hold';
        unit.goal = null;
        unit.forcedTargetId = null;
        unit.path = [];
        unit.pathGoal = null;
        accepted++;
      }
      return accepted > 0;
    }

    case 'advance': {
      let accepted = 0;
      for (const unit of selectUnits(state, order.units)) {
        if (unit.state === 'broken') continue;
        unit.meleeDodge = null;
        unit.stance = 'advance';
        unit.goal = null;
        unit.nextRepathTick = 0;
        // Changer de posture annule le chemin en cours : sans cela, une unité en repli
        // finit d'abord de reculer avant d'obéir à l'ordre d'assaut.
        unit.path = [];
        unit.pathGoal = null;
        accepted++;
      }
      return accepted > 0;
    }

    case 'fallback': {
      let accepted = 0;
      for (const unit of selectUnits(state, order.units)) {
        if (!unit.alive) continue;
        unit.meleeAttack = null;
        unit.meleeDodge = null;
        unit.stance = 'fallback';
        unit.goal = null;
        unit.forcedTargetId = null;
        unit.nextRepathTick = 0;
        // Le chemin en cours est abandonné : sinon l'unité finit son avance vers l'objectif,
        // souvent sous le feu, avant de daigner se replier.
        unit.path = [];
        unit.pathGoal = null;
        accepted++;
      }
      return accepted > 0;
    }

    case 'grenade': {
      for (const unit of selectUnits(state, order.units)) {
        if (useGrenade(state, unit, order.x, order.y)) return true;
      }
      return false;
    }

    case 'rally': {
      let used = 0;
      for (const unit of selectUnits(state, order.units)) {
        const slot = unit.abilities.rally;
        if (!slot || slot.charges <= 0 || slot.cooldown > 0) continue;
        slot.charges--;
        slot.cooldown = 30;
        useRally(state, unit);
        used++;
      }
      return used > 0;
    }

    case 'artillery':
      return callArtilleryStrike(state, order.faction, order.x, order.y);

    default:
      return false;
  }
}

/** Répartit un groupe sur des tuiles distinctes proches du point demandé. */
function formationDestinations(map: GameMap, units: Unit[], x: number, y: number): Map<number, Vec2> {
  const result = new Map<number, Vec2>();
  if (units.length === 1) {
    result.set(units[0]!.id, { x, y });
    return result;
  }
  // Les cases les plus proches de la cible sont prioritaires ; l'identifiant sert
  // de départage déterministe pour ne pas dépendre de l'ordre de sélection.
  const slots: Vec2[] = [];
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  const radiusLimit = Math.max(map.width, map.height);
  for (let radius = 0; radius <= radiusLimit && slots.length < units.length; radius++) {
    const ring: Vec2[] = [];
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius || isSolid(map, cx + dx, cy + dy)) continue;
        ring.push({ x: cx + dx + 0.5, y: cy + dy + 0.5 });
      }
    }
    ring.sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y) || a.y - b.y || a.x - b.x);
    slots.push(...ring);
  }
  const remaining = [...units].sort((a, b) => a.id - b.id);
  for (const slot of slots.slice(0, units.length)) {
    let closest = 0;
    for (let i = 1; i < remaining.length; i++) {
      const candidate = remaining[i]!;
      const best = remaining[closest]!;
      if (Math.hypot(candidate.x - slot.x, candidate.y - slot.y) < Math.hypot(best.x - slot.x, best.y - slot.y)) closest = i;
    }
    const [unit] = remaining.splice(closest, 1);
    if (unit) result.set(unit.id, slot);
  }
  return result;
}

function selectUnits(state: SimState, ids: number[]): Unit[] {
  const selected: Unit[] = [];
  for (const id of ids) {
    const unit = state.units.find(candidate => candidate.id === id);
    if (unit && unit.alive && unit.faction !== 'creature') selected.push(unit);
  }
  return selected;
}

/** Unité présente sur une tuile (pour la sélection à la souris). */
export function unitAt(state: SimState, x: number, y: number): Unit | null {
  const tile = tileAtFloor(state.map, x, y);
  if (!tile) return null;
  let best: Unit | null = null;
  let bestDistance = 0.85;
  for (const unit of state.units) {
    if (!unit.alive) continue;
    const dist = Math.hypot(unit.x - (Math.floor(x) + 0.5), unit.y - (Math.floor(y) + 0.5));
    if (dist < bestDistance) {
      bestDistance = dist;
      best = unit;
    }
  }
  return best;
}

/* ------------------------------------------------------------------ *
 * Utilitaires de test / debug
 * ------------------------------------------------------------------ */

/**
 * Empreinte d'état : deux exécutions avec la même graine et les mêmes ordres doivent
 * produire exactement le même hash. C'est le garde-fou du déterminisme.
 */
export function hashState(state: SimState): number {
  const parts: number[] = [state.tick, state.units.length, state.projectiles.length, state.stats.kills, Math.round(state.stats.damage)];
  if (state.respawn) {
    for (const id of FACTION_IDS) parts.push(state.respawn.reserves[id] ?? 0);
    for (const entry of state.respawn.pending) parts.push(hashString(entry.faction), hashString(entry.defId), entry.atTick);
  }
  for (const unit of state.units) {
    parts.push(
      unit.id,
      unit.alive ? 1 : 0,
      Math.round(unit.hp * 10),
      Math.round(unit.x * 100),
      Math.round(unit.y * 100),
      Math.round(unit.morale * 10),
      Math.round(unit.suppression * 10),
      unit.meleeAttack?.targetId ?? 0,
      unit.meleeAttack ? hashString(unit.meleeAttack.clip) : 0,
      Math.round((unit.meleeAttack?.facing ?? 0) * 1000),
      unit.meleeAttack?.endTick ?? 0,
      unit.meleeAttack?.startTick ?? 0,
      unit.meleeAttack?.impactTick ?? 0,
      unit.meleeAttack?.resolved ? 1 : 0,
      unit.meleeDodge?.startTick ?? 0,
      unit.meleeDodge ? hashString(unit.meleeDodge.clip) : 0,
      unit.nextDodgeTick,
    );
  }
  for (const projectile of state.projectiles) {
    const m = projectile.grenadeMotion;
    parts.push(projectile.id, hashString(projectile.kind), projectile.impactTick,
      Math.round(projectile.x * 1000), Math.round(projectile.y * 1000),
      Math.round((m?.height ?? 0) * 1000), Math.round((m?.velocityX ?? 0) * 1000),
      Math.round((m?.velocityY ?? 0) * 1000), Math.round((m?.velocityHeight ?? 0) * 1000), m?.bounces ?? 0);
  }
  for (const tile of state.map.tiles) {
    if (tile.hp !== tile.maxHp) parts.push(Math.round(tile.hp));
  }
  return hashString(parts.join(','));
}

/** Résumé texte d'une bataille, utilisé par le mode headless et les rapports. */
export function summarize(state: SimState): string {
  const lines: string[] = [];
  lines.push(`tick=${state.tick} (${state.elapsed.toFixed(1)}s) morts=${state.stats.kills} tirs=${state.stats.shotsFired} touchers=${state.stats.hits}`);
  lines.push(`  obus=${state.stats.shells} grenades=${state.stats.grenades} structures détruites=${state.stats.tilesDestroyed}`);
  for (const id of FACTION_IDS) {
    const runtime = state.factions[id];
    if (!runtime) continue;
    lines.push(
      `  ${factionDef(id).shortName.padEnd(12)} effectifs=${String(runtime.effective).padStart(2)} morts=${runtime.casualties} fuyards=${runtime.fled} moral=${runtime.avgMorale.toFixed(0)}% objectifs=${runtime.objectivesHeld} score=${runtime.score}`,
    );
  }
  if (state.over) lines.push(`  FIN: ${state.over.winner ?? 'match nul'} — ${state.over.reason}`);
  return lines.join('\n');
}
