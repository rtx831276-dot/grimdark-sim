import type { Vec2 } from '../core/ids';
import type { Camera } from '../render/camera';

export type ControlMode = 'none' | 'grenade' | 'artillery';

export interface SelectionBox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface ControlsCallbacks {
  /** Clic gauche sur le terrain : sélection (ou désélection si vide). */
  onSelectClick(world: Vec2, additive: boolean): void;
  /** Rectangle de sélection (clic gauche glissé). */
  onSelectBox(box: SelectionBox, additive: boolean): void;
  /** Clic droit : déplacement, ou attaque si une cible est sous le curseur. */
  onOrderClick(world: Vec2): void;
  /** Clic gauche pendant un mode capacité (grenade, barrage). */
  onTargetOrder(mode: Exclude<ControlMode, 'none'>, target: Vec2): void;
  onModeChange(mode: ControlMode): void;
  onStanceOrder(stance: 'advance' | 'hold' | 'fallback'): void;
  onRallyOrder(): void;
  onTogglePause(): void;
  onSpeedChange(speed: number): void;
  onToggleFlag(flag: 'cover' | 'los' | 'paths'): void;
  onHover(tile: Vec2 | null, world: Vec2): void;
}

/**
 * Contrôles souris/clavier.
 *
 * Cette couche ne connaît NI la simulation NI le jeu : elle traduit des gestes
 * (« un clic gauche ici », « la touche G ») en intentions, que l'application convertit
 * elle-même en ordres. C'est ce qui permet de tester et de rejouer la bataille sans
 * aucune interface.
 */
export class Controls {
  mode: ControlMode = 'none';
  selectionRect: { x: number; y: number; w: number; h: number } | null = null;
  pointerWorld: Vec2 = { x: 0, y: 0 };
  hoveredTile: Vec2 | null = null;

  private dragging = false;
  private panning = false;
  private dragStart = { x: 0, y: 0 };
  private pointerScreen = { x: 0, y: 0 };
  private panLast = { x: 0, y: 0 };
  private readonly keys = new Set<string>();

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly camera: Camera,
    private readonly callbacks: ControlsCallbacks,
  ) {
    this.attach();
  }

  private attach(): void {
    this.canvas.addEventListener('contextmenu', this.preventContextMenu);
    this.canvas.addEventListener('mousedown', this.handleMouseDown);
    window.addEventListener('mousemove', this.handleMouseMove);
    window.addEventListener('mouseup', this.handleMouseUp);
    this.canvas.addEventListener('wheel', this.handleWheel, { passive: false });
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);
  }

  detach(): void {
    this.canvas.removeEventListener('contextmenu', this.preventContextMenu);
    this.canvas.removeEventListener('mousedown', this.handleMouseDown);
    window.removeEventListener('mousemove', this.handleMouseMove);
    window.removeEventListener('mouseup', this.handleMouseUp);
    this.canvas.removeEventListener('wheel', this.handleWheel);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleBlur);
  }

  /** Déplacement clavier de la caméra, appelé à chaque frame. */
  update(dt: number): void {
    const step = 700 * dt;
    let dx = 0;
    let dy = 0;
    if (this.keys.has('keyw') || this.keys.has('arrowup')) dy += step;
    if (this.keys.has('keys') || this.keys.has('arrowdown')) dy -= step;
    if (this.keys.has('keya') || this.keys.has('arrowleft')) dx += step;
    if (this.keys.has('keyd') || this.keys.has('arrowright')) dx -= step;
    if (dx !== 0 || dy !== 0) this.camera.panByScreen(dx, dy);
  }

  setMode(mode: ControlMode): void {
    this.mode = mode;
    this.callbacks.onModeChange(mode);
  }

  private preventContextMenu = (event: Event): void => {
    event.preventDefault();
  };

  private refreshPointer(event: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    this.pointerScreen = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    this.pointerWorld = this.camera.screenToWorld(this.pointerScreen.x, this.pointerScreen.y);
    this.hoveredTile = { x: Math.floor(this.pointerWorld.x), y: Math.floor(this.pointerWorld.y) };
    this.callbacks.onHover(this.hoveredTile, this.pointerWorld);
  }

  private handleMouseDown = (event: MouseEvent): void => {
    this.refreshPointer(event);
    // Clic central : déplacement de la caméra (le clic droit est réservé aux ordres).
    if (event.button === 1) {
      this.panning = true;
      this.panLast = { x: event.clientX, y: event.clientY };
      event.preventDefault();
      return;
    }
    if (event.button !== 0) return;
    this.dragging = true;
    this.dragStart = { x: this.pointerScreen.x, y: this.pointerScreen.y };
    this.selectionRect = null;
  };

  private handleMouseMove = (event: MouseEvent): void => {
    if (this.panning) {
      this.camera.panByScreen(event.clientX - this.panLast.x, event.clientY - this.panLast.y);
      this.panLast = { x: event.clientX, y: event.clientY };
      return;
    }
    this.refreshPointer(event);
    if (!this.dragging) return;
    const x = Math.min(this.dragStart.x, this.pointerScreen.x);
    const y = Math.min(this.dragStart.y, this.pointerScreen.y);
    const w = Math.abs(this.pointerScreen.x - this.dragStart.x);
    const h = Math.abs(this.pointerScreen.y - this.dragStart.y);
    this.selectionRect = w > 6 && h > 6 ? { x, y, w, h } : null;
  };

  private handleMouseUp = (event: MouseEvent): void => {
    if (this.panning && event.button === 1) {
      this.panning = false;
      return;
    }

    if (event.button === 2) {
      this.refreshPointer(event);
      if (this.mode !== 'none') {
        this.setMode('none');
        return;
      }
      this.callbacks.onOrderClick(this.pointerWorld);
      return;
    }

    if (event.button !== 0) return;
    this.dragging = false;

    if (this.selectionRect) {
      const rect = this.selectionRect;
      this.selectionRect = null;
      const a = this.camera.screenToWorld(rect.x, rect.y);
      const b = this.camera.screenToWorld(rect.x + rect.w, rect.y + rect.h);
      this.callbacks.onSelectBox(
        { minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x), minY: Math.min(a.y, b.y), maxY: Math.max(a.y, b.y) },
        event.shiftKey,
      );
      return;
    }

    this.refreshPointer(event);
    if (this.mode !== 'none') {
      const mode = this.mode;
      this.setMode('none');
      this.callbacks.onTargetOrder(mode, this.pointerWorld);
      return;
    }

    this.callbacks.onSelectClick(this.pointerWorld, event.shiftKey);
  };

  private handleWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    this.camera.zoomAt(event.deltaY < 0 ? 1.12 : 1 / 1.12, event.clientX - rect.left, event.clientY - rect.top);
  };

  private handleKeyDown = (event: KeyboardEvent): void => {
    const code = event.code.toLowerCase();
    this.keys.add(code);
    if (event.repeat) return;

    switch (code) {
      case 'space':
        event.preventDefault();
        this.callbacks.onTogglePause();
        break;
      case 'digit1':
        this.callbacks.onSpeedChange(1);
        break;
      case 'digit2':
        this.callbacks.onSpeedChange(2);
        break;
      case 'digit3':
        this.callbacks.onSpeedChange(4);
        break;
      case 'keyg':
        this.setMode(this.mode === 'grenade' ? 'none' : 'grenade');
        break;
      case 'keyb':
        this.setMode(this.mode === 'artillery' ? 'none' : 'artillery');
        break;
      case 'escape':
        this.setMode('none');
        break;
      case 'keyc':
        this.callbacks.onToggleFlag('cover');
        break;
      case 'keyl':
        this.callbacks.onToggleFlag('los');
        break;
      case 'keyp':
        this.callbacks.onToggleFlag('paths');
        break;
      case 'keyf':
        // F comme « forward » : A/W/S/D sont réservés au déplacement de la caméra.
        this.callbacks.onStanceOrder('advance');
        break;
      case 'keyh':
        this.callbacks.onStanceOrder('hold');
        break;
      case 'keyr':
        this.callbacks.onStanceOrder('fallback');
        break;
      case 'keyt':
        this.callbacks.onRallyOrder();
        break;
      default:
        break;
    }
  };

  private handleKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.code.toLowerCase());
  };

  private handleBlur = (): void => {
    this.keys.clear();
    this.panning = false;
    this.dragging = false;
  };
}
