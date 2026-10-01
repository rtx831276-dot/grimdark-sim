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
import { Camera } from './render/camera';
import { Effects } from './render/effects';
import { renderBattle, type RenderFlags } from './render/renderer';
import { Hud } from './ui/hud';
import type { MapDefinition } from './data/map-types';

export interface BattleAppOptions {
  canvas: HTMLCanvasElement;
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
  private readonly hud: Hud;
  private readonly controls: Controls;
  private readonly effects = new Effects();
  private readonly selection = new Set<number>();

  private state: SimState;
  private flags: RenderFlags = { cover: false, los: false, paths: true };
  private mode: ControlMode = 'none';
  private speed = 1;
  private paused = false;
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
    this.camera = new Camera(options.canvas.clientWidth || 1280, options.canvas.clientHeight || 720);
    this.state = this.createState(options.seed);

    this.hud = new Hud(options.hudRoot, {
      onTogglePause: () => this.togglePause(),
      onSpeedChange: (speed) => this.setSpeed(speed),
      onStanceOrder: (stance) => this.issueOrderForSelection({ type: stance, units: this.selectionIds() }),
      onRallyOrder: () => this.issueOrderForSelection({ type: 'rally', units: this.selectionIds() }),
      onModeChange: (mode) => this.setMode(mode),
      onToggleFlag: (flag) => this.toggleFlag(flag),
      onNewBattle: () => this.newBattle(),
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
      onSpeedChange: (speed) => this.setSpeed(speed),
      onToggleFlag: (flag) => this.toggleFlag(flag),
      onHover: (tile, world) => this.updateHover(tile, world),
    });
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
    this.controls.detach();
  }

  newBattle(): void {
    this.selection.clear();
    this.effects.clear();
    this.state = this.createState(Math.floor(Math.random() * 1_000_000));
    this.hud.clearLog();
    this.hud.logEvent({ tick: 0, type: 'objectiveCaptured', label: `Nouvelle bataille — graine ${this.state.rng.snapshot()}` });
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

    if (!this.paused && !this.state.over) {
      this.accumulator += realDelta * this.speed;
      let steps = 0;
      while (this.accumulator >= SIM_DT && steps < 60) {
        const events = stepSimulation(this.state);
        this.effects.spawnFromEvents(this.state, events);
        for (const event of events) this.hud.logEvent(event);
        this.accumulator -= SIM_DT;
        steps++;
      }
    }

    const alpha = this.paused || this.state.over ? 1 : clamp(this.accumulator / SIM_DT, 0, 1);
    this.effects.update(realDelta);
    this.camera.clampToMap(this.state.map.width, this.state.map.height);

    renderBattle({
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
    });

    this.hudTimer += realDelta;
    if (this.hudTimer > 0.2) {
      this.hudTimer = 0;
      this.hud.update(this.state, this.selectedUnits(), { speed: this.speed, paused: this.paused, mode: this.mode, flags: this.flags });
    }

    requestAnimationFrame(this.frame);
  };

  /* ---------------------------------------------------------------- *
   * Interactions
   * ---------------------------------------------------------------- */

  private updateHover(tile: { x: number; y: number } | null, world: { x: number; y: number }): void {
    this.hoveredTile = tile;
    const unit = unitAt(this.state, world.x, world.y);
    this.hoveredUnitId = unit ? unit.id : null;
  }

  private selectAt(world: { x: number; y: number }, additive: boolean): void {
    const unit = unitAt(this.state, world.x, world.y);
    if (!unit) {
      if (!additive) this.selection.clear();
      return;
    }
    if (additive) {
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
    const inside = this.state.units.filter(
      (unit) => unit.alive && unit.x >= box.minX && unit.x <= box.maxX && unit.y >= box.minY && unit.y <= box.maxY,
    );
    if (inside.length === 0) {
      if (!additive) this.selection.clear();
      return;
    }

    let faction = this.selectedUnits()[0]?.faction ?? null;
    if (!faction) {
      const centerX = (box.minX + box.maxX) / 2;
      const centerY = (box.minY + box.maxY) / 2;
      faction = inside.reduce((best, unit) =>
        Math.hypot(unit.x - centerX, unit.y - centerY) < Math.hypot(best.x - centerX, best.y - centerY) ? unit : best,
      ).faction;
    }

    if (!additive) this.selection.clear();
    for (const unit of inside) {
      if (unit.faction === faction) this.selection.add(unit.id);
    }
  }

  private orderAt(world: { x: number; y: number }): void {
    const ids = this.selectionIds();
    if (ids.length === 0) return;
    const target = unitAt(this.state, world.x, world.y);
    if (target && !this.selection.has(target.id)) {
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

  private togglePause(): void {
    if (this.state.over) {
      this.newBattle();
      return;
    }
    this.paused = !this.paused;
  }

  private setSpeed(speed: number): void {
    this.speed = speed;
  }

  private setMode(mode: ControlMode): void {
    this.mode = mode;
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
