import { describe, expect, it } from 'vitest';
import { OrthographicCamera, Vector3 } from 'three';
import { Camera } from '../src/render/camera';
import { syncThreeCamera } from '../src/render/three-camera';

describe('projection 3D', () => {
  it('superpose la 3D et les commandes à tous les zooms et angles', () => {
    const camera = new Camera(1280, 720);
    const three = new OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
    for (const zoom of [0.45, 1, 2.8]) for (let angle = 0; angle < 8; angle++) {
      camera.centerOn(18, 23); camera.zoom = zoom; camera.rotation = angle * Math.PI / 4;
      syncThreeCamera(three, camera);
      for (const [x, y] of [[18, 23], [0, 0], [35, 30], [18.5, 24.5]] as const) {
        const p = new Vector3(x, 0, y).project(three);
        const expected = camera.worldToScreen(x, y);
        expect((p.x + 1) * camera.viewWidth / 2).toBeCloseTo(expected.x, 5);
        expect((1 - p.y) * camera.viewHeight / 2).toBeCloseTo(expected.y, 5);
        const world = camera.screenToWorld(expected.x, expected.y);
        expect(world.x).toBeCloseTo(x, 6);
        expect(world.y).toBeCloseTo(y, 6);
      }
    }
  });

  it('garde le point sous le curseur au zoom et déplace correctement après rotation', () => {
    const camera = new Camera(1280, 720);
    camera.rotation = Math.PI / 4;
    const before = camera.screenToWorld(350, 260);
    camera.zoomAt(1.5, 350, 260);
    const after = camera.screenToWorld(350, 260);
    expect(after.x).toBeCloseTo(before.x, 8);
    expect(after.y).toBeCloseTo(before.y, 8);
    const point = camera.worldToScreen(18, 23);
    camera.panByScreen(80, -30);
    const moved = camera.worldToScreen(18, 23);
    expect(moved.x - point.x).toBeCloseTo(80, 8);
    expect(moved.y - point.y).toBeCloseTo(-30, 8);
  });
});
