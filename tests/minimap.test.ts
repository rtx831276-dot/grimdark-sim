import { afterEach, describe, expect, it, vi } from 'vitest';
import { ENDLESS_CARREFOUR } from '../src/data/maps/endless-carrefour';
import { Camera } from '../src/render/camera';
import { Minimap, minimapToWorld, minimapViewCorners } from '../src/render/minimap';
import { createSimulation } from '../src/sim';

afterEach(() => vi.unstubAllGlobals());

describe('carte tactique', () => {
  it('convertit les clics redimensionnés en coordonnées bornées, et ignore les dimensions invalides', () => {
    expect(minimapToWorld(110, 85, 220, 170, 44, 34)).toEqual({ x: 22, y: 17 });
    expect(minimapToWorld(-30, 999, 220, 170, 44, 34)).toEqual({ x: 0, y: 34 });
    expect(minimapToWorld(5, 5, 0, 170, 44, 34)).toBeNull();
    expect(minimapToWorld(NaN, 5, 220, 170, 44, 34)).toBeNull();
  });
  it('suit les quatre coins de la vraie caméra, y compris en rotation et au zoom', () => {
    const camera = new Camera(900, 600); camera.centerOn(18, 12); camera.zoom = 1.6; camera.rotation = Math.PI / 3;
    const corners = minimapViewCorners(camera);
    expect(corners).toEqual([camera.screenToWorld(0, 0), camera.screenToWorld(900, 0),
      camera.screenToWorld(900, 600), camera.screenToWorld(0, 600)]);
    expect(corners[0]).not.toEqual(corners[2]);
  });
  it('met le fond en cache, le réactualise sur destruction et permet de naviguer sans modifier la simulation', () => {
    const context = () => ({ clearRect: vi.fn(), drawImage: vi.fn(), fillRect: vi.fn(), beginPath: vi.fn(),
      arc: vi.fn(), fill: vi.fn(), stroke: vi.fn(), save: vi.fn(), restore: vi.fn(), rect: vi.fn(),
      clip: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), closePath: vi.fn(), fillStyle: '', strokeStyle: '', lineWidth: 0 });
    const fg = context(), bg = context(), handlers = new Map<string, EventListener>();
    const background = { width: 0, height: 0, getContext: () => bg };
    vi.stubGlobal('document', { createElement: () => background });
    const canvas = { width: 220, height: 170, getContext: () => fg, closest: () => null,
      addEventListener: (name: string, fn: EventListener) => handlers.set(name, fn),
      removeEventListener: (name: string) => handlers.delete(name),
      getBoundingClientRect: () => ({ left: 10, top: 20, width: 110, height: 85 }), setPointerCapture: vi.fn() } as unknown as HTMLCanvasElement;
    const state = createSimulation({ map: ENDLESS_CARREFOUR, seed: 1 });
    const camera = new Camera(900, 600), minimap = new Minimap(canvas, camera, () => state.map);
    const initialUnits = state.units.map(u => ({ id: u.id, x: u.x, y: u.y }));
    minimap.render(state, new Set([state.units[0]!.id]));
    expect(bg.fillRect).toHaveBeenCalledTimes(state.map.tiles.length);
    expect(fg.drawImage).toHaveBeenCalledTimes(1);
    minimap.render(state, new Set());
    expect(bg.fillRect).toHaveBeenCalledTimes(state.map.tiles.length);
    state.map.tiles[0]!.hp -= 1;
    minimap.render(state, new Set());
    expect(bg.fillRect).toHaveBeenCalledTimes(state.map.tiles.length);
    state.map.tiles[0]!.terrain = 'crater';
    minimap.render(state, new Set());
    expect(bg.fillRect).toHaveBeenCalledTimes(state.map.tiles.length * 2);
    const preventDefault = vi.fn(), stopPropagation = vi.fn();
    handlers.get('pointerdown')!({ button: 0, pointerId: 9, clientX: 65, clientY: 62.5, preventDefault } as unknown as Event);
    expect(camera.x).toBe(22); expect(camera.y).toBe(17);
    handlers.get('pointermove')!({ pointerId: 9, clientX: 120, clientY: 105, preventDefault } as unknown as Event);
    expect(camera.x).toBe(44); expect(camera.y).toBe(34);
    handlers.get('pointerup')!({ pointerId: 9 } as unknown as Event);
    handlers.get('pointermove')!({ pointerId: 9, clientX: 10, clientY: 20, preventDefault } as unknown as Event);
    expect(camera.x).toBe(44);
    handlers.get('keydown')!({ key: 'ArrowLeft', preventDefault, stopPropagation } as unknown as Event);
    expect(camera.x).toBe(42); expect(stopPropagation).toHaveBeenCalled();
    expect(state.units.map(u => ({ id: u.id, x: u.x, y: u.y }))).toEqual(initialUnits);
    minimap.dispose();
    expect(handlers.size).toBe(0);
  });
});
