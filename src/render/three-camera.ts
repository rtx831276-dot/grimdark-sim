import * as THREE from 'three';
import type { Camera } from './camera';

/** Même projection au sol que Camera : les clics et calques restent synchronisés. */
export function syncThreeCamera(target: THREE.OrthographicCamera, camera: Camera): void {
  const pixelsPerUnit = 24 * Math.SQRT2 * camera.zoom;
  target.left = -camera.viewWidth / (2 * pixelsPerUnit);
  target.right = -target.left;
  target.top = camera.viewHeight / (2 * pixelsPerUnit);
  target.bottom = -target.top;
  const cos = Math.cos(camera.rotation);
  const sin = Math.sin(camera.rotation);
  target.position.set(camera.x + 30 * (cos - sin), 30 * Math.sqrt(2 / 3), camera.y + 30 * (sin + cos));
  target.lookAt(camera.x, 0, camera.y);
  target.updateProjectionMatrix();
  target.updateMatrixWorld();
}
