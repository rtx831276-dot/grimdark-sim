import { describe, expect, it } from 'vitest';
import { ENDLESS_CARREFOUR } from '../src/data/maps/endless-carrefour';
import { TERRAIN } from '../src/data/terrain';
import { weapon } from '../src/data/weapons';
import { advanceBullet, ballisticTargetInSight, muzzleSpeed, spawnBullet } from '../src/sim/ballistics';
import { fireBallistic, fireSalvo } from '../src/sim/combat';
import { updateDirectControl } from '../src/sim/direct-control';
import { createSimulation, hashState, stepSimulation } from '../src/sim/simulation';

function setup() {
  const state = createSimulation({ seed: 5, map: ENDLESS_CARREFOUR });
  const shooter = state.units.find(u => u.defId === 'modern_rifleman')!;
  const target = state.units.find(u => u.faction === 'marteau')!;
  for (const unit of state.units) if (unit !== shooter && unit !== target) unit.alive = false;
  Object.assign(shooter, { x: 5.5, y: 17.5, prevX: 5.5, prevY: 17.5, cooldown: 0 });
  Object.assign(target, { x: 12.5, y: 17.5, prevX: 12.5, prevY: 17.5 });
  for (let x = 5; x <= 19; x++) state.map.tiles[17 * state.map.width + x]!.terrain = 'road';
  return { state, shooter, target, gun: weapon('modern_rifle') };
}

describe('balistique des balles', () => {
  it('avance et tombe progressivement ; les vitesses diffèrent selon les armes', () => {
    const {state, shooter, target, gun} = setup(); target.alive = false;
    const p = spawnBullet(state, shooter, {...gun, range: 100}, 0, 0);
    expect(advanceBullet(state, p, 0.1)).toBe(true);
    expect(p.x).toBeCloseTo(11, 4);
    expect(p.bulletMotion!.height).toBeCloseTo(0.93 - 0.5 * 9.81 * 0.1 ** 2, 5);
    expect(muzzleSpeed(weapon('modern_pistol'))).toBeLessThan(muzzleSpeed(gun));
    expect(muzzleSpeed(weapon('modern_sniper'))).toBeGreaterThan(muzzleSpeed(gun));
  });
  it('touche un soldat plus tard et conserve l’identité du tireur même s’il est mort', () => {
    const {state, shooter, target, gun} = setup();
    const p = spawnBullet(state, shooter, gun, 0, 0);
    shooter.alive = false;
    expect(advanceBullet(state, p, 0.1)).toBe(true);
    expect(state.events.find(e => e.type === 'bulletTrace')?.bulletEnd).toBe(false);
    expect(target.hp).toBe(target.maxHp);
    expect(advanceBullet(state, p, 0.1)).toBe(false);
    expect(target.hp).toBeLessThan(target.maxHp);
    expect(state.events.some(e => e.type === 'hit' && e.unitId === shooter.id && e.targetId === target.id)).toBe(true);
  });
  it('arrête la balle au premier mur même à grande vitesse', () => {
    const {state, shooter, target, gun} = setup();
    const tile = state.map.tiles[17 * state.map.width + 8]!; tile.terrain = 'wall'; tile.hp = TERRAIN.wall.hp;
    const p = spawnBullet(state, shooter, gun, 0, 0);
    expect(advanceBullet(state, p, 0.2)).toBe(false);
    expect(p.x).toBeGreaterThan(8); expect(p.x).toBeLessThan(9);
    expect(target.hp).toBe(target.maxHp);
    expect(state.events.some(e => e.type === 'impact' && e.x! >= 8 && e.x! < 9)).toBe(true);
    expect(state.events.find(e => e.type === 'bulletTrace')?.bulletEnd).toBe(true);
  });
  it('ne suit pas une cible qui se déplace après le tir', () => {
    const {state, shooter, target, gun} = setup();
    const p = spawnBullet(state, shooter, gun, 0, 0);
    advanceBullet(state, p, 0.1);
    target.y += 2;
    advanceBullet(state, p, 0.1);
    expect(target.hp).toBe(target.maxHp);
  });
  it('un allié intercepte la balle sans être blessé ni laisser passer le tir', () => {
    const {state, shooter, target, gun} = setup();
    const ally = state.units.find(u => u !== shooter && u.faction === shooter.faction)!;
    Object.assign(ally, {alive: true, hp: 50, x: 8.5, y: 17.5});
    const p = spawnBullet(state, shooter, gun, 0, 0);
    expect(advanceBullet(state, p, 0.2)).toBe(false);
    expect(ally.hp).toBe(50); expect(target.hp).toBe(target.maxHp);
  });
  it('respecte la portée et produit des traces depuis le trajet réel', () => {
    const {state, shooter, target, gun} = setup(); target.alive = false;
    const p = spawnBullet(state, shooter, {...gun, range: 3}, 0, 0);
    expect(advanceBullet(state, p, 0.2)).toBe(false);
    expect(p.x).toBeLessThan(8.6);
    const trace = state.events.find(e => e.type === 'bulletTrace')!;
    expect(trace.x).toBe(5.5); expect(trace.tx).toBeCloseTo(p.x);
    expect(trace.bulletEnd).toBe(true);
  });
  it('utilise la direction et l’inclinaison FPS plutôt qu’un ciblage automatique', () => {
    const {state, shooter, target} = setup();
    updateDirectControl(state, {unitId: shooter.id, yaw: 0, pitch: 0.3, forward: 0, strafe: 0, fire: true, reload: false}, 0.1);
    expect(state.projectiles.filter(p => p.kind === 'bullet')).toHaveLength(3);
    for (const bullet of state.projectiles) advanceBullet(state, bullet, 0.2);
    expect(target.hp).toBe(target.maxHp);
    expect(state.projectiles[0]!.bulletMotion!.velocityHeight).toBeGreaterThan(0);
  });
  it('ne résout pas instantanément une salve tactique et reste déterministe', () => {
    const a = setup(), b = setup();
    fireSalvo(a.state, a.shooter, a.target); fireSalvo(b.state, b.shooter, b.target);
    expect(a.target.hp).toBe(a.target.maxHp);
    expect(a.state.projectiles).toHaveLength(3);
    for (let i = 0; i < 10; i++) { stepSimulation(a.state); stepSimulation(b.state); }
    expect(hashState(a.state)).toBe(hashState(b.state));
  });
  it('tient compte de la cadence et ne tire pas en recharge', () => {
    const {state, shooter} = setup();
    expect(fireBallistic(state, shooter, 0, 0, 0)).toBe(true);
    expect(fireBallistic(state, shooter, 0, 0, 0)).toBe(false);
    expect(shooter.shotsFired).toBe(3);
  });
});

describe('viseur balistique', () => {
  it('prévoit le premier contact sans consommer de hasard ni créer de projectile', () => {
    const {state, shooter, target, gun} = setup();
    const rng = state.rng.snapshot();
    expect(ballisticTargetInSight(state, shooter, gun, 0, 0)).toBe(target);
    expect(state.projectiles).toHaveLength(0);
    expect(state.rng.snapshot()).toBe(rng);
    const p = spawnBullet(state, shooter, gun, 0, 0);
    advanceBullet(state, p, 0.2);
    expect(state.events.some(e => e.type === 'hit' && e.targetId === target.id)).toBe(true);
  });
  it('reconnaît le sol, les murs, les alliés et la hauteur réelle des cibles clouées', () => {
    const {state, shooter, target, gun} = setup();
    expect(ballisticTargetInSight(state, shooter, gun, 0, -0.3)).toBeNull();
    target.state = 'pinned';
    expect(ballisticTargetInSight(state, shooter, gun, 0, 0)).toBeNull();
    target.state = 'idle';
    state.map.tiles[17 * state.map.width + 8]!.terrain = 'wall';
    expect(ballisticTargetInSight(state, shooter, gun, 0, 0)).toBeNull();
    state.map.tiles[17 * state.map.width + 8]!.terrain = 'road';
    const ally = state.units.find(u => u !== shooter && u.faction === shooter.faction)!;
    Object.assign(ally, {alive: true, hp: 50, x: 8.5, y: 17.5});
    expect(ballisticTargetInSight(state, shooter, gun, 0, 0)).toBe(ally);
  });
  it('traverse les obstacles bas, mais pas les murs, comme la balle réelle', () => {
    const {state, shooter, target, gun} = setup();
    const tile = state.map.tiles[17 * state.map.width + 8]!;
    tile.terrain = 'sandbag';
    expect(ballisticTargetInSight(state, shooter, gun, 0, 0)).toBe(target);
    const p = spawnBullet(state, shooter, gun, 0, 0);
    advanceBullet(state, p, 0.2);
    expect(state.events.some(e => e.type === 'hit' && e.targetId === target.id)).toBe(true);
  });
  it('ne prédit pas de cible derrière le joueur ou en dehors du faisceau', () => {
    const {state, shooter, target, gun} = setup();
    target.x = 4; expect(ballisticTargetInSight(state, shooter, gun, 0, 0)).toBeNull();
    target.x = 10; target.y = 18; expect(ballisticTargetInSight(state, shooter, gun, 0, 0)).toBeNull();
  });

});
