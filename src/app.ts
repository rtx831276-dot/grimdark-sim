import { clamp } from './core/math';
import { TERRAIN } from './data/terrain';
import { FACTION_IDS } from './data/factions';
import {
  createSimulation,
  unitAt,
  isSolid,
  issueOrder,
  nearestWalkable,
  SIM_DT,
  stepSimulation,
  summarize,
  type Order,
  type SimState,
  type Unit,
} from './sim';
import { Controls, type ControlMode, type SelectionBox } from './input/controls';
import { FpsControls } from './input/fps-controls';
import { unitDef } from './data/units';
import { weapon } from './data/weapons';
import { targetInSight } from './sim/direct-control';
import { Camera } from './render/camera';
import { Effects } from './render/effects';
import { FpsFeedback } from './render/fps-feedback';
import { renderBattle, renderThreeOverlay, type RenderFlags } from './render/renderer';
import { ThreeBattle } from './render/three-battle';
import { pickSoldier3d } from './render/picking';
import { Hud } from './ui/hud';
import type { MapDefinition } from './data/map-types';

export interface BattleAppOptions {
  canvas: HTMLCanvasElement;
  canvas3d?: HTMLCanvasElement;
  hudRoot: HTMLElement;
  seed?: number;
  map?: MapDefinition;
}

/**
 * Chef d'orchestre du prototype : il fait tourner la simulation à pas fixe, traduit les
 * intentions du joueur en ordres, alimente les effets visuels et le HUD, puis dessine.
 *
 * C'est le SEUL endroit où simulation et rendu se rencontrent. Si l'on remplaçait le
 * rendu Canvas par autre chose (WebGL, PixiJS, un moteur externe), ce fichier serait la
 * seule vraie zone de travail.
 */
export class BattleApp {
  readonly camera: Camera;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly three: ThreeBattle | null;
  private view3d = false;
  private savedRotation = 0;
  private readonly hud: Hud;
  private readonly controls: Controls;
  private readonly fpsControls: FpsControls;
  private fpsUnitId: number | null = null;
  private fpsPreviousSpeed = 1;
  private readonly fpsOverlay: HTMLElement | null;
  private readonly fpsFeedback = new FpsFeedback();
  private readonly effects = new Effects();
  private readonly selection = new Set<number>();

  private state: SimState;
  private flags: RenderFlags = { cover: false, los: false, paths: true, hitboxes: false };
  private mode: ControlMode = 'none';
  private speed = 1;
  private paused = true;
  private accumulator = 0;
  private lastFrameTime = 0;
  private hudTimer = 0;
  private running = false;
  private hoveredUnitId: number | null = null;
  private hoveredTile: { x: number; y: number } | null = null;
  private readonly options: BattleAppOptions;

  constructor(options: BattleAppOptions) {
    this.options = options;
    this.ctx = options.canvas.getContext('2d')!;
    let three: ThreeBattle | null = null;
    if (options.canvas3d) {
      try {
        three = new ThreeBattle(options.canvas3d);
        this.view3d = true;
      } catch (error) {
        console.warn('WebGL indisponible, retour au rendu 2D.', error);
        options.canvas3d.style.display = 'none';
      }
    }
    this.three = three;
    this.camera = new Camera(options.canvas.clientWidth || 1280, options.canvas.clientHeight || 720);
    this.state = this.createState(options.seed);

    this.hud = new Hud(options.hudRoot, {
      onTogglePause: () => this.togglePause(),
      onSpeedChange: (speed) => this.setSpeed(speed),
      onStanceOrder: (stance) => this.issueOrderForSelection({ type: stance, units: this.selectionIds() }),
      onRallyOrder: () => this.issueOrderForSelection({ type: 'rally', units: this.selectionIds() }),
      onModeChange: (mode) => this.armMode(mode),
      onToggleFlag: (flag) => this.toggleFlag(flag),
      onNewBattle: () => this.newBattle(),
      onToggleView: () => this.toggleView(),
      onRotateView: (direction) => this.rotateView(direction),
      onToggleFps: () => this.toggleFps(),
    });

    this.controls = new Controls(options.canvas, this.camera, {
      onSelectClick: (world, additive) => this.selectAt(world, additive),
      onSelectBox: (box, additive) => this.selectBox(box, additive),
      onOrderClick: (world) => this.orderAt(world),
      onTargetOrder: (mode, target) => this.targetAt(mode, target),
      onModeChange: (mode) => this.setMode(mode),
      onStanceOrder: (stance) => this.issueOrderForSelection({ type: stance, units: this.selectionIds() }),
      onRallyOrder: () => this.issueOrderForSelection({ type: 'rally', units: this.selectionIds() }),
      onTogglePause: () => this.togglePause(),
      onRotateView: (direction) => this.rotateView(direction),
      onSpeedChange: (speed) => this.setSpeed(speed),
      onToggleFlag: (flag) => this.toggleFlag(flag),
      onHover: (tile, world) => this.updateHover(tile, world),
    });
    this.fpsOverlay = document.getElementById('fps-overlay');
    this.fpsControls = new FpsControls(options.canvas, locked => {
      if (this.fpsUnitId === null) return;
      this.paused = !locked;
      this.accumulator = 0;
      this.updateFpsOverlay();
    }, () => this.togglePause());
  }

  private createState(seed?: number): SimState {
    return createSimulation({ seed, map: this.options.map });
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.hud.clearLog();
    this.hud.logEvent({ tick: 0, type: 'objectiveCaptured', label: `${this.state.map.def.name} — ${this.state.map.def.briefing}` });
    this.lastFrameTime = performance.now();
    requestAnimationFrame(this.frame);
  }

  destroy(): void {
    this.running = false;
    this.fpsControls.dispose();
    this.controls.detach();
    this.three?.dispose();
  }

  newBattle(): void {
    if (this.fpsUnitId !== null) this.exitFps();
    this.selection.clear();
    this.effects.clear();
    this.paused = true;
    this.accumulator = 0;
    this.controls.setMode('none');
    // Graine tirée côté interface (le tirage peut être aléatoire, la bataille non) : elle est
    // ensuite lue dans l'état, jamais devinée — ressemer ce nombre rejoue cette bataille.
    this.state = this.createState(Math.floor(Math.random() * 1_000_000));
    this.hud.clearLog();
    this.hud.logEvent({ tick: 0, type: 'objectiveCaptured', label: `Nouvelle bataille — graine ${this.state.seed}` });
    this.camera.centerOn(this.state.map.width / 2, this.state.map.height / 2);
  }

  /* ---------------------------------------------------------------- *
   * Boucle
   * ---------------------------------------------------------------- */

  private frame = (now: number): void => {
    if (!this.running) return;
    const realDelta = clamp((now - this.lastFrameTime) / 1000, 0, 0.25);
    this.lastFrameTime = now;

    this.controls.update(realDelta);
    if (this.fpsUnitId !== null && !this.paused && !this.state.over) this.fpsFeedback.advance(realDelta * this.speed);

    if (!this.paused && !this.state.over) {
      this.accumulator += realDelta * this.speed;
      let steps = 0;
      while (this.accumulator >= SIM_DT && steps < 60) {
        const direct = this.fpsUnitId === null ? undefined : this.fpsControls.command(this.fpsUnitId);
        const hpBefore = direct ? this.state.units.find(unit => unit.id === direct.unitId)?.hp : undefined;
        const events = stepSimulation(this.state, SIM_DT, direct);
        if (direct && hpBefore !== undefined) {
          const hpAfter = this.state.units.find(unit => unit.id === direct.unitId)?.hp ?? hpBefore;
          this.fpsFeedback.ingest(events, direct.unitId, hpBefore, hpAfter);
        }
        this.effects.spawnFromEvents(this.state, events);
        for (const event of events) this.hud.logEvent(event);
        this.accumulator -= SIM_DT;
        steps++;
        if (this.fpsUnitId !== null && !this.state.units.some(unit => unit.id === this.fpsUnitId && unit.alive)) {
          this.exitFps();
          this.hud.logEvent({ tick: this.state.tick, type: 'orderRefused', label: 'Soldat contrôlé hors combat. Sélectionnez un autre soldat.' });
          break;
        }
      }
    }

    const alpha = this.paused || this.state.over ? 1 : clamp(this.accumulator / SIM_DT, 0, 1);
    this.effects.update(realDelta);
    this.camera.clampToMap(this.state.map.width, this.state.map.height);

    const renderOptions = {
      ctx: this.ctx,
      camera: this.camera,
      state: this.state,
      selection: this.selection,
      hoveredUnitId: this.hoveredUnitId,
      hoveredTile: this.hoveredTile,
      effects: this.effects,
      flags: this.flags,
      mode: this.mode,
      alpha,
      time: now / 1000,
      selectionRect: this.controls.selectionRect,
      ghostTarget: this.ghostTarget(),
    };
    if (this.view3d && this.three) {
      const fps = this.fpsUnitId === null ? undefined : { unitId: this.fpsUnitId, yaw: this.fpsControls.yaw, pitch: this.fpsControls.pitch, aiming: this.fpsControls.aiming };
      this.three.render(this.state, this.camera, alpha, this.flags.cover, this.paused ? 0 : realDelta * this.speed, this.state.tick + this.accumulator / SIM_DT, fps);
      if (fps) {
        this.ctx.clearRect(0, 0, this.camera.viewWidth, this.camera.viewHeight);
        this.updateFpsOverlay();
      } else renderThreeOverlay(renderOptions);
    } else {
      renderBattle(renderOptions);
    }

    this.hudTimer += realDelta;
    if (this.hudTimer > 0.2) {
      this.hudTimer = 0;
      this.hud.update(this.state, this.selectedUnits(), { speed: this.speed, paused: this.paused, mode: this.mode, flags: this.flags, view3d: this.view3d, threeAvailable: Boolean(this.three), fps: this.fpsUnitId !== null });
    }

    requestAnimationFrame(this.frame);
  };

  /* ---------------------------------------------------------------- *
   * Interactions
   * ---------------------------------------------------------------- */

  private updateHover(tile: { x: number; y: number } | null, world: { x: number; y: number }): void {
    this.hoveredTile = tile;
    const unit = this.unitUnderPointer(world);
    this.hoveredUnitId = unit ? unit.id : null;
  }

  private unitUnderPointer(world: { x: number; y: number }): Unit | null {
    if (this.view3d) {
      const point = this.camera.worldToScreen(world.x, world.y);
      const soldier = pickSoldier3d(this.state.units, this.camera, point.x, point.y);
      if (soldier) return soldier;
    }
    return unitAt(this.state, world.x, world.y);
  }

  private selectAt(world: { x: number; y: number }, additive: boolean): void {
    const unit = this.unitUnderPointer(world);
    if (!unit) {
      if (!additive) this.selection.clear();
      return;
    }
    if (additive) {
      // Une sélection ne peut pas mélanger les deux camps.
      if (this.selectedUnits()[0] && this.selectedUnits()[0]!.faction !== unit.faction) return;
      if (this.selection.has(unit.id)) this.selection.delete(unit.id);
      else this.selection.add(unit.id);
    } else {
      this.selection.clear();
      this.selection.add(unit.id);
    }
  }

  /**
   * Sélection rectangulaire. On ne sélectionne qu'UNE faction à la fois (celle de l'unité
   * déjà sélectionnée, sinon celle de l'unité la plus proche du centre du cadre) : sinon
   * un ordre donné à un groupe mixte n'aurait aucun sens.
   */
  private selectBox(box: SelectionBox, additive: boolean): void {
    const inside = this.state.units.filter((unit) => {
      const point = this.camera.worldToScreen(unit.x, unit.y);
      return unit.alive && point.x >= box.minX && point.x <= box.maxX && point.y >= box.minY && point.y <= box.maxY;
    });
    if (inside.length === 0) {
      if (!additive) this.selection.clear();
      return;
    }

    let faction = additive ? this.selectedUnits()[0]?.faction ?? null : null;
    if (!faction) {
      const centerX = (box.minX + box.maxX) / 2;
      const centerY = (box.minY + box.maxY) / 2;
      faction = inside.reduce((best, unit) => {
        const p = this.camera.worldToScreen(unit.x, unit.y);
        const b = this.camera.worldToScreen(best.x, best.y);
        return Math.hypot(p.x - centerX, p.y - centerY) < Math.hypot(b.x - centerX, b.y - centerY) ? unit : best;
      }).faction;
    }

    if (!additive) this.selection.clear();
    for (const unit of inside) {
      if (unit.faction === faction) this.selection.add(unit.id);
    }
  }

  private orderAt(world: { x: number; y: number }): void {
    const ids = this.selectionIds();
    if (ids.length === 0) return;
    const target = this.unitUnderPointer(world);
    if (target && target.faction !== this.selectedUnits()[0]?.faction) {
      this.issueOrderForSelection({ type: 'attack', units: ids, target: target.id });
      return;
    }
    const destination = isSolid(this.state.map, world.x, world.y)
      ? nearestWalkable(this.state.map, Math.floor(world.x), Math.floor(world.y), 6)
      : { x: world.x, y: world.y };
    if (!destination) return;
    this.issueOrderForSelection({ type: 'move', units: ids, x: destination.x, y: destination.y });
  }

  private targetAt(mode: Exclude<ControlMode, 'none'>, target: { x: number; y: number }): void {
    const ids = this.selectionIds();
    if (mode === 'grenade') {
      if (ids.length === 0) {
        this.hud.logEvent({ tick: this.state.tick, type: 'orderRefused', label: 'sélectionnez un grenadier' });
        return;
      }
      this.issueOrderForSelection({ type: 'grenade', units: ids, x: target.x, y: target.y });
      return;
    }
    const faction = this.selectedUnits()[0]?.faction ?? FACTION_IDS[0] ?? 'penitents';
    this.issueOrderForSelection({ type: 'artillery', faction, x: target.x, y: target.y });
  }

  private issueOrderForSelection(order: Order): void {
    const accepted = issueOrder(this.state, order);
    if (!accepted) {
      this.hud.logEvent({ tick: this.state.tick, type: 'orderRefused', label: `${order.type} impossible` });
    }
    this.refreshSelection();
  }

  private selectionIds(): number[] {
    return [...this.selection];
  }

  private selectedUnits(): Unit[] {
    return this.state.units.filter((unit) => unit.alive && this.selection.has(unit.id));
  }

  /** Retire de la sélection les unités mortes ou sorties du champ. */
  private refreshSelection(): void {
    const alive = new Set(this.state.units.filter((unit) => unit.alive).map((unit) => unit.id));
    for (const id of [...this.selection]) {
      if (!alive.has(id)) this.selection.delete(id);
    }
  }

  private ghostTarget(): { x: number; y: number; radius: number; label: string; color: string; fill: string } | null {
    if (this.mode === 'none' || !this.hoveredTile) return null;
    const isGrenade = this.mode === 'grenade';
    const radius = isGrenade ? 2.6 : 3.4;
    const color = isGrenade ? '#c9a227' : '#e0703c';
    return {
      x: this.hoveredTile.x + 0.5,
      y: this.hoveredTile.y + 0.5,
      radius,
      label: isGrenade ? 'grenade' : 'barrage',
      color,
      fill: isGrenade ? 'rgba(201, 162, 39, 0.16)' : 'rgba(224, 112, 60, 0.14)',
    };
  }

  /* ---------------------------------------------------------------- *
   * Commandes d'affichage
   * ---------------------------------------------------------------- */

  private toggleFps(): void {
    if (this.fpsUnitId !== null) { this.exitFps(); return; }
    if (!this.three || !this.options.canvas3d || this.state.over) return;
    const player = this.selectedUnits().find(unit => unit.faction !== 'creature') ?? this.state.units.find(unit => unit.alive && unit.faction === FACTION_IDS[0] && unit.defId === 'modern_rifleman') ?? this.state.units.find(unit => unit.alive && unit.faction !== 'creature');
    if (!player) return;
    if (!this.view3d) this.toggleView();
    this.selection.clear(); this.selection.add(player.id);
    // Annule les ordres et esquives IA en cours pour éviter qu'ils contredisent le joueur.
    player.goal = null; player.forcedTargetId = null; player.path = []; player.pathGoal = null; player.pathIndex = 0;
    player.meleeDodge = null; player.meleeAttack = null; player.stance = 'hold';
    this.controls.setMode('none'); this.controls.setEnabled(false);
    this.fpsUnitId = player.id;
    this.fpsFeedback.reset();
    this.fpsPreviousSpeed = this.speed; this.speed = 1; this.paused = true; this.accumulator = 0;
    this.fpsOverlay?.classList.remove('hidden');
    this.fpsControls.activate(player.facing, weapon(unitDef(player.defId).weapon).kind !== 'melee');
    this.updateFpsOverlay();
  }

  private exitFps(): void {
    if (this.fpsUnitId === null) return;
    this.fpsUnitId = null;
    this.fpsFeedback.reset();
    this.fpsControls.deactivate();
    this.controls.setEnabled(true);
    this.fpsOverlay?.classList.add('hidden');
    this.speed = this.fpsPreviousSpeed;
    this.paused = true; this.accumulator = 0;
    this.refreshSelection();
  }

  private updateFpsOverlay(): void {
    if (this.fpsUnitId === null || !this.fpsOverlay) return;
    const unit = this.state.units.find(u => u.id === this.fpsUnitId);
    if (!unit) return;
    const gun = weapon(unitDef(unit.defId).weapon);
    const setText = (selector: string, text: string): void => {
      const node = this.fpsOverlay?.querySelector<HTMLElement>(selector);
      if (node && node.textContent !== text) node.textContent = text;
    };
    const health = clamp(unit.hp / unit.maxHp, 0, 1);
    const reloading = unit.reloading && unit.cooldown > 0 && gun.reloadTime > 0;
    setText('.fps-name', `${unitDef(unit.defId).label} · ${gun.label}${this.paused ? ' · PAUSE' : ''}`);
    setText('.fps-health-label', `VIE  ${Math.max(0, Math.ceil(unit.hp))} / ${unit.maxHp}`);
    setText('.fps-ammo', reloading ? 'RECHARGEMENT…' : gun.reloadEvery ? `MUNITIONS  ${unit.salvosLeft * gun.burst} / ${gun.reloadEvery * gun.burst} · réserve ∞` : 'CORPS À CORPS');
    const healthFill = this.fpsOverlay.querySelector<HTMLElement>('.fps-health-fill');
    if (healthFill) { healthFill.style.width = `${health * 100}%`; healthFill.classList.toggle('critical', health <= 0.35); }
    const reloadBar = this.fpsOverlay.querySelector<HTMLElement>('.fps-reload-bar');
    reloadBar?.classList.toggle('hidden', !reloading);
    const reloadFill = this.fpsOverlay.querySelector<HTMLElement>('.fps-reload-fill');
    if (reloadFill) reloadFill.style.width = `${reloading ? clamp(1 - unit.cooldown / gun.reloadTime, 0, 1) * 100 : 0}%`;
    const hitmarker = this.fpsOverlay.querySelector<HTMLElement>('.fps-hitmarker');
    hitmarker?.classList.toggle('active', this.fpsFeedback.showHit);
    hitmarker?.classList.toggle('kill', this.fpsFeedback.isKill);
    this.fpsOverlay.querySelector<HTMLElement>('.fps-hurt')?.classList.toggle('active', this.fpsFeedback.showHurt);
    const instructions = this.fpsOverlay.querySelector<HTMLElement>('.fps-instructions');
    if (instructions) instructions.textContent = this.fpsControls.locked ? 'ZQSD / WASD : se déplacer · souris : viser · clic gauche : tirer / frapper · clic droit maintenu : zoom (armes à feu) · R : recharger · Échap : libérer la souris' : 'Souris libérée — cliquez sur le champ de bataille pour reprendre. Pour sortir, utilisez « Quitter FPS ».';
    const reticle = this.fpsOverlay.querySelector<HTMLElement>('.fps-reticle');
    if (reticle) {
      const target = targetInSight(this.state, unit, this.fpsControls.yaw, this.fpsControls.pitch, gun.range);
      reticle.classList.toggle('enemy', !!target && target.faction !== unit.faction);
      reticle.classList.toggle('friendly', !!target && target.faction === unit.faction);
    }
  }

  private toggleView(): void {
    if (this.fpsUnitId !== null) { this.exitFps(); return; }
    if (!this.three || !this.options.canvas3d) return;
    this.view3d = !this.view3d;
    if (this.view3d) this.camera.rotation = this.savedRotation;
    else {
      this.savedRotation = this.camera.rotation;
      this.camera.rotation = 0;
    }
    this.options.canvas3d.style.display = this.view3d ? '' : 'none';
  }

  private rotateView(direction: number): void {
    if (!this.view3d || !Number.isFinite(direction)) return;
    this.camera.rotateBy(Math.sign(direction) * Math.PI / 4);
  }

  private togglePause(): void {
    if (this.fpsUnitId !== null && !this.fpsControls.locked) return;
    if (this.state.over) {
      this.newBattle();
      return;
    }
    this.paused = !this.paused;
  }

  private setSpeed(speed: number): void {
    if (this.fpsUnitId === null) this.speed = speed;
  }

  /** Miroir du mode réel : la source de vérité est `Controls.mode`, jamais l'inverse. */
  private setMode(mode: ControlMode): void {
    if (mode !== 'none' && !this.state.units.some((unit) => unit.alive && unit.abilities[mode])) {
      this.controls.setMode('none');
      return;
    }
    this.mode = mode;
  }

  /**
   * Arme un mode de ciblage depuis le HUD, en repassant par les contrôles. Sans cela, le
   * bouton allumait le viseur alors que `Controls` gardait son propre mode à « none » :
   * le clic suivant sélectionnait au lieu de viser. Cliquer le mode déjà armé le désarme,
   * comme la touche qui lui correspond.
   */
  private armMode(mode: ControlMode): void {
    this.controls.setMode(this.controls.mode === mode ? 'none' : mode);
  }

  private toggleFlag(flag: keyof RenderFlags): void {
    this.flags[flag] = !this.flags[flag];
  }

  /** Résumé texte de l'état courant (utilisé par les tests et les outils de debug). */
  describe(): string {
    return summarize(this.state);
  }

  /** Accès en lecture à l'état : utile pour les tests d'intégration du prototype. */
  get simulation(): SimState {
    return this.state;
  }

  /** Terrain sous le curseur, pour l'infobulle du HUD. */
  terrainUnderCursor(): string {
    if (!this.hoveredTile) return '';
    const tile = this.state.map.tiles[this.hoveredTile.y * this.state.map.width + this.hoveredTile.x];
    return tile ? TERRAIN[tile.terrain].label : '';
  }
}
