import * as THREE from 'three';

/** Couleur d'un ciel voilé en fonction de la direction verticale (horizon = 0). */
export function skyColor(y: number): [number, number, number] {
  const horizon = [151, 161, 157], zenith = [62, 82, 96], below = [91, 96, 89];
  const t = Math.max(0, Math.min(1, Math.abs(y) * 1.5));
  const blend = t * t * (3 - 2 * t), target = y >= 0 ? zenith : below;
  return [0, 1, 2].map(i => Math.round(horizon[i]! + (target[i]! - horizon[i]!) * blend)) as [number, number, number];
}

/** Cubemap procédurale : le ciel suit la rotation de la caméra, sans réseau. */
export function makeModernSky(): THREE.CubeTexture {
  const side = 64;
  const faces: HTMLCanvasElement[] = [];
  for (let face = 0; face < 6; face++) {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = side;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D indisponible pour le ciel.');
    const image = ctx.createImageData(side, side);
    for (let row = 0; row < side; row++) for (let col = 0; col < side; col++) {
      const u = (col + 0.5) / side * 2 - 1, v = (row + 0.5) / side * 2 - 1;
      const vertical = (face === 2 ? 1 : face === 3 ? -1 : -v) / Math.sqrt(1 + u * u + v * v);
      const color = skyColor(vertical), i = (row * side + col) * 4;
      image.data[i] = color[0]; image.data[i + 1] = color[1]; image.data[i + 2] = color[2]; image.data[i + 3] = 255;
    }
    ctx.putImageData(image, 0, 0); faces.push(canvas);
  }
  const texture = new THREE.CubeTexture(faces);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}
