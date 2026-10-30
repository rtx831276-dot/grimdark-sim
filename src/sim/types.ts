import type { FactionId, Vec2 } from '../core/ids';
import type { Rng } from '../core/rng';
import type { MapDefinition, ObjectiveDef } from '../data/map-types';
import type { TerrainId } from '../data/terrain';
import type { AbilityId } from '../data/units';
import type { MeleeClipName } from './melee-timing';
import type { DodgeClipName } from './ai/meleeDodge';
import type { GrenadeMotion } from './grenade-physics';

/* ------------------------------------------------------------------ *
 * Terrain
 * ------------------------------------------------------------------ */

export interface TileState {
  terrain: TerrainId;
  /** Points de structure restants (0 si le terrain n'est pas destructible). */
  hp: number;
  maxHp: number;
}

export interface GameMap {
  def: MapDefinition;
  width: number;
  height: number;
  /** Indexation : y * width + x */
  tiles: TileState[];
  objectives: ObjectiveDef[];
}

/* ------------------------------------------------------------------ *
 * Unités
 * ------------------------------------------------------------------ */

export type UnitState = 'idle' | 'moving' | 'engaging' | 'pinned' | 'broken' | 'dead';

/** Posture : ce que l'unité fait quand elle n'a pas d'ordre direct. */
export type Stance = 'advance' | 'hold' | 'fallback';

export interface AbilitySlot {
  charges: number;
  cooldown: number;
}

export interface Unit {
  id: number;
  faction: FactionId;
  defId: string;
  /** Position courante en tuiles (flottante). */
  x: number;
  y: number;
  /** Position au tick précédent : sert au rendu interpolé. */
  prevX: number;
  prevY: number;
  hp: number;
  maxHp: number;
  armor: number;
  morale: number;
  suppression: number;
  state: UnitState;
  stance: Stance;
  alive: boolean;
  /** Début de la conservation temporaire du corps ou de l’unité sortie. */
  removedTick: number | null;
  /** Cible d'engagement courante. */
  targetId: number | null;
  /** Ordre explicite du joueur (destination). */
  goal: Vec2 | null;
  /** Ordre explicite du joueur : cible à détruire. */
  forcedTargetId: number | null;
  path: Vec2[];
  pathIndex: number;
  /** Destination pour laquelle le chemin courant a été calculé (throttle du pathfinding). */
  pathGoal: Vec2 | null;
  /** Prochain tick où l'IA a le droit de recalculer un chemin. */
  nextRepathTick: number;
  cooldown: number;
  /** Séquence de mêlée en cours, contrôlée par les ticks de simulation. */
  meleeAttack: MeleeAttack | null;
  meleeDodge: MeleeDodge | null;
  nextDodgeTick: number;
  /** Direction visuelle du dernier impact, sans effet sur les déplacements tactiques. */
  deathImpulse: (Vec2 & { lift?: number }) | null;
  /** Salves restantes avant de devoir recharger (voir WeaponDef.reloadEvery). */
  salvosLeft: number;
  /** Vrai pendant un rechargement : le rendu peut l'afficher, l'IA n'y peut rien. */
  reloading: boolean;
  /** Projectiles restants dans la salve en cours (0 = pas de rafale en cours). */
  burstLeft: number;
  burstTargetId: number | null;
  facing: number;
  /** Couverture effective recalculée à chaque tick. */
  cover: number;
  abilities: Partial<Record<AbilityId, AbilitySlot>>;
  /** Temps écoulé depuis le dernier tir reçu (secondes). */
  sinceUnderFire: number;
  /** Profondeur de mouvement actuelle (tuiles/seconde effectives). */
  speed: number;
  kills: number;
  shotsFired: number;
  damageDealt: number;
  /** Dernière intention de l'IA, exposée au HUD pour le débogage. */
  intent: string;
  /** Ticks restants de la capacité « charge » (fanatiques en assaut). */
  chargeTicks: number;
}

export interface MeleeDodge {
  clip: DodgeClipName;
  startTick: number;
  endTick: number;
  stepX: number;
  stepY: number;
}

export interface MeleeAttack {
  clip: MeleeClipName;
  targetId: number;
  /** Orientation verrouillée au lancement du coup. */
  facing: number;
  startTick: number;
  impactTick: number;
  endTick: number;
  resolved: boolean;
}

/* ------------------------------------------------------------------ *
 * Projectiles (grenades, obus)
 * ------------------------------------------------------------------ */

export interface Projectile {
  id: number;
  faction: FactionId;
  ownerId: number;
  weaponId: string;
  kind: 'grenade' | 'shell';
  fromX: number;
  fromY: number;
  x: number;
  y: number;
  tx: number;
  ty: number;
  /** Tick auquel l'engin explose. */
  impactTick: number;
  /** Durée totale du vol, pour l'animation de l'arc. */
  flightTicks: number;
  /** Présent uniquement pour les grenades ; les obus conservent leur trajectoire actuelle. */
  grenadeMotion?: GrenadeMotion;
}

/* ------------------------------------------------------------------ *
 * Événements (consommés par le rendu, le HUD et les tests)
 * ------------------------------------------------------------------ */

export type SimEventType =
  | 'shot'
  | 'melee'
  | 'meleeImpact'
  | 'dodge'
  | 'impact'
  | 'hit'
  | 'kill'
  | 'respawn'
  | 'pinned'
  | 'broken'
  | 'fled'
  | 'recovered'
  | 'rally'
  | 'healed'
  | 'communication'
  | 'explosion'
  | 'terrainDestroyed'
  | 'grenadeThrown'
  | 'artilleryRequested'
  | 'objectiveCaptured'
  | 'orderRefused'
  | 'gameOver';

export interface SimEvent {
  tick: number;
  type: SimEventType;
  x?: number;
  y?: number;
  /** Point visé / origine. */
  tx?: number;
  ty?: number;
  faction?: FactionId;
  unitId?: number;
  targetId?: number;
  weaponId?: string;
  amount?: number;
  radius?: number;
  label?: string;
}

/* ------------------------------------------------------------------ *
 * État global
 * ------------------------------------------------------------------ */

export interface FactionRuntime {
  id: FactionId;
  /** Barrages d'artillerie restants (capacité de faction). */
  barrages: number;
  casualties: number;
  /** Unités sorties de la carte après avoir cédé (comptées à part des morts). */
  fled: number;
  /** Unités vivantes et non démoralisées. */
  effective: number;
  avgMorale: number;
  objectivesHeld: number;
  score: number;
}

export interface SimStats {
  shotsFired: number;
  hits: number;
  damage: number;
  kills: number;
  grenades: number;
  barrages: number;
  shells: number;
  tilesDestroyed: number;
}

/** Information partagée avec les alliés présents au moment de l'appel. */
export interface TacticalReport {
  senderId: number;
  faction: FactionId;
  targetId: number;
  targetX: number;
  targetY: number;
  kind: 'contact' | 'help';
  recipients: number[];
  expiresTick: number;
}

export interface RespawnState {
  delayTicks: number;
  unlimited: boolean;
  reserves: Record<FactionId, number>;
  pending: Array<{ faction: FactionId; defId: string; atTick: number }>;
}

export interface SimState {
  tick: number;
  elapsed: number;
  /**
   * Graine effective de la bataille. C'est la seule valeur à afficher ou à consigner comme
   * « graine » : la ressemer rejoue exactement la même bataille. `rng.snapshot()` renvoie
   * l'état interne du générateur après consommation et ne rejoue rien.
   */
  seed: number;
  map: GameMap;
  respawn: RespawnState | null;
  units: Unit[];
  projectiles: Projectile[];
  /** Événements du tick courant uniquement. */
  events: SimEvent[];
  communications: {
    reports: TacticalReport[];
    nextSpeakerTick: Record<number, number>;
    nextFactionTick: Record<FactionId, number>;
  };
  factions: Record<FactionId, FactionRuntime>;
  /** Objectif -> faction qui le contrôle (null = contesté ou vide). */
  objectiveControl: Record<string, FactionId | null>;
  /** Compte des objectifs détenus, pour l'UI. */
  over: { winner: FactionId | null; reason: string } | null;
  rng: Rng;
  stats: SimStats;
  nextUnitId: number;
  nextProjectileId: number;
  /** Temps depuis le dernier état instable, utilisé pour l'auto-fin de partie. */
  stableTicks: number;
}

/* ------------------------------------------------------------------ *
 * Ordres du joueur
 * ------------------------------------------------------------------ */

export type Order =
  | { type: 'move'; units: number[]; x: number; y: number }
  | { type: 'attack'; units: number[]; target: number }
  | { type: 'hold'; units: number[] }
  | { type: 'advance'; units: number[] }
  | { type: 'fallback'; units: number[] }
  | { type: 'grenade'; units: number[]; x: number; y: number }
  | { type: 'artillery'; faction: FactionId; x: number; y: number }
  | { type: 'rally'; units: number[] };
