import { distance } from '../core/math';
import type { FactionId } from '../core/ids';
import { factionDef } from '../data/factions';
import { unitDef, type AbilityId } from '../data/units';
import { lineOfSight } from './los';
import { createGrenadeMotion } from './grenade-physics';
import { inBounds } from './map';
import { weapon } from '../data/weapons';
import type { SimState, Unit } from './types';

const TICKS_PER_SECOND = 10;

function spawnProjectile(
  state: SimState,
  unit: { id: number; faction: FactionId; x: number; y: number },
  gunId: string,
  kind: 'grenade' | 'shell',
  tx: number,
  ty: number,
  delaySeconds: number,
): void {
  const ticks = Math.max(1, Math.round(delaySeconds * TICKS_PER_SECOND));
  state.projectiles.push({
    id: state.nextProjectileId++,
    faction: unit.faction,
    ownerId: unit.id,
    weaponId: gunId,
    kind,
    fromX: unit.x,
    fromY: unit.y,
    x: unit.x,
    y: unit.y,
    tx,
    ty,
    impactTick: state.tick + ticks,
    flightTicks: ticks,
    grenadeMotion: kind === 'grenade' ? createGrenadeMotion(unit.x, unit.y, tx, ty, ticks / TICKS_PER_SECOND) : undefined,
  });
}

export const HEAL_RANGE = 3;
export const HEAL_AMOUNT = 20;
export const HEAL_COOLDOWN = 12;
/** Pour l'IA, ne pas dépenser une charge sur une blessure superficielle. */
export const HEAL_MIN_MISSING = 8;

/** Soigne un allié vivant, proche et visible ; ne ressuscite jamais. */
export function useHeal(state: SimState, healer: Unit, target: Unit): boolean {
  const slot = healer.abilities.heal;
  if (!healer.alive || healer.state === 'broken' || !unitDef(healer.defId).abilities.includes('heal') ||
      !slot || slot.charges <= 0 || slot.cooldown > 0 || !target.alive || target.hp <= 0 ||
      target.id === healer.id || target.faction !== healer.faction || target.hp >= target.maxHp ||
      distance(healer.x, healer.y, target.x, target.y) > HEAL_RANGE ||
      !lineOfSight(state.map, healer.x, healer.y, target.x, target.y).visible) return false;
  const amount = Math.min(HEAL_AMOUNT, target.maxHp - target.hp);
  target.hp += amount;
  slot.charges--;
  slot.cooldown = HEAL_COOLDOWN;
  state.events.push({ tick: state.tick, type: 'healed', unitId: healer.id, targetId: target.id,
    faction: healer.faction, x: target.x, y: target.y, amount });
  return true;
}

/** Le blessé allié le plus atteint à portée : ordre stable en cas d'égalité. */
export function woundedAllyFor(state: SimState, healer: Unit): Unit | null {
  let best: Unit | null = null;
  for (const target of state.units) {
    if (!target.alive || target.hp <= 0 || target.id === healer.id || target.faction !== healer.faction ||
        target.maxHp - target.hp < HEAL_MIN_MISSING ||
        distance(healer.x, healer.y, target.x, target.y) > HEAL_RANGE ||
        !lineOfSight(state.map, healer.x, healer.y, target.x, target.y).visible) continue;
    const ratio = target.hp / target.maxHp;
    const bestRatio = best ? best.hp / best.maxHp : Infinity;
    if (ratio < bestRatio || (ratio === bestRatio && target.id < (best?.id ?? Infinity))) best = target;
  }
  return best;
}

/**
 * Lance une grenade en cloche : elle franchit les obstacles assez bas mais peut
 * rebondir sur le décor et exploser ailleurs que sur le point visé.
 */
export function useGrenade(state: SimState, unit: Unit, x: number, y: number): boolean {
  if (!unit.alive || unit.state === 'broken' || !Number.isFinite(x) || !Number.isFinite(y) || !inBounds(state.map, Math.floor(x), Math.floor(y))) return false;
  const def = unitDef(unit.defId);
  if (!def.abilities.includes('grenade')) return false;
  const slot = unit.abilities.grenade;
  if (!slot || slot.charges <= 0 || slot.cooldown > 0) return false;

  const gun = weapon('grenade_frag');
  const dist = distance(unit.x, unit.y, x, y);
  if (dist > gun.range) {
    state.events.push({ tick: state.tick, type: 'orderRefused', unitId: unit.id, faction: unit.faction, x: unit.x, y: unit.y, label: 'hors de portée' });
    return false;
  }

  slot.charges--;
  slot.cooldown = gun.cooldown;
  state.stats.grenades++;
  unit.facing = Math.atan2(y - unit.y, x - unit.x);

  // Dispersion : une grenade n'atterrit jamais exactement où on la vise.
  const tx = x + state.rng.spread(gun.scatter);
  const ty = y + state.rng.spread(gun.scatter);

  state.events.push({
    tick: state.tick,
    type: 'grenadeThrown',
    unitId: unit.id,
    faction: unit.faction,
    weaponId: gun.id,
    x: unit.x,
    y: unit.y,
    tx,
    ty,
  });
  spawnProjectile(state, unit, gun.id, 'grenade', tx, ty, gun.arcTime);
  return true;
}

/**
 * Règle unique de disponibilité du feu hors-carte : il reste des charges, aucun temps de
 * recharge n'est en cours. C'est la seule définition de « l'observateur peut désigner » ;
 * le joueur et l'IA s'y réfèrent tous les deux, sinon l'un dispose d'une capacité que
 * l'autre se refuse (le cooldown n'existait que pour l'IA en V0).
 */
export function artilleryReady(unit: Unit): boolean {
  const slot = unit.abilities.artillery;
  return Boolean(slot && slot.charges > 0 && slot.cooldown <= 0);
}

/** L'observateur d'artillerie de cette faction, s'il est en état de désigner une frappe. */
export function artilleryObserver(state: SimState, faction: FactionId): Unit | null {
  return (
    state.units.find(
      (u) => u.alive && u.faction === faction && unitDef(u.defId).abilities.includes('artillery') && artilleryReady(u),
    ) ?? null
  );
}

/**
 * Barrage d'artillerie hors-carte. La faction dispose de N barrages par bataille ;
 * un observateur doit être vivant pour demander la frappe. Les obus tombent étalés
 * sur plusieurs secondes, avec dispersion : c'est une arme de terreur, pas de précision.
 */
export function callArtilleryStrike(state: SimState, faction: FactionId, x: number, y: number): boolean {
  const runtime = state.factions[faction];
  if (!runtime || runtime.barrages <= 0) return false;

  const observer = artilleryObserver(state, faction);
  if (!observer) {
    // Distinguer « plus personne » de « il souffle » : le joueur doit savoir s'il a perdu
    // son observateur ou s'il doit attendre son temps de recharge.
    const reloading = state.units.some(
      (u) =>
        u.alive &&
        u.faction === faction &&
        unitDef(u.defId).abilities.includes('artillery') &&
        (u.abilities.artillery?.charges ?? 0) > 0,
    );
    state.events.push({
      tick: state.tick,
      type: 'orderRefused',
      faction,
      x,
      y,
      label: reloading ? 'observateur en recharge' : 'aucun observateur disponible',
    });
    return false;
  }

  const gun = weapon('artillery_barrage');
  runtime.barrages--;
  state.stats.barrages++;
  // Les charges de l'observateur plafonnent ce qu'il peut demander dans une bataille,
  // et son temps de recharge évite de vider tous les barrages d'un coup.
  const slot = observer.abilities.artillery;
  if (slot) {
    slot.charges--;
    slot.cooldown = 20;
  }

  state.events.push({
    tick: state.tick,
    type: 'artilleryRequested',
    faction,
    unitId: observer.id,
    weaponId: gun.id,
    x,
    y,
    radius: gun.splashRadius,
    amount: gun.shellsPerStrike,
    label: factionDef(faction).name,
  });

  for (let shell = 0; shell < gun.shellsPerStrike; shell++) {
    const tx = x + state.rng.spread(gun.scatter * (1 + shell * 0.35));
    const ty = y + state.rng.spread(gun.scatter * (1 + shell * 0.35));
    const delay = gun.arcTime + state.rng.range(0, 2.5) + shell * 0.9;
    spawnProjectile(state, observer, gun.id, 'shell', tx, ty, delay);
  }
  state.stats.shells += gun.shellsPerStrike;
  return true;
}

/** Capacité « charge » : assaut fanatique, bref mais presque impossible à arrêter. */
export function useCharge(state: SimState, unit: Unit): boolean {
  if (!unit.alive || unit.state === 'broken') return false;
  const def = unitDef(unit.defId);
  if (!def.abilities.includes('charge')) return false;
  const slot = unit.abilities.charge;
  if (!slot || slot.charges <= 0 || slot.cooldown > 0) return false;

  slot.charges--;
  slot.cooldown = 25;
  unit.chargeTicks = TICKS_PER_SECOND * 8;
  unit.morale = 100;
  unit.suppression = 0;
  state.events.push({ tick: state.tick, type: 'rally', unitId: unit.id, faction: unit.faction, x: unit.x, y: unit.y, amount: 1, label: 'charge' });
  return true;
}

/** Décrémente les temps de recharge des capacités. */
export function updateAbilityCooldowns(state: SimState, unit: Unit, dt: number): void {
  for (const key of Object.keys(unit.abilities) as AbilityId[]) {
    const slot = unit.abilities[key];
    if (!slot) continue;
    if (slot.cooldown > 0) slot.cooldown = Math.max(0, slot.cooldown - dt);
  }
  if (unit.chargeTicks > 0) unit.chargeTicks = Math.max(0, unit.chargeTicks - 1);
  void state;
}
