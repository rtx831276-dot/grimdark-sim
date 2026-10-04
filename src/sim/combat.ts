import { clamp, distance } from '../core/math';
import { unitDef } from '../data/units';
import { weapon, type WeaponDef } from '../data/weapons';
import { coverAgainst } from './los';
import { addSuppression, applyMoraleShock, MORALE_SHAKEN } from './morale';
import type { SimState, Unit } from './types';

/** Chance de toucher une cible donnée, avec toute la pile de modificateurs. */
export function effectiveAccuracy(state: SimState, shooter: Unit, target: Unit, dist: number): number {
  const def = unitDef(shooter.defId);
  const gun = weapon(def.weapon);
  let accuracy = gun.accuracy;

  // Chute de précision au-delà de la portée optimale.
  if (dist > gun.optimalRange && gun.range > gun.optimalRange) {
    const over = (dist - gun.optimalRange) / (gun.range - gun.optimalRange);
    accuracy *= clamp(1 - over * 0.8, 0.15, 1);
  }

  accuracy *= clamp(def.skill, 0.2, 1.6);
  if (def.traits.includes('marksman')) accuracy *= 1.12;

  // Tir en mouvement : très pénalisant, sauf pour les troupes d'assaut.
  const moving = shooter.path.length > 0;
  if (moving && !def.traits.includes('shock')) accuracy *= 0.72;

  // Suppression subie : le tireur tremble.
  accuracy *= 1 - 0.55 * (shooter.suppression / 100);

  // Moral entamé : mains moites, gestes approximatifs.
  if (shooter.morale <= MORALE_SHAKEN) accuracy *= 0.78;

  // Couverture de la cible (annulée au corps à corps).
  const cover = gun.kind === 'melee' ? 0 : coverAgainst(state.map, target.x, target.y, shooter.x, shooter.y);
  accuracy *= 1 - cover * 0.78;

  // Une cible en mouvement est plus difficile à ajuster.
  if (target.path.length > 0) accuracy *= 0.88;

  return clamp(accuracy, 0.02, 0.95);
}

/** Couverture effective de la cible par rapport au tireur (exposée au HUD). */
export function coverOf(state: SimState, shooter: Unit, target: Unit): number {
  return coverAgainst(state.map, target.x, target.y, shooter.x, shooter.y);
}

/**
 * Choix de cible : la plus menaçante et la plus atteignable, pas seulement la plus proche.
 * Une cible déjà clouée au sol ou démoralisée est prioritaire — on enfonce le coin.
 */
export function acquireTarget(state: SimState, unit: Unit, requireRange = true): Unit | null {
  const def = unitDef(unit.defId);
  const gun = weapon(def.weapon);
  let best: Unit | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const other of state.units) {
    if (!other.alive || other.faction === unit.faction) continue;
    const dist = distance(unit.x, unit.y, other.x, other.y);
    if (dist > def.vision) continue;
    if (requireRange && dist > gun.range) continue;

    let score = -dist * 1.4;
    score += (1 - other.morale / 100) * 6; // achever les unités démoralisées
    score += (other.suppression / 100) * 4; // et celles déjà clouées
    const otherDef = unitDef(other.defId);
    if (otherDef.abilities.includes('rally')) score += 5; // les officiers d'abord
    if (weapon(otherDef.weapon).kind === 'lmg') score += 4; // neutraliser les mitrailleuses
    score -= other.cover * 4;
    if (dist <= gun.optimalRange + 1) score += 2;

    if (score > bestScore) {
      bestScore = score;
      best = other;
    }
  }

  return best;
}

/** Facteur d'armure : une sentinelle mécanisée se moque des fusils. */
function armorFactor(target: Unit, gun: WeaponDef): number {
  return clamp(1 - target.armor * (1 - gun.armorPen), 0.15, 1);
}

/**
 * Applique des dégâts. Centralisé : toute source de dégâts (balle, grenade, obus)
 * passe par ici, ce qui garantit un comportement identique pour la mort et le moral.
 */
export function applyDamage(
  state: SimState,
  target: Unit,
  amount: number,
  options: { sourceId?: number; faction?: string; kind?: 'kinetic' | 'explosive' | 'melee'; label?: string },
): void {
  if (!target.alive || amount <= 0) return;
  target.hp -= amount;
  target.sinceUnderFire = 0;
  state.stats.damage += amount;
  if (options.sourceId !== undefined) {
    const shooter = state.units[options.sourceId - 1];
    if (shooter && shooter.faction !== target.faction) shooter.damageDealt += amount;
  }

  const shock = options.kind === 'explosive' ? amount * 0.7 : amount * 0.45;
  applyMoraleShock(state, target, shock, options.label ?? options.kind);

  if (target.hp <= 0) {
    killUnit(state, target, options.sourceId, options.faction);
  }
}

/** Mort d'une unité : l'événement est la principale source de perte de moral alentour. */
export function killUnit(state: SimState, target: Unit, sourceId?: number, faction?: string): void {
  if (!target.alive) return;
  target.alive = false;
  target.hp = 0;
  target.state = 'dead';
  target.path = [];
  target.goal = null;
  state.stats.kills++;

  const runtime = state.factions[target.faction];
  if (runtime) runtime.casualties++;

  state.events.push({
    tick: state.tick,
    type: 'kill',
    unitId: target.id,
    faction: target.faction,
    targetId: sourceId,
    x: target.x,
    y: target.y,
    label: faction,
  });

  // Le moral des camarades proches s'effondre : c'est là que les lignes cèdent.
  const isLeader = unitDef(target.defId).abilities.includes('rally');
  for (const other of state.units) {
    if (!other.alive || other.faction !== target.faction) continue;
    const dist = Math.hypot(other.x - target.x, other.y - target.y);
    if (dist > 8) continue;
    const proximity = 1 - dist / 8;
    const base = (isLeader ? 28 : 17) * proximity + 5;
    applyMoraleShock(state, other, base, isLeader ? 'leaderDown' : 'comradeDown');
  }
}

/**
 * Résout une salve complète. Les balles sont tirées « en bloc » : la simulation reste
 * lisible, et le rendu affiche une rafale unique avec le nombre de projectiles.
 */
export function fireSalvo(state: SimState, shooter: Unit, target: Unit): void {
  const def = unitDef(shooter.defId);
  const gun = weapon(def.weapon);
  const dist = distance(shooter.x, shooter.y, target.x, target.y);
  const accuracy = effectiveAccuracy(state, shooter, target, dist);
  const cover = gun.kind === 'melee' ? 0 : coverAgainst(state.map, target.x, target.y, shooter.x, shooter.y);

  shooter.facing = Math.atan2(target.y - shooter.y, target.x - shooter.x);
  shooter.burstLeft = gun.burst;

  // Rechargement : chaque arme a un rythme de feu fini. Sans cette contrainte, le volume
  // de feu continu transforme toute rencontre en extermination (mesuré en headless).
  if (gun.reloadEvery > 0) {
    shooter.salvosLeft -= 1;
    if (shooter.salvosLeft <= 0) {
      shooter.salvosLeft = gun.reloadEvery;
      shooter.reloading = true;
      shooter.cooldown = gun.reloadTime;
    } else {
      shooter.reloading = false;
      shooter.cooldown = gun.cooldown;
    }
  } else {
    shooter.reloading = false;
    shooter.cooldown = gun.cooldown;
  }
  shooter.shotsFired += gun.burst;
  state.stats.shotsFired += gun.burst;

  let hits = 0;
  let damage = 0;
  for (let i = 0; i < gun.burst; i++) {
    if (state.rng.next() < accuracy) {
      hits++;
      damage += gun.damage * armorFactor(target, gun) * (1 - cover * 0.35);
    }
  }

  if (hits > 0) state.stats.hits += hits;

  // Suppression : chaque projectile qui claque près de la cible pèse sur les nerfs,
  // même quand aucun ne touche. C'est le cœur du gameplay de tir de couverture.
  const nearMiss = (gun.burst - hits) * gun.suppression * 0.55;
  const onTarget = hits * gun.suppression * 0.8;
  addSuppression(state, target, nearMiss + onTarget);

  state.events.push({
    tick: state.tick,
    type: 'shot',
    unitId: shooter.id,
    targetId: target.id,
    faction: shooter.faction,
    weaponId: gun.id,
    x: shooter.x,
    y: shooter.y,
    tx: target.x,
    ty: target.y,
    amount: gun.burst,
  });

  if (hits > 0) {
    state.events.push({
      tick: state.tick,
      type: 'hit',
      unitId: shooter.id,
      targetId: target.id,
      faction: shooter.faction,
      weaponId: gun.id,
      x: target.x,
      y: target.y,
      amount: Math.round(damage),
    });
    applyDamage(state, target, damage, { sourceId: shooter.id, faction: shooter.faction, kind: gun.kind === 'melee' ? 'melee' : 'kinetic' });
    if (!target.alive && shooter.alive) {
      shooter.kills++;
    }
  } else {
    // Impact raté : le terrain encaisse (murs qui s'effritent, sacs qui crèvent).
    if (gun.tileDamage > 0) {
      state.events.push({
        tick: state.tick,
        type: 'impact',
        unitId: shooter.id,
        faction: shooter.faction,
        weaponId: gun.id,
        x: target.x,
        y: target.y,
      });
    }
  }

  // Les unités collées à la cible subissent une partie de la suppression (zone battue).
  for (const other of state.units) {
    if (!other.alive || other.faction !== target.faction || other.id === target.id) continue;
    const splash = Math.hypot(other.x - target.x, other.y - target.y);
    if (splash > 1.6) continue;
    addSuppression(state, other, gun.suppression * 0.35 * (1 - splash / 1.6));
  }
}

/** Vrai si l'unité peut lâcher une salve maintenant. */
export function canFire(shooter: Unit): boolean {
  return shooter.alive && shooter.state !== 'broken' && shooter.cooldown <= 0;
}
