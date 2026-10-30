import { clamp, distance } from '../core/math';
import type { Vec2 } from '../core/ids';
import { unitDef } from '../data/units';
import { weapon, type WeaponDef } from '../data/weapons';
import { coverAgainst, lineOfSight } from './los';
import { MELEE_CLIPS, SWORD_CLIPS, meleeMove } from './melee-timing';
import { meleeHitboxIntersects } from './melee-hitbox';
import { addSuppression, applyMoraleShock, MORALE_SHAKEN } from './morale';
import type { SimState, Unit } from './types';
import { queueReplacement } from './respawn';

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
  options: { sourceId?: number; faction?: string; kind?: 'kinetic' | 'explosive' | 'melee'; label?: string; blastOrigin?: Vec2 },
): void {
  if (!target.alive || amount <= 0) return;
  target.hp -= amount;
  target.sinceUnderFire = 0;
  state.stats.damage += amount;
  if (options.sourceId !== undefined) {
    const shooter = state.units.find(unit => unit.id === options.sourceId);
    if (shooter && shooter.faction !== target.faction) shooter.damageDealt += amount;
  }

  const shock = options.kind === 'explosive' ? amount * 0.7 : amount * 0.45;
  applyMoraleShock(state, target, shock, options.label ?? options.kind);

  if (target.hp <= 0) {
    const blast = options.kind === 'explosive' && options.blastOrigin ? {
      origin: options.blastOrigin, strength: 1.3 + clamp(amount / 80, 0, 1), lift: 0.25 + clamp(amount / 100, 0, 0.65),
    } : undefined;
    killUnit(state, target, options.sourceId, options.faction, blast);
  }
}

/** Mort d'une unité : l'événement est la principale source de perte de moral alentour. */
export function killUnit(state: SimState, target: Unit, sourceId?: number, faction?: string,
  blast?: { origin: Vec2; strength: number; lift: number }): void {
  if (!target.alive) return;
  const attacker = sourceId !== undefined ? state.units.find(unit => unit.id === sourceId) : undefined;
  // Une explosion projette depuis son centre, pas depuis le lanceur de la grenade.
  const origin = blast?.origin ?? attacker;
  const dx = origin ? target.x - origin.x : -Math.cos(target.facing);
  const dy = origin ? target.y - origin.y : -Math.sin(target.facing);
  const length = Math.hypot(dx, dy);
  const strength = blast ? clamp(blast.strength, 0, 2.3) : 1;
  target.deathImpulse = length > 1e-6 ? { x: dx / length * strength, y: dy / length * strength } :
    { x: -Math.cos(target.facing) * strength, y: -Math.sin(target.facing) * strength };
  if (blast) target.deathImpulse.lift = clamp(blast.lift, 0, 0.9);
  target.alive = false;
  target.removedTick = state.tick;
  target.hp = 0;
  target.state = 'dead';
  target.meleeAttack = null;
  target.meleeDodge = null;
  target.path = [];
  target.goal = null;
  state.stats.kills++;

  const runtime = state.factions[target.faction];
  if (runtime) runtime.casualties++;
  // Les renforts sont réservés dès le décès pour empêcher une fin prématurée.
  queueReplacement(state, target);

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
  if (gun.id === 'unarmed' || gun.id === 'modern_sword') {
    if (!canFire(shooter) || !target.alive || shooter.faction === target.faction ||
        distance(shooter.x, shooter.y, target.x, target.y) > gun.range ||
        !lineOfSight(state.map, shooter.x, shooter.y, target.x, target.y).visible) return;
    const facing = Math.atan2(target.y - shooter.y, target.x - shooter.x);
    const nearby = state.units.filter(other => other.alive && other.faction !== shooter.faction &&
      meleeHitboxIntersects(shooter.x, shooter.y, facing, MELEE_CLIPS[6], other.x, other.y) &&
      lineOfSight(state.map, shooter.x, shooter.y, other.x, other.y).visible).length;
    const clip = gun.id === 'modern_sword' ? SWORD_CLIPS[(shooter.id - 1 + shooter.shotsFired) % SWORD_CLIPS.length]! :
      nearby >= 2 && shooter.shotsFired % 3 === 2 ? MELEE_CLIPS[6] :
      MELEE_CLIPS[(shooter.id - 1 + shooter.shotsFired) % MELEE_CLIPS.length]!;
    shooter.meleeAttack = { clip: clip.name, targetId: target.id, facing, startTick: state.tick,
      impactTick: state.tick + clip.impactOffset, endTick: state.tick + clip.durationTicks, resolved: false };
    shooter.facing = facing;
    shooter.cooldown = gun.cooldown;
    shooter.burstLeft = 1;
    shooter.shotsFired++;
    state.stats.shotsFired++;
    state.events.push({ tick: state.tick, type: 'melee', unitId: shooter.id, targetId: target.id,
      faction: shooter.faction, weaponId: gun.id, x: shooter.x, y: shooter.y, tx: target.x, ty: target.y,
      amount: 1, label: clip.name });
    return;
  }
  shooter.facing = Math.atan2(target.y - shooter.y, target.x - shooter.x);
  beginFirearmSalvo(state, shooter, gun);
  resolveSalvo(state, shooter, target, gun);
}

/** Dépense une salve pour le tir tactique et le tir direct, avec les mêmes cadences. */
function beginFirearmSalvo(state: SimState, shooter: Unit, gun: WeaponDef): void {
  shooter.burstLeft = gun.burst;
  if (gun.reloadEvery > 0) {
    shooter.salvosLeft -= 1;
    if (shooter.salvosLeft <= 0) {
      shooter.salvosLeft = gun.reloadEvery;
      shooter.reloading = true;
      shooter.cooldown = gun.reloadTime;
    } else { shooter.reloading = false; shooter.cooldown = gun.cooldown; }
  } else { shooter.reloading = false; shooter.cooldown = gun.cooldown; }
  shooter.shotsFired += gun.burst;
  state.stats.shotsFired += gun.burst;
}

/** Tir dans le vide : même cadence et même recharge, sans inventer une cible. */
export function fireAtPoint(state: SimState, shooter: Unit, x: number, y: number): boolean {
  const gun = weapon(unitDef(shooter.defId).weapon);
  if (gun.kind === 'melee' || !canFire(shooter)) return false;
  beginFirearmSalvo(state, shooter, gun);
  state.events.push({ tick: state.tick, type: 'shot', unitId: shooter.id, faction: shooter.faction,
    weaponId: gun.id, x: shooter.x, y: shooter.y, tx: x, ty: y, amount: gun.burst });
  return true;
}

/** Résout un tir ou l'unique impact programmé d'un combo. */
function resolveSalvo(state: SimState, shooter: Unit, target: Unit, gun: WeaponDef, damageScale = 1): void {
  const dist = distance(shooter.x, shooter.y, target.x, target.y);
  const accuracy = effectiveAccuracy(state, shooter, target, dist);
  const cover = gun.kind === 'melee' ? 0 : coverAgainst(state.map, target.x, target.y, shooter.x, shooter.y);
  let hits = 0;
  let damage = 0;
  for (let i = 0; i < gun.burst; i++) {
    // À mains nues, c'est l'intersection géométrique qui détermine le contact.
    if ((gun.id === 'unarmed' || gun.id === 'modern_sword') || state.rng.next() < accuracy) {
      hits++;
      damage += gun.damage * damageScale * armorFactor(target, gun) * (1 - cover * 0.35);
    }
  }

  if (hits > 0) state.stats.hits += hits;

  // Suppression : chaque projectile qui claque près de la cible pèse sur les nerfs,
  // même quand aucun ne touche. C'est le cœur du gameplay de tir de couverture.
  const nearMiss = (gun.burst - hits) * gun.suppression * 0.55;
  const onTarget = hits * gun.suppression * 0.8;
  addSuppression(state, target, nearMiss + onTarget);

  if ((gun.id !== 'unarmed' && gun.id !== 'modern_sword') || hits > 0) state.events.push({
    tick: state.tick,
    type: (gun.id === 'unarmed' || gun.id === 'modern_sword') ? 'meleeImpact' : gun.kind === 'melee' ? 'melee' : 'shot',
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
  return shooter.alive && shooter.state !== 'broken' && shooter.cooldown <= 0 && !shooter.meleeAttack && !shooter.meleeDodge;
}

/** Les impacts sont résolus après les déplacements, dans l'ordre stable des unités. */
export function updateMeleeAttacks(state: SimState): void {
  for (const shooter of state.units) {
    const attack = shooter.meleeAttack;
    if (!attack) continue;
    if (!shooter.alive || shooter.state === 'broken' || shooter.goal || shooter.stance === 'fallback') {
      shooter.meleeAttack = null;
      continue;
    }
    if (!attack.resolved && state.tick >= attack.impactTick) {
      attack.resolved = true;
      const gun = weapon(unitDef(shooter.defId).weapon);
      const move = meleeMove(attack.clip);
      if (gun.id === 'unarmed' || gun.id === 'modern_sword') {
        // Les ennemis les plus proches interceptent le coup ; jamais les alliés.
        const targets = state.units.filter(target => target.alive && target.faction !== shooter.faction &&
          meleeHitboxIntersects(shooter.x, shooter.y, attack.facing, move, target.x, target.y) &&
          lineOfSight(state.map, shooter.x, shooter.y, target.x, target.y).visible)
          .sort((a, b) => distance(shooter.x, shooter.y, a.x, a.y) - distance(shooter.x, shooter.y, b.x, b.y) || a.id - b.id);
        for (const target of targets.slice(0, move.maxTargets)) resolveSalvo(state, shooter, target, gun, move.damageScale);
      }
    }
    if (state.tick >= attack.endTick) shooter.meleeAttack = null;
  }
}
