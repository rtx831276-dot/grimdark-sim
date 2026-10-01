import { distance } from '../../core/math';
import { unitDef } from '../../data/units';
import { weapon } from '../../data/weapons';
import { callArtilleryStrike, useCharge, useGrenade } from '../abilities';
import { acquireTarget, canFire, effectiveAccuracy, fireSalvo } from '../combat';
import { lineOfSight } from '../los';
import { terrainAt } from '../map';
import { followPath, hasArrived, requestPath } from '../movement';
import { useRally } from '../morale';
import { findCoverNear } from '../pathfinding';
import type { SimState, Unit } from '../types';
import { commanderFireSupportTarget } from './commanderAI';
import { squadMovementIntent, squadShouldRally } from './squadAI';

/**
 * COUCHE SOLDAT — « que fait cet homme, maintenant ? »
 *
 * C'est la couche qui exécute. Elle ne décide jamais d'un objectif collectif (couche
 * escouade) ni de l'allocation du feu lourd (couche commandement) : elle applique leurs
 * désignations à une unité précise.
 *
 * Cascade de priorités, réévaluée à chaque tick :
 *
 *   1. démoralisé       -> repli vers la ligne arrière, puis sortie du champ
 *   2. ordre du joueur  -> déplacement ou cible désignée
 *   3. sous le feu à découvert -> chercher un abri AVANT de répondre
 *   4. capacité         -> charge, ralliement, barrage demandé, grenade
 *   5. ennemi en vue    -> tirer s'il est à portée, manœuvrer sinon
 *   6. sinon            -> appliquer la posture de l'escouade (assaut / tenir / repli)
 *
 * Volontairement bête et lisible : un soldat est dangereux par son nombre et son feu,
 * pas par son intelligence. Aucun modèle de langage n'intervient ici.
 */

/** En dessous de cette chance de toucher, l'unité garde ses munitions. */
export const MIN_FIRE_ACCURACY = 0.08;

/** Un tick de la couche soldat pour une unité donnée. */
export function updateSoldier(state: SimState, unit: Unit, dt: number): void {
  updateCover(state, unit);

  if (unit.state === 'broken') {
    handleBroken(state, unit, dt);
    unit.intent = 'repli';
    return;
  }

  if (executePlayerOrders(state, unit, dt)) return;
  if (seekCoverIfExposed(state, unit, dt)) return;
  if (trySoldierAbilities(state, unit, dt)) return;
  if (engageOrManoeuvre(state, unit, dt)) return;
  advanceOrHold(state, unit, dt);
}

/* ------------------------------------------------------------------ *
 * 2. Ordres explicites du joueur
 * ------------------------------------------------------------------ */

function executePlayerOrders(state: SimState, unit: Unit, dt: number): boolean {
  if (unit.goal) {
    unit.intent = 'ordre: déplacement';
    if (unit.path.length === 0) requestPath(state, unit, unit.goal.x, unit.goal.y, 0.4);
    followPath(state, unit, dt);
    if (hasArrived(unit, unit.goal.x, unit.goal.y, 1.1)) {
      unit.goal = null;
      unit.pathGoal = null;
    }
    return true;
  }

  if (unit.forcedTargetId === null) return false;
  const forced = state.units[unit.forcedTargetId - 1];
  if (!forced || !forced.alive) {
    unit.forcedTargetId = null;
    return false;
  }

  unit.intent = 'ordre: attaque';
  const gun = weapon(unitDef(unit.defId).weapon);
  const dist = distance(unit.x, unit.y, forced.x, forced.y);
  if (dist <= gun.range && lineOfSight(state.map, unit.x, unit.y, forced.x, forced.y).visible) {
    if (canFire(unit)) fireSalvo(state, unit, forced);
  } else if (requestPath(state, unit, forced.x, forced.y, 1.6)) {
    followPath(state, unit, dt);
  } else {
    followPath(state, unit, dt);
  }
  return true;
}

/* ------------------------------------------------------------------ *
 * 3. Réflexe : se mettre à couvert
 * ------------------------------------------------------------------ */

/**
 * Sous le feu, une unité à découvert cherche un abri AVANT de répondre.
 * C'est ce comportement qui transforme une fusillade en guerre de position : sans lui,
 * les deux camps restent debout au milieu du no man's land et s'exterminent en 30 secondes.
 */
function seekCoverIfExposed(state: SimState, unit: Unit, dt: number): boolean {
  if (unit.state === 'pinned' || unit.goal || unit.forcedTargetId !== null) return false;
  if (unit.sinceUnderFire > 1.5 || unit.cover >= 0.35) return false;
  const gun = weapon(unitDef(unit.defId).weapon);
  if (gun.kind === 'melee') return false; // un corps à corps ne s'abrite pas : il charge
  const threat = nearestEnemy(state, unit);
  if (!threat) return false;

  const cover = findCoverNear(state.map, unit.x, unit.y, threat.x, threat.y, 4);
  if (!cover || distance(unit.x, unit.y, cover.x, cover.y) < 0.5) return false;

  unit.intent = 'à couvert';
  if (unit.path.length === 0) requestPath(state, unit, cover.x, cover.y, 1.2);
  followPath(state, unit, dt);
  return true;
}

/* ------------------------------------------------------------------ *
 * 4. Capacités du soldat
 * ------------------------------------------------------------------ */

function trySoldierAbilities(state: SimState, unit: Unit, dt: number): boolean {
  const def = unitDef(unit.defId);

  // Charge fanatique : on ne la déclenche que sous le feu, quand tenir ne suffit plus.
  const charge = unit.abilities.charge;
  if (def.abilities.includes('charge') && charge && charge.charges > 0 && unit.suppression > 45 && unit.chargeTicks <= 0) {
    const nearest = acquireTarget(state, unit, false);
    if (nearest && distance(unit.x, unit.y, nearest.x, nearest.y) < def.vision * 0.7) {
      if (useCharge(state, unit)) {
        unit.intent = 'charge';
        followPath(state, unit, dt);
        return true;
      }
    }
  }

  // Ralliement : décidé par l'escouade (« la ligne flanche-t-elle ? »), exécuté ici.
  const rally = unit.abilities.rally;
  if (rally && rally.charges > 0 && rally.cooldown <= 0 && squadShouldRally(state, unit)) {
    useRally(state, unit);
    unit.intent = 'ralliement';
    return true;
  }

  // Feu d'artillerie : la cible est désignée par le commandement, la demande part d'ici.
  const artillery = unit.abilities.artillery;
  if (artillery && artillery.charges > 0 && artillery.cooldown <= 0 && unit.suppression < 45) {
    const cluster = commanderFireSupportTarget(state, unit);
    if (cluster && callArtilleryStrike(state, unit.faction, cluster.x, cluster.y)) {
      unit.intent = 'barrage demandé';
      return true;
    }
  }

  // Grenade : on ne la gaspille que sur une cible terrée, clouée au sol ou hors de vue.
  const grenade = unit.abilities.grenade;
  if (grenade && grenade.charges > 0 && grenade.cooldown <= 0) {
    const gun = weapon('grenade_frag');
    const target = acquireTarget(state, unit);
    if (target) {
      const dist = distance(unit.x, unit.y, target.x, target.y);
      const los = lineOfSight(state.map, unit.x, unit.y, target.x, target.y);
      if (dist <= gun.range && (target.cover > 0.4 || target.suppression > 40 || !los.visible)) {
        if (useGrenade(state, unit, target.x, target.y)) {
          unit.intent = 'grenade';
          return true;
        }
      }
    }
  }

  return false;
}

/* ------------------------------------------------------------------ *
 * 5. Engagement
 * ------------------------------------------------------------------ */

function engageOrManoeuvre(state: SimState, unit: Unit, dt: number): boolean {
  const gun = weapon(unitDef(unit.defId).weapon);
  const target = acquireTarget(state, unit);
  if (!target) {
    unit.targetId = null;
    return false;
  }

  unit.targetId = target.id;
  unit.facing = Math.atan2(target.y - unit.y, target.x - unit.x);
  const dist = distance(unit.x, unit.y, target.x, target.y);
  const los = lineOfSight(state.map, unit.x, unit.y, target.x, target.y);

  if (los.visible && dist <= gun.range) {
    unit.intent = 'feu';
    if (unit.state !== 'pinned') unit.state = 'engaging';
    unit.path = [];
    unit.pathGoal = null;
    // Discipline de tir : on n'ouvre le feu que si la cible est raisonnablement atteignable.
    // Sans ce garde-fou, les deux camps se criblent de balles à bout de portée sans résultat.
    if (canFire(unit) && effectiveAccuracy(state, unit, target, dist) >= MIN_FIRE_ACCURACY) {
      fireSalvo(state, unit, target);
    }
    return true;
  }

  unit.intent = los.visible ? 'rapprochement' : 'manœuvre';
  if (requestPath(state, unit, target.x, target.y, 1.8)) followPath(state, unit, dt);
  else followPath(state, unit, dt);
  return true;
}

/* ------------------------------------------------------------------ *
 * 6. Posture (intention d'escouade, exécution individuelle)
 * ------------------------------------------------------------------ */

function advanceOrHold(state: SimState, unit: Unit, dt: number): void {
  const intent = squadMovementIntent(state, unit);

  if (intent.kind === 'fallback') {
    unit.intent = 'repli volontaire';
    if (!intent.line) return;
    if (unit.path.length === 0) requestPath(state, unit, intent.line.x, intent.line.y, 2);
    followPath(state, unit, dt);
    return;
  }

  if (intent.kind === 'hold') {
    unit.intent = 'tenir';
    // Tenir la position ne veut pas dire rester debout à découvert : on cherche un abri proche.
    if (unit.path.length === 0 && unit.cover < 0.25) {
      const threat = nearestEnemy(state, unit);
      const fromX = threat ? threat.x : state.map.width;
      const fromY = threat ? threat.y : unit.y;
      const cover = findCoverNear(state.map, unit.x, unit.y, fromX, fromY, 3);
      if (cover && distance(unit.x, unit.y, cover.x, cover.y) > 0.4) {
        if (requestPath(state, unit, cover.x, cover.y, 1.5)) followPath(state, unit, dt);
      }
    }
    return;
  }

  const { objective } = intent;
  unit.intent = `avance: ${objective.label}`;
  const distToObjective = distance(unit.x, unit.y, objective.x, objective.y);
  if (distToObjective > objective.radius * 0.8) {
    if (unit.path.length === 0) requestPath(state, unit, objective.x, objective.y, 2.2);
    followPath(state, unit, dt);
  } else if (unit.path.length > 0) {
    followPath(state, unit, dt);
  } else if (unit.state === 'moving') {
    unit.state = 'idle';
  }
}

/** Une unité démoralisée fuit vers son arrière et quitte définitivement le champ. */
function handleBroken(state: SimState, unit: Unit, dt: number): void {
  const line = state.map.def.fallbackLine[unit.faction];
  if (!line) return;
  if (hasArrived(unit, line.x, line.y, 2.4)) {
    unit.alive = false;
    unit.state = 'dead';
    unit.path = [];
    const runtime = state.factions[unit.faction];
    if (runtime) runtime.fled++;
    state.events.push({
      tick: state.tick,
      type: 'fled',
      unitId: unit.id,
      faction: unit.faction,
      x: unit.x,
      y: unit.y,
      label: 'quitte le champ',
    });
    return;
  }
  if (unit.path.length === 0) requestPath(state, unit, line.x, line.y, 1.2);
  followPath(state, unit, dt);
}

/* ------------------------------------------------------------------ *
 * Perception du soldat
 * ------------------------------------------------------------------ */

/** Couverture courante de l'unité face à l'ennemi le plus proche (exposée au HUD). */
export function updateCover(state: SimState, unit: Unit): void {
  const threat = nearestEnemy(state, unit);
  if (!threat) {
    unit.cover = terrainAt(state.map, unit.x, unit.y).tileCover;
    return;
  }
  const los = lineOfSight(state.map, threat.x, threat.y, unit.x, unit.y);
  const own = terrainAt(state.map, unit.x, unit.y).tileCover;
  unit.cover = Math.min(0.85, own + los.obstruction * 0.55);
}

/** Ennemi vivant le plus proche, sans considérer la ligne de vue (menace ressentie). */
export function nearestEnemy(state: SimState, unit: Unit): Unit | null {
  let nearest: Unit | null = null;
  let nearestDist = Number.POSITIVE_INFINITY;
  for (const other of state.units) {
    if (!other.alive || other.faction === unit.faction) continue;
    const dist = distance(unit.x, unit.y, other.x, other.y);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearest = other;
    }
  }
  return nearest;
}
