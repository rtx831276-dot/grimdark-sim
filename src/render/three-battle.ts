import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import soldierUrl from '../assets/soldier/soldier-combat.glb?inline';
import creatureUrl from '../assets/creature/creature.glb?inline';
import soldierTextureUrl from '../assets/soldier/combat-diffuse.jpg?inline';
import pistolUrl from '../assets/weapons/pistol.glb?inline';
import rifleUrl from '../assets/weapons/rifle.glb?inline';
import bladeUrl from '../assets/weapons/blade.glb?inline';
import grenadeUrl from '../assets/weapons/grenade.glb?inline';
import { lerp } from '../core/math';
import { factionDef } from '../data/factions';
import { TERRAIN } from '../data/terrain';
import { unitDef } from '../data/units';
import { weapon as weaponDef } from '../data/weapons';
import type { GameMap, SimState, Unit } from '../sim';
import type { Camera } from './camera';
import { syncThreeCamera } from './three-camera';
import { SoldierAnimator, soldierMotion } from './soldier-animation';
import { CombatAnimation } from './combat-animation';
import { RagdollWorld, type Ragdoll } from './ragdoll';
import { disposeMountedWeapon, mountWeapon, reloadHandWeight, stabilizeFirearm, type HeldWeapon } from './weapon-mount';
import { ModernDecor, makeGroundTexture } from './modern-decor';
import { FpsWeaponMotion } from './fps-weapon-motion';

const MODERN_GROUND_COLORS: Partial<Record<import('../data/terrain').TerrainId, number>> = {
  mud: 0x858575, road: 0x868e8c, crater: 0x655e50, rubble: 0x8b8d83,
  sandbag: 0x858575, wall: 0x858575, door: 0x858575, tree: 0x858575,
  fence: 0x858575, water: 0x5f7774,
};

export interface FpsView { unitId: number; yaw: number; pitch: number; aiming?: boolean }

interface SoldierVisual {
  group: THREE.Group;
  animator: SoldierAnimator | null;
  combat: CombatAnimation;
  body: THREE.Group;
  weapon: THREE.Group;
  marker: THREE.Mesh | null;
  custom: boolean;
  model: THREE.Object3D | null;
  ragdoll: Ragdoll | null;
  ragdollAttempted: boolean;
  deathStarted: boolean;
  deathAnimated: boolean;
  deathElapsed: number;
}

/** Scène WebGL : géométrie réutilisée et tuiles instanciées pour rester légère. */
export class ThreeBattle {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly skyLight = new THREE.HemisphereLight(0xdce7e7, 0x4c4436, 1.8);
  private readonly sun = new THREE.DirectionalLight(0xffe2b4, 1.4);
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  private readonly fpsCamera = new THREE.PerspectiveCamera(70, 1, 0.03, 120);
  private fpsGun: THREE.Object3D | null = null;
  private fpsGunKey = '';
  private fpsFlash: THREE.Mesh | null = null;
  private fpsFlashTime = 0;
  private fpsShots = 0;
  private fpsMotion: FpsWeaponMotion | null = null;
  private readonly box = new THREE.BoxGeometry(1, 1, 1);
  private readonly material = new THREE.MeshLambertMaterial({ color: 0xffffff });
  private readonly dummy = new THREE.Object3D();
  private readonly color = new THREE.Color();
  private ground: THREE.InstancedMesh | null = null;
  private readonly groundTexture = makeGroundTexture();
  private readonly modernGroundMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff, map: this.groundTexture });
  private modernDecor: ModernDecor | null = null;
  private structures: THREE.InstancedMesh | null = null;
  private map: GameMap | null = null;
  private lastTick = -1;
  private cover = false;
  private unitGroups = new Map<number, SoldierVisual>();
  private readonly weaponModels = new Map<HeldWeapon | 'grenade', THREE.Group>();
  private readonly grenadeGroups = new Map<number, THREE.Object3D>();
  private soldierModel: THREE.Group | null = null;
  private creatureModel: THREE.Group | null = null;
  private ragdollWorld: RagdollWorld | null = null;
  private soldierClips: THREE.AnimationClip[] = [];
  private soldierTexture: THREE.Texture | null = null;
  private soldierMaterials = new Map<string, THREE.MeshStandardMaterial>();
  private disposed = false;
  private width = 0;
  private height = 0;
  private pixelRatio = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setClearColor(0x273235);
    this.scene.add(this.skyLight, this.fpsCamera);
    this.sun.position.set(-15, 30, -10);
    this.scene.add(this.sun);
    // Le modèle est intégré au build, donc fonctionne aussi dans le fichier hors ligne.
    // Si le chargement échoue, les silhouettes procédurales restent utilisables.
    void this.loadSoldier();
    void this.loadCreature();
    void this.loadWeapons();
  }

  private async loadCreature(): Promise<void> {
    try {
      const model = (await new GLTFLoader().loadAsync(creatureUrl)).scene;
      if (this.disposed) { this.disposeAsset(model); return; }
      model.traverse(node => { if (node instanceof THREE.Mesh) node.frustumCulled = false; });
      this.creatureModel = model;
      this.clearSoldiers();
    } catch (error) { console.warn('Modèle de créature indisponible.', error); }
  }

  private async loadWeapons(): Promise<void> {
    const entries = [['pistol', pistolUrl], ['rifle', rifleUrl], ['blade', bladeUrl], ['grenade', grenadeUrl]] as const;
    const loaded = await Promise.allSettled(entries.map(async ([type, url]) => ({ type, model: (await new GLTFLoader().loadAsync(url)).scene })));
    for (const result of loaded) {
      if (result.status !== 'fulfilled') { console.warn('Modèle d’arme indisponible.', result.reason); continue; }
      if (this.disposed) { this.disposeAsset(result.value.model); continue; }
      this.weaponModels.set(result.value.type, result.value.model);
    }
    if (!this.disposed) this.clearSoldiers();
  }

  private disposeAsset(model: THREE.Object3D): void {
    const materials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();
    model.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return;
      node.geometry.dispose();
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) materials.add(material);
    });
    for (const material of materials) {
      if (material instanceof THREE.MeshStandardMaterial && material.map) textures.add(material.map);
      material.dispose();
    }
    for (const texture of textures) texture.dispose();
  }

  private async loadSoldier(): Promise<void> {
    try {
      const [gltf, texture] = await Promise.all([
        new GLTFLoader().loadAsync(soldierUrl),
        new THREE.TextureLoader().loadAsync(soldierTextureUrl),
      ]);
      if (this.disposed) { texture.dispose(); return; }
      texture.colorSpace = THREE.SRGBColorSpace;
      // La texture provient du GLB et respecte la convention UV glTF.
      texture.flipY = false;
      texture.needsUpdate = true;
      this.soldierTexture = texture;
      this.soldierModel = gltf.scene;
      this.soldierClips = gltf.animations;
      // Remplacer les silhouettes une fois le modèle prêt, sans redémarrer la partie.
      this.clearSoldiers();
    } catch (error) {
      console.warn('Modèle de soldat indisponible : silhouettes de secours.', error);
    }
  }

  private clearSoldiers(): void {
    for (const visual of this.unitGroups.values()) this.removeSoldier(visual);
    this.unitGroups.clear();
  }

  private removeSoldier(visual: SoldierVisual): void {
    this.scene.remove(visual.group);
    if (visual.ragdoll) this.ragdollWorld?.remove(visual.ragdoll);
    visual.animator?.dispose();
    this.disposeWeapon(visual.weapon);
    if (visual.model) disposeMountedWeapon(visual.model);
    if (!visual.custom) this.disposeSoldier(visual.body);
    visual.marker?.geometry.dispose();
    (visual.marker?.material as THREE.Material | undefined)?.dispose();
  }

  private setMap(map: GameMap): void {
    this.modernDecor?.dispose();
    this.modernDecor = null;
    if (this.ground) { this.scene.remove(this.ground); this.ground.dispose(); }
    if (this.structures) { this.scene.remove(this.structures); this.structures.dispose(); }
    this.clearSoldiers();
    for (const group of this.grenadeGroups.values()) this.scene.remove(group);
    this.grenadeGroups.clear();
    this.ragdollWorld?.dispose();
    this.ragdollWorld = new RagdollWorld(map);
    this.map = map;
    const modern = map.def.id === 'carrefour-infini' || map.def.id === 'operation-carrefour';
    if (modern) this.modernDecor = new ModernDecor(this.scene);
    this.skyLight.intensity = modern ? 2 : 1.8;
    this.sun.intensity = modern ? 1.55 : 1.4;
    this.ground = new THREE.InstancedMesh(this.box, modern ? this.modernGroundMaterial : this.material, map.tiles.length);
    this.structures = new THREE.InstancedMesh(this.box, this.material, map.tiles.length);
    // Des objets peuvent apparaître après destruction (gravats, cratères).
    this.ground.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.structures.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.scene.add(this.ground, this.structures);
    this.lastTick = -1;
  }

  private updateMap(state: SimState, cover: boolean): void {
    if (!this.ground || !this.structures) return;
    for (let i = 0; i < state.map.tiles.length; i++) {
      const tile = state.map.tiles[i]!;
      const def = TERRAIN[tile.terrain];
      const x = i % state.map.width + 0.5;
      const z = Math.floor(i / state.map.width) + 0.5;
      this.dummy.position.set(x, -0.06, z);
      this.dummy.scale.set(1, 0.12, 1);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.updateMatrix();
      this.ground.setMatrixAt(i, this.dummy.matrix);
      this.color.set(this.modernDecor ? (MODERN_GROUND_COLORS[tile.terrain] ?? def.topColor) : def.topColor);
      if (this.modernDecor) {
        const variation = ((i * 2654435761 >>> 24) % 9 - 4) * 0.008;
        this.color.offsetHSL(0, 0, variation);
      }
      if (cover) this.color.lerp(new THREE.Color(def.tileCover > 0.5 ? 0x4b9fc8 : 0xaa5844), 0.45);
      this.ground.setColorAt(i, this.color);
      const h = def.height * 0.82;
      this.dummy.position.set(x, h / 2, z);
      this.dummy.scale.set(h ? 0.96 : 0, h, h ? 0.96 : 0);
      // Des troncs et obstacles plus fins permettent de mieux lire le terrain.
      if (tile.terrain === 'tree') this.dummy.scale.set(0.18, Math.max(h, 1.2), 0.18);
      if (this.modernDecor && tile.terrain === 'sandbag') this.dummy.scale.set(0, 0, 0);
      this.dummy.updateMatrix();
      this.structures.setMatrixAt(i, this.dummy.matrix);
      this.color.set(this.modernDecor && tile.terrain === 'wall' ? 0xa7aba5 :
        this.modernDecor && tile.terrain === 'tree' ? 0x6c716d : def.color);
      this.structures.setColorAt(i, this.color);
    }
    this.ground.instanceMatrix.needsUpdate = true;
    this.structures.instanceMatrix.needsUpdate = true;
    if (this.ground.instanceColor) this.ground.instanceColor.needsUpdate = true;
    if (this.structures.instanceColor) this.structures.instanceColor.needsUpdate = true;
    this.modernDecor?.update(state.map);
    this.ragdollWorld?.syncMap(state.map);
    this.lastTick = state.tick;
    this.cover = cover;
  }

  private makeSoldier(unit: Unit): SoldierVisual {
    if (unit.defId === 'creature' && this.creatureModel) {
      const group = new THREE.Group();
      const body = new THREE.Group();
      const model = cloneSkeleton(this.creatureModel);
      model.scale.setScalar(0.8);
      body.add(model); group.add(body);
      const marker = new THREE.Mesh(new THREE.RingGeometry(0.48, 0.56, 32),
        new THREE.MeshBasicMaterial({ color: factionDef(unit.faction).colorBright, side: THREE.DoubleSide }));
      marker.rotation.x = -Math.PI / 2; marker.position.y = 0.025; group.add(marker);
      const weapon = new THREE.Group();
      return { group, body, weapon, marker, animator: null,
        combat: new CombatAnimation(body, weapon, null, unit, true), custom: true, model: null,
        ragdoll: null, ragdollAttempted: true, deathStarted: false, deathAnimated: false, deathElapsed: 0 };
    }
    if (this.soldierModel && this.soldierTexture) {
      const group = new THREE.Group();
      const model = cloneSkeleton(this.soldierModel);
      // Le GLB est exprimé en mètres et mesure 1,70 unité.
      model.scale.setScalar(1.06 / 1.7);
      let material = this.soldierMaterials.get(unit.faction);
      if (!material) {
        material = new THREE.MeshStandardMaterial({
          map: this.soldierTexture,
          color: unit.faction === 'marteau' ? 0xa7c2d4 : 0xfff2dc,
          roughness: 0.9,
        });
        this.soldierMaterials.set(unit.faction, material);
      }
      model.traverse((node) => {
        if (node instanceof THREE.Mesh) {
          node.material = material!;
          // Un squelette animé peut dépasser ses bornes de repos.
          node.frustumCulled = false;
        }
      });
      const body = new THREE.Group();
      body.add(model);
      group.add(body);
      const weaponId = unitDef(unit.defId).weapon;
      const melee = weaponDef(weaponId).kind === 'melee';
      // Initialise la pose de repos avant de calibrer l'arme sur la main.
      const animator = new SoldierAnimator(model, this.soldierClips, unit.id * 0.73, unit, melee, weaponDef(weaponId).reloadTime);
      const held: HeldWeapon | null = weaponId === 'modern_pistol' ? 'pistol' : weaponId === 'modern_rifle' ? 'rifle' : weaponId === 'modern_sword' ? 'blade' : null;
      const source = held ? this.weaponModels.get(held) : undefined;
      const mounted = held && source ? mountWeapon(model, source, held) : null;
      // Le support procédural ne double pas le modèle réel quand celui-ci est disponible.
      const weapon = this.makeWeapon(Boolean(mounted) || melee);
      body.add(weapon);
      // Disque de faction : reste lisible même lorsque les textures sont proches.
      const marker = new THREE.Mesh(
        new THREE.RingGeometry(0.25, 0.34, 20),
        new THREE.MeshBasicMaterial({ color: factionDef(unit.faction).colorBright, side: THREE.DoubleSide }),
      );
      marker.rotation.x = -Math.PI / 2;
      marker.position.y = 0.025;
      group.add(marker);
      return { group, body, weapon, marker, animator, combat: new CombatAnimation(body, weapon, model, unit, melee, animator.hasMeleeClips || animator.hasFirearmPose), custom: true, model, ragdoll: null, ragdollAttempted: false, deathStarted: false, deathAnimated: false, deathElapsed: 0 };
    }
    const group = new THREE.Group();
    const body = this.makeFallbackSoldier(unit);
    const melee = weaponDef(unitDef(unit.defId).weapon).kind === 'melee';
    const weapon = this.makeWeapon(melee);
    body.add(weapon);
    group.add(body);
    return { group, body, weapon, marker: null, animator: null, combat: new CombatAnimation(body, weapon, null, unit, melee), custom: false, model: null, ragdoll: null, ragdollAttempted: false, deathStarted: false, deathAnimated: false, deathElapsed: 0 };
  }

  /** Arme procédurale de secours pour les porteurs d'armes à feu. */
  private makeWeapon(melee: boolean): THREE.Group {
    const weapon = new THREE.Group();
    if (melee) return weapon;
    const material = new THREE.MeshLambertMaterial({ color: 0x292d2a });
    const part = (w: number, h: number, d: number, x: number, y: number, z: number): void => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
      mesh.position.set(x, y, z);
      weapon.add(mesh);
    };
    part(0.08, 0.09, 0.52, 0, 0, 0);
    part(0.045, 0.045, 0.24, 0, 0, 0.34);
    part(0.065, 0.12, 0.09, 0, -0.09, -0.02);
    const flash = new THREE.Mesh(new THREE.OctahedronGeometry(0.09), new THREE.MeshBasicMaterial({ color: 0xffca71 }));
    flash.name = 'muzzleFlash';
    flash.position.z = 0.48;
    flash.visible = false;
    weapon.add(flash);
    weapon.position.set(-0.12, 0.69, 0.22);
    return weapon;
  }

  private disposeWeapon(weapon: THREE.Group): void {
    const materials = new Set<THREE.Material>();
    weapon.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        materials.add(object.material as THREE.Material);
      }
    });
    for (const material of materials) material.dispose();
    weapon.removeFromParent();
  }

  private makeFallbackSoldier(unit: Unit): THREE.Group {
    const group = new THREE.Group();
    const uniform = new THREE.MeshLambertMaterial({ color: factionDef(unit.faction).color });
    const dark = new THREE.MeshLambertMaterial({ color: factionDef(unit.faction).colorDark });
    const skin = new THREE.MeshLambertMaterial({ color: 0xbca889 });
    const part = (w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material): void => {
      const mesh = new THREE.Mesh(this.box, mat);
      mesh.scale.set(w, h, d);
      mesh.position.set(x, y, z);
      group.add(mesh);
    };
    // Modèles procéduraux, sans ressources externes.
    part(0.30, 0.42, 0.22, 0, 0.58, 0, uniform);
    part(0.11, 0.35, 0.12, -0.09, 0.18, 0, dark);
    part(0.11, 0.35, 0.12, 0.09, 0.18, 0, dark);
    part(0.20, 0.20, 0.20, 0, 0.89, 0, skin);
    part(0.23, 0.10, 0.23, 0, 1.01, 0, dark);
    part(0.10, 0.32, 0.12, -0.22, 0.58, 0, uniform);
    part(0.10, 0.32, 0.12, 0.22, 0.58, 0, uniform);
    return group;
  }

  render(state: SimState, camera: Camera, alpha: number, cover: boolean, animationDelta: number, renderTick: number, fps?: FpsView): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (camera.viewWidth !== this.width || camera.viewHeight !== this.height || dpr !== this.pixelRatio) {
      this.width = camera.viewWidth; this.height = camera.viewHeight; this.pixelRatio = dpr;
      this.renderer.setPixelRatio(dpr);
      this.renderer.setSize(this.width, this.height, false);
    }
    if (this.map !== state.map) this.setMap(state.map);
    if (state.tick !== this.lastTick || this.cover !== cover) this.updateMap(state, cover);
    syncThreeCamera(this.camera, camera);
    const player = fps ? state.units.find(unit => unit.id === fps.unitId && unit.alive) : undefined;
    if (fps && player) {
      const x = lerp(player.prevX, player.x, alpha), z = lerp(player.prevY, player.y, alpha);
      this.fpsCamera.aspect = this.width / Math.max(1, this.height);
      this.fpsCamera.updateProjectionMatrix();
      this.fpsCamera.position.set(x, 0.93, z);
      const horizontal = Math.cos(fps.pitch);
      this.fpsCamera.lookAt(x + Math.cos(fps.yaw) * horizontal, 0.93 + Math.sin(fps.pitch), z + Math.sin(fps.yaw) * horizontal);
      this.updateFpsGun(player, animationDelta, fps.aiming ?? false, renderTick);
    } else this.clearFpsGun();
    const present = new Set(state.units.map(unit => unit.id));
    for (const [id, visual] of this.unitGroups) {
      if (!present.has(id)) { this.removeSoldier(visual); this.unitGroups.delete(id); }
    }
    const activeGrenades = new Set<number>();
    for (const projectile of state.projectiles) {
      if (projectile.kind !== 'grenade') continue;
      const source = this.weaponModels.get('grenade');
      if (!source) continue;
      activeGrenades.add(projectile.id);
      let group = this.grenadeGroups.get(projectile.id);
      if (!group) {
        group = source.clone(true);
        group.scale.setScalar(0.08);
        this.scene.add(group);
        this.grenadeGroups.set(projectile.id, group);
      }
      const progress = Math.max(0, Math.min(1, (state.tick - (projectile.impactTick - projectile.flightTicks) + alpha) / projectile.flightTicks));
      const motion = projectile.grenadeMotion;
      group.position.set(motion ? lerp(motion.previousX, projectile.x, alpha) : projectile.x,
        motion ? lerp(motion.previousHeight, motion.height, alpha) : 0.55 + Math.sin(Math.PI * progress) * 1.8,
        motion ? lerp(motion.previousY, projectile.y, alpha) : projectile.y);
      group.rotation.z = progress * Math.PI * 3;
    }
    for (const [id, group] of this.grenadeGroups) {
      if (!activeGrenades.has(id)) { this.scene.remove(group); this.grenadeGroups.delete(id); }
    }
    for (const unit of state.units) {
      let visual = this.unitGroups.get(unit.id);
      if (!visual) {
        visual = this.makeSoldier(unit);
        this.unitGroups.set(unit.id, visual);
        this.scene.add(visual.group);
      }
      const { group, animator, combat, marker } = visual;
      group.visible = (unit.alive || unit.hp <= 0) && unit.id !== player?.id;
      if (marker) marker.visible = unit.alive;
      group.position.set(unit.alive ? lerp(unit.prevX, unit.x, alpha) : unit.x, 0, unit.alive ? lerp(unit.prevY, unit.y, alpha) : unit.y);
      group.rotation.y = Math.PI / 2 - unit.facing;
      group.scale.y = unit.alive && unit.state === 'pinned' ? 0.65 : 1;
      const dead = !unit.alive && unit.hp <= 0;
      if (unit.defId === 'creature' && this.creatureModel) {
        // Pas de clips dans le GLB : seul le corps entier oscille et se penche.
        const moving = Math.hypot(unit.x - unit.prevX, unit.y - unit.prevY) > 0.005;
        const phase = renderTick * 0.7;
        visual.body.position.y = dead ? 0 : moving ? Math.abs(Math.sin(phase)) * 0.045 : 0;
        visual.body.position.z = dead ? 0 : Math.min(1, unit.burstLeft * 2) * 0.14;
        visual.body.rotation.x = dead ? -0.65 : (moving ? Math.sin(phase) * 0.025 : 0) - Math.min(1, unit.burstLeft * 2) * 0.10;
        visual.body.rotation.z = dead ? 0.65 : moving ? Math.sin(phase) * 0.04 : 0;
        continue;
      }
      if (dead && visual.model && !visual.ragdollAttempted) {
        if (!visual.deathStarted) {
          visual.deathStarted = true;
          combat.beforeMixer();
          // La chute Meshy précède la physique ; aucun dégât ne dépend du rendu.
          visual.body.rotation.x = 0; visual.body.rotation.z = 0; visual.body.position.y = 0;
          visual.model.scale.y = visual.model.scale.x;
          visual.deathAnimated = animator?.beginDeath(unit.id) ?? false;
        }
        if (visual.deathAnimated && animator) {
          animator.updateDeath(animationDelta);
          visual.deathElapsed += animationDelta;
          if (visual.deathElapsed < 0.75) continue;
        }
        visual.ragdollAttempted = true;
        group.updateWorldMatrix(true, true);
        visual.ragdoll = this.ragdollWorld?.create(visual.model, unit.deathImpulse, unit.id) ?? null;
      }
      if (!visual.ragdoll) {
        combat.beforeMixer();
        animator?.update(soldierMotion(unit), animationDelta, unit, renderTick);
        combat.update(unit, animationDelta);
        if (unit.alive && visual.model) {
          const reloadTime = weaponDef(unitDef(unit.defId).weapon).reloadTime;
          const follow = unit.reloading && animator?.hasFirearmPose ? reloadHandWeight(unit.cooldown, reloadTime) : 0;
          stabilizeFirearm(visual.model, follow);
        }
      }
    }
    this.ragdollWorld?.step(animationDelta);
    this.renderer.render(this.scene, player ? this.fpsCamera : this.camera);
  }

  private clearFpsGun(): void {
    this.fpsGun?.removeFromParent();
    if (this.fpsFlash) { this.fpsFlash.geometry.dispose(); (this.fpsFlash.material as THREE.Material).dispose(); }
    this.fpsGun = null; this.fpsFlash = null; this.fpsGunKey = ''; this.fpsFlashTime = 0;
    this.fpsMotion = null;
    this.fpsCamera.fov = 70;
  }

  private updateFpsGun(unit: Unit, dt: number, aiming: boolean, renderTick: number): void {
    const id = unitDef(unit.defId).weapon;
    const type: HeldWeapon | null = id === 'modern_pistol' ? 'pistol' : id === 'modern_rifle' ? 'rifle' : id === 'modern_sword' ? 'blade' : null;
    const source = type ? this.weaponModels.get(type) : undefined;
    const key = `${unit.id}:${type ?? 'none'}`;
    if (key !== this.fpsGunKey && (!type || source)) {
      this.clearFpsGun(); this.fpsGunKey = key; this.fpsShots = unit.shotsFired;
      this.fpsMotion = new FpsWeaponMotion(unit.shotsFired);
      if (source && type) {
        const gun = source.clone(true);
        const scale = type === 'rifle' ? 0.34 : type === 'pistol' ? 0.20 : 0.25;
        gun.scale.setScalar(scale);
        gun.quaternion.setFromUnitVectors(type === 'blade' ? new THREE.Vector3(-1, -1, 0).normalize() : new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, -1));
        const holder = new THREE.Group();
        holder.position.set(0.24, -0.23, -0.7);
        holder.add(gun);
        if (type !== 'blade') {
          const flash = new THREE.Mesh(new THREE.OctahedronGeometry(type === 'pistol' ? 0.35 : 0.16), new THREE.MeshBasicMaterial({ color: 0xffd286 }));
          flash.position.set(-1.01, type === 'pistol' ? 0.44 : 0.105, 0);
          flash.scale.set(1.8, 0.65, 0.65); flash.visible = false; gun.add(flash); this.fpsFlash = flash;
        }
        this.fpsCamera.add(holder); this.fpsGun = holder;
      }
    }
    if (dt > 0) {
      this.fpsFlashTime = Math.max(0, this.fpsFlashTime - dt);
      if (unit.shotsFired > this.fpsShots) this.fpsFlashTime = 0.09;
      this.fpsShots = unit.shotsFired;
    }
    if (this.fpsFlash) this.fpsFlash.visible = this.fpsFlashTime > 0;
    const gunDef = weaponDef(id);
    const reloading = unit.reloading && unit.cooldown > 0 && gunDef.reloadTime > 0;
    const progress = reloading ? Math.max(0, Math.min(1, 1 - unit.cooldown / gunDef.reloadTime)) : null;
    const moving = Math.hypot(unit.x - unit.prevX, unit.y - unit.prevY) > 0.005;
    const motion = this.fpsMotion?.update(dt, { aiming: aiming && gunDef.kind !== 'melee', moving, reloadProgress: progress, shots: unit.shotsFired });
    if (motion) {
      this.fpsCamera.fov = 70 - 20 * motion.aim;
      this.fpsCamera.updateProjectionMatrix();
      if (this.fpsGun) {
        this.fpsGun.position.set(0.24 - motion.aim * 0.12 + motion.bobX, -0.23 + motion.aim * 0.015 - motion.reload * 0.18 - motion.bobY, -0.7 + motion.recoil * 0.055);
        this.fpsGun.rotation.set(motion.recoil * 0.1 + motion.reload * 0.1, 0, -motion.reload * 0.32);
        if (type === 'blade' && unit.meleeAttack) {
          const attack = unit.meleeAttack;
          const progress = Math.max(0, Math.min(1, (renderTick - attack.startTick) / (attack.endTick - attack.startTick)));
          const swing = Math.sin(Math.PI * progress);
          this.fpsGun.rotation.set(-0.4 * swing, 0.45 * swing, -0.8 * swing);
          this.fpsGun.position.x -= 0.12 * swing;
        }
      }
    }
  }

  private disposeSoldier(group: THREE.Group): void {
    const materials = new Set<THREE.Material>();
    group.traverse((object) => {
      if (object instanceof THREE.Mesh) materials.add(object.material as THREE.Material);
    });
    for (const material of materials) material.dispose();
  }

  dispose(): void {
    this.disposed = true;
    this.clearSoldiers();
    this.ragdollWorld?.dispose();
    this.ragdollWorld = null;
    for (const material of this.soldierMaterials.values()) material.dispose();
    this.soldierTexture?.dispose();
    for (const group of this.grenadeGroups.values()) this.scene.remove(group);
    this.grenadeGroups.clear();
    if (this.creatureModel) this.disposeAsset(this.creatureModel);
    for (const model of this.weaponModels.values()) this.disposeAsset(model);
    this.weaponModels.clear();
    this.soldierModel?.traverse((node) => {
      if (node instanceof THREE.Mesh) {
        node.geometry.dispose();
        if (Array.isArray(node.material)) node.material.forEach((material) => material.dispose());
        else node.material.dispose();
      }
    });
    this.clearFpsGun();
    this.modernDecor?.dispose();
    this.modernGroundMaterial.dispose();
    this.groundTexture.dispose();
    this.renderer.dispose();
    this.box.dispose();
    this.material.dispose();
    this.ground?.dispose();
    this.structures?.dispose();
  }
}
