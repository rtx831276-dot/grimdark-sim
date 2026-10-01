import { distance } from '../core/math';
import type { FactionId } from '../core/ids';
import { factionDef } from '../data/factions';
import { unitDef } from '../data/units';
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
  });
}

/**
 * Lance une grenade. L'arme est à arc : elle passe par-dessus les murs, ce qui en fait
 * le seul moyen de déloger une unité terrée derrière un mur sans la voir.
 */
export function useGrenade(state: SimState, unit: Unit, x: number, y: number): boolean {
  if (!unit.alive || unit.state === 'broken') return false;
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
 * Barrage d'artillerie hors-carte. La faction dispose de N barrages par bataille ;
 * un observateur doit être vivant pour demander la frappe. Les obus tombent étalés
 * sur plusieurs secondes, avec dispersion : c'est une arme de terreur, pas de précision.
 */
export function callArtilleryStrike(state: SimState, faction: FactionId, x: number, y: number): boolean {
  const runtime = state.factions[faction];
  if (!runtime || runtime.barrages <= 0) return false;

  const observer = state.units.find(
    (u) =>
      u.alive &&
      u.faction === faction &&
      unitDef(u.defId).abilities.includes('artillery') &&
      (u.abilities.artillery?.charges ?? 0) > 0,
  );
  if (!observer) {
    state.events.push({ tick: state.tick, type: 'orderRefused', faction, x, y, label: 'aucun observateur disponible' });
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
  for (const key of Object.keys(unit.abilities) as Array<'grenade' | 'artillery' | 'rally' | 'charge'>) {
    const slot = unit.abilities[key];
    if (!slot) continue;
    if (slot.cooldown > 0) slot.cooldown = Math.max(0, slot.cooldown - dt);
  }
  if (unit.chargeTicks > 0) unit.chargeTicks = Math.max(0, unit.chargeTicks - 1);
  void state;
}
