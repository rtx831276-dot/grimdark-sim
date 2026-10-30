import { AnimationAction, AnimationClip, AnimationMixer, LoopOnce, Object3D } from 'three';
import { DODGE_CLIPS, MELEE_CLIPS, SWORD_CLIPS, SIM_DT, type Unit } from '../sim';

export type SoldierMotion = 'idle' | 'walk' | 'run';
type MotionAction = 'walk' | 'run' | 'limp';
type CombatMotion = Pick<Unit, 'alive' | 'hp' | 'maxHp'> & { meleeAttack?: Unit['meleeAttack']; meleeDodge?: Unit['meleeDodge']; intent?: string; facing?: number; reloading?: boolean; cooldown?: number; defId?: string };

const DEATH_CLIPS = ['dying_backwards', 'Knock_Down', 'Knock_Down_1', 'Fall_Dead_from_Abdominal_Injury', 'Shot_and_Fall_Forward', 'Shot_and_Fall_Backward', 'Shot_and_Blown_Back', 'Shot_and_Slow_Fall_Backward', 'Dead'] as const;

export function soldierMotion(unit: Pick<Unit, 'alive' | 'x' | 'y' | 'prevX' | 'prevY'>): SoldierMotion {
  if (!unit.alive) return 'idle';
  const travelled = Math.hypot(unit.x - unit.prevX, unit.y - unit.prevY);
  if (travelled < 0.001) return 'idle';
  return travelled / SIM_DT >= 1.8 ? 'run' : 'walk';
}

/** Le temps des coups vient des ticks de simulation, jamais du compteur de frames. */
export class SoldierAnimator {
  readonly mixer: AnimationMixer;
  readonly hasMeleeClips: boolean;
  readonly hasFirearmPose: boolean;
  private readonly actions: Partial<Record<MotionAction, AnimationAction>> = {};
  private readonly idle: AnimationAction | undefined;
  private readonly upperBody: AnimationAction | undefined;
  private upperVisible = false;
  private readonly attacks = new Map<string, AnimationAction>();
  private readonly dodges = new Map<string, AnimationAction>();
  private readonly turns = new Map<string, AnimationAction>();
  private lastFacing: number | undefined;
  private turnCooldown = 0;
  private readonly deaths = new Map<string, AnimationAction>();
  private deathAction: AnimationAction | undefined;
  private readonly guard: AnimationAction | undefined;
  private readonly taunt: AnimationAction | undefined;
  private readonly heal: AnimationAction | undefined;
  private readonly reload: AnimationAction | undefined;
  private reloadDuration = 1;
  private lastIntent: string | undefined;
  private active: AnimationAction | undefined;
  private activeKind: 'attack' | 'dodge' | 'guard' | 'taunt' | 'turn' | 'heal' | 'reload' | undefined;
  private attackKey = '';
  private remaining = 0;
  private motion: MotionAction | 'idle' = 'idle';
  private idleTime: number;
  private readonly baseScale: number;
  private lastHp: number;

  constructor(private readonly model: Object3D, clips: readonly AnimationClip[], phase = 0, initial?: CombatMotion, private readonly melee = false, private readonly weaponReloadTime = 0) {
    this.mixer = new AnimationMixer(model);
    this.baseScale = model.scale.y;
    this.idleTime = phase;
    this.lastHp = initial?.hp ?? Infinity;
    this.lastFacing = initial?.facing;
    const action = (name: string): AnimationAction | undefined => {
      const clip = AnimationClip.findByName([...clips], name);
      return clip ? this.mixer.clipAction(clip) : undefined;
    };
    const firearmClip = !melee ? AnimationClip.findByName([...clips], 'Standing_Reload') : undefined;
    this.hasFirearmPose = Boolean(firearmClip);
    const upperTrack = (name: string): boolean => /^mixamorig(?:Left|Right)(?:Shoulder|Arm|ForeArm|Hand)/.test(name);
    const locomotion = (name: string): AnimationAction | undefined => {
      const clip = AnimationClip.findByName([...clips], name);
      if (!clip) return undefined;
      if (!firearmClip) return this.mixer.clipAction(clip);
      const lower = clip.clone();
      lower.name = `${name}_armed`;
      lower.tracks = lower.tracks.filter(track => !upperTrack(track.name));
      return this.mixer.clipAction(lower);
    };
    this.actions.walk = locomotion('Walking');
    if (firearmClip) {
      const upper = firearmClip.clone();
      upper.name = 'armed_upper_pose';
      upper.tracks = upper.tracks.filter(track => upperTrack(track.name));
      this.upperBody = this.mixer.clipAction(upper);
    }
    // Une pose statique évite la pose en T dès l'affichage initial en pause.
    // La posture du clip de recharge offre une prise plus naturelle pour les fusils.
    const idleName = !melee ? 'Standing_Reload' : initial?.defId === 'modern_blade' ? 'Walking' : 'Boxing_Guard_Prep_Straight_Punch';
    const poseClip = AnimationClip.findByName([...clips], idleName) ?? AnimationClip.findByName([...clips], 'Walking');
    if (poseClip) {
      const idleClip = poseClip.clone();
      idleClip.name = 'idle_pose';
      this.idle = this.mixer.clipAction(idleClip);
      this.idle.play();
      this.idle.paused = true;
      this.idle.time = 0;
      this.mixer.update(0);
    }
    this.actions.run = locomotion('Running');
    const limp = Math.round(phase / 0.73) % 2 === 0 ? 'Limping_Walk_1' : 'Limping_Walk_2';
    this.actions.limp = action(limp) ?? action('Limping_Walk_1');
    if (melee) for (const clip of [...MELEE_CLIPS, ...SWORD_CLIPS]) {
      const found = action(clip.name);
      if (found) this.attacks.set(clip.name, found);
    }
    if (melee) for (const clip of DODGE_CLIPS) {
      const found = action(clip.name);
      if (found) this.dodges.set(clip.name, found);
    }
    for (const name of ['Alert_Quick_Turn_Right', 'Combat_Idle_Turn_Left', 'Run_Turn_Left', 'Run_Turn_Right', 'Walk_Turn_Left', 'Walk_Turn_Right']) {
      const found = action(name);
      if (found) this.turns.set(name, found);
    }
    for (const name of DEATH_CLIPS) {
      const found = action(name);
      if (found) this.deaths.set(name, found);
    }
    this.guard = melee ? (action('Hit_Reaction_to_Waist') ?? action('Block10')) : undefined;
    this.taunt = melee ? action('Chest_Pound_Taunt') : undefined;
    // Les gestes de ramassage servent de geste de soin visuel, sans objet ni effet supplémentaire.
    this.heal = melee ? action(Math.round(phase / 0.73) % 2 === 0 ? 'Male_Bend_Over_Pick_Up' : 'Collect_Object') : undefined;
    this.reload = !melee ? action('Standing_Reload') : undefined;
    this.hasMeleeClips = this.attacks.size > 0;
  }

  private playCombat(action: AnimationAction, kind: 'attack' | 'dodge' | 'guard' | 'taunt' | 'turn' | 'heal' | 'reload'): void {
    if (this.active && this.active !== action) this.active.fadeOut(0.1);
    if (this.motion !== 'idle') this.actions[this.motion]?.fadeOut(0.1);
    this.idle?.fadeOut(0.1);
    this.motion = 'idle';
    this.active = action;
    this.activeKind = kind;
    const speed = kind === 'guard' ? Math.max(1, action.getClip().duration / 0.8) : kind === 'taunt' ? Math.max(1, action.getClip().duration / 1.4) : kind === 'turn' ? Math.max(1, action.getClip().duration / 0.7) : kind === 'heal' ? Math.max(1, action.getClip().duration / 1.0) : 1;
    this.remaining = action.getClip().duration / speed;
    action.reset().setLoop(LoopOnce, 1).setEffectiveTimeScale(speed).fadeIn(0.1).play();
    action.clampWhenFinished = true;
    // La position du clip d'attaque sera imposée à chaque image par la simulation.
    action.paused = kind === 'attack' || kind === 'dodge' || kind === 'reload';
  }

  update(motion: SoldierMotion, dt: number, unit?: CombatMotion, renderTick = 0): void {
    const attack = unit?.alive ? unit.meleeAttack : null;
    const dodge = unit?.alive ? unit.meleeDodge : null;
    if (this.melee && unit && this.hasMeleeClips) {
      const sequence = attack ?? dodge;
      const kind = attack ? 'attack' : 'dodge';
      const action = sequence ? (attack ? this.attacks : this.dodges).get(sequence.clip) : undefined;
      const key = sequence ? `${kind}:${sequence.startTick}:${sequence.clip}` : '';
      if (action && sequence) {
        if (this.activeKind !== kind || this.attackKey !== key) {
          this.playCombat(action, kind);
          this.attackKey = key;
        }
        const progress = Math.max(0, Math.min(1, (renderTick - sequence.startTick) / (sequence.endTick - sequence.startTick)));
        action.time = action.getClip().duration * progress;
      } else {
        if (this.activeKind === 'attack' || this.activeKind === 'dodge' || !unit.alive) {
          this.active?.fadeOut(0.1);
          this.active = undefined;
          this.activeKind = undefined;
          this.attackKey = '';
          if (unit.alive && this.motion === 'idle') { this.idle?.reset().fadeIn(0.1).play(); if (this.idle) this.idle.paused = true; }
        }
        if (dt > 0 && unit.alive && unit.hp < this.lastHp && !this.active && this.guard) {
          // Réaction cosmétique : les dégâts ont déjà été décidés par la simulation.
          this.playCombat(this.guard, 'guard');
        } else if (dt > 0 && unit.alive && unit.intent === 'ralliement' && this.lastIntent !== 'ralliement' && !this.active && this.taunt) {
          this.playCombat(this.taunt, 'taunt');
        } else if (dt > 0 && unit.alive && unit.intent === 'soins' && this.lastIntent !== 'soins' && (!this.active || this.activeKind === 'turn') && this.heal) {
          this.playCombat(this.heal, 'heal');
        }
      }
      if (dt > 0) { this.lastHp = unit.hp; this.lastIntent = unit.intent; }
    }
    if (!this.melee && unit) {
      if (unit.alive && unit.reloading && (unit.cooldown ?? 0) > 0 && this.reload) {
        if (this.activeKind !== 'reload') {
          this.reloadDuration = Math.max(0.1, this.weaponReloadTime || unit.cooldown || 1);
          this.playCombat(this.reload, 'reload');
        }
        const progress = 1 - Math.max(0, Math.min(1, (unit.cooldown ?? 0) / this.reloadDuration));
        this.reload.time = this.reload.getClip().duration * progress;
      } else if (this.activeKind === 'reload') {
        this.active?.fadeOut(0.1);
        this.active = undefined;
        this.activeKind = undefined;
        if (unit.alive && this.motion === 'idle') { this.idle?.reset().fadeIn(0.1).play(); if (this.idle) this.idle.paused = true; }
      }
    }
    let effective: MotionAction | 'idle' = motion;
    if (unit && this.melee && unit.alive && unit.hp < unit.maxHp * 0.45 && motion !== 'idle' && this.actions.limp) effective = 'limp';
    if (effective === 'run' && !this.actions.run) effective = 'walk';
    // Les pivots ne sont que visuels : l'orientation tactique reste celle de l'IA.
    if (dt > 0 && unit?.alive && unit.facing !== undefined) {
      this.turnCooldown = Math.max(0, this.turnCooldown - dt);
      if (this.melee && this.lastFacing !== undefined && !this.active && !attack && !dodge && this.turnCooldown <= 0) {
        const angle = Math.atan2(Math.sin(unit.facing - this.lastFacing), Math.cos(unit.facing - this.lastFacing));
        if (Math.abs(angle) >= 0.7) {
          const side = angle > 0 ? 'Right' : 'Left';
          const name = effective === 'idle' ? (side === 'Right' ? 'Alert_Quick_Turn_Right' : 'Combat_Idle_Turn_Left') :
            `${effective === 'run' ? 'Run' : 'Walk'}_Turn_${side}`;
          const turn = this.turns.get(name);
          if (turn) { this.playCombat(turn, 'turn'); this.turnCooldown = 1.2; }
        }
      }
      this.lastFacing = unit.facing;
    }
    if (this.active || (unit && !unit.alive)) effective = 'idle';
    if (dt > 0 && effective !== this.motion) {
      if (this.motion !== 'idle') this.actions[this.motion]?.fadeOut(0.18);
      else this.idle?.fadeOut(0.18);
      if (effective !== 'idle') this.actions[effective]?.reset().fadeIn(0.18).play();
      else if (!this.active && unit?.alive !== false) this.idle?.reset().fadeIn(0.18).play();
      if (effective === 'idle' && this.idle) this.idle.paused = true;
      this.motion = effective;
    }
    if (dt > 0 && this.upperBody) {
      const showUpper = effective !== 'idle' && !this.active && unit?.alive !== false;
      if (showUpper !== this.upperVisible) {
        if (showUpper) { this.upperBody.reset().fadeIn(0.18).play(); this.upperBody.paused = true; }
        else this.upperBody.fadeOut(0.18);
        this.upperVisible = showUpper;
      }
    }
    this.mixer.update(Math.max(0, dt));
    if (this.activeKind === 'guard' || this.activeKind === 'taunt' || this.activeKind === 'turn' || this.activeKind === 'heal') {
      this.remaining -= dt;
      if (this.remaining <= 0) {
        this.active?.fadeOut(0.15);
        this.active = undefined;
        this.activeKind = undefined;
        if (unit?.alive !== false && this.motion === 'idle') { this.idle?.reset().fadeIn(0.15).play(); if (this.idle) this.idle.paused = true; }
      }
    }
    this.idleTime += Math.max(0, dt);
    this.model.scale.y = this.baseScale * (effective === 'idle' && !this.active ? 1 + Math.sin(this.idleTime * 2) * 0.006 : 1);
  }

  /** Joue brièvement une chute Meshy avant de transférer la pose au ragdoll. */
  beginDeath(id: number): boolean {
    const names = DEATH_CLIPS.filter(name => this.deaths.has(name));
    const action = names.length ? this.deaths.get(names[(id - 1) % names.length]!) : undefined;
    if (!action) return false;
    if (this.active && this.active !== action) this.active.fadeOut(0.12);
    if (this.motion !== 'idle') this.actions[this.motion]?.fadeOut(0.12);
    this.idle?.fadeOut(0.12);
    this.upperBody?.fadeOut(0.12);
    this.upperVisible = false;
    this.active = undefined; this.activeKind = undefined; this.motion = 'idle';
    this.deathAction = action;
    action.reset().setLoop(LoopOnce, 1).setEffectiveTimeScale(1).fadeIn(0.12).play();
    action.clampWhenFinished = true;
    return true;
  }

  updateDeath(dt: number): void {
    if (this.deathAction) this.mixer.update(Math.max(0, dt));
  }

  dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.model);
  }
}
