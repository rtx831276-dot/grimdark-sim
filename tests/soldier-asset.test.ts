import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { AnimationMixer, SkinnedMesh } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';

describe('modèle de soldat', () => {
  it('contient un squelette, une animation de marche et des clones indépendants', async () => {
    const bytes = await readFile(new URL('../src/assets/soldier/soldier.glb', import.meta.url));
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const asset = await new GLTFLoader().parseAsync(buffer, '');
    const walk = asset.animations.find((clip) => clip.name === 'Walking');
    expect(walk?.duration).toBeGreaterThan(0);
    const a = clone(asset.scene);
    const b = clone(asset.scene);
    let meshA: SkinnedMesh | undefined;
    let meshB: SkinnedMesh | undefined;
    a.traverse((node) => { if (node instanceof SkinnedMesh) meshA = node; });
    b.traverse((node) => { if (node instanceof SkinnedMesh) meshB = node; });
    expect(meshA?.skeleton.bones.length).toBeGreaterThan(0);
    expect(meshA?.skeleton.bones[0]).not.toBe(meshB?.skeleton.bones[0]);
    const mixer = new AnimationMixer(a);
    mixer.clipAction(walk!).play();
    mixer.update(0.25);
    expect(mixer.time).toBeCloseTo(0.25);
  });
});

describe('animations de déplacement', () => {
  it('choisit le repos, la marche ou la course selon le mouvement réel', async () => {
    const { soldierMotion } = await import('../src/render/soldier-animation');
    const u = { alive: true, x: 0, y: 0, prevX: 0, prevY: 0 };
    expect(soldierMotion(u)).toBe('idle');
    expect(soldierMotion({ ...u, x: 0.1 })).toBe('walk');
    expect(soldierMotion({ ...u, x: 0.22 })).toBe('run');
    expect(soldierMotion({ ...u, alive: false, x: 0.22 })).toBe('idle');
  });

  it('joue les deux clips, revient au repos et fige les animations en pause', async () => {
    const { SoldierAnimator } = await import('../src/render/soldier-animation');
    const bytes = await readFile(new URL('../src/assets/soldier/soldier.glb', import.meta.url));
    const asset = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    const model = clone(asset.scene);
    const animator = new SoldierAnimator(model, asset.animations);
    const walk = asset.animations.find((clip) => clip.name === 'Walking')!;
    const run = asset.animations.find((clip) => clip.name === 'Running')!;
    expect(walk).toBeDefined();
    expect(run).toBeDefined();
    animator.update('walk', 0.3);
    expect(animator.mixer.clipAction(walk).isRunning()).toBe(true);
    const beforePause = animator.mixer.time;
    animator.update('run', 0);
    expect(animator.mixer.time).toBe(beforePause);
    expect(animator.mixer.clipAction(run).isRunning()).toBe(false);
    animator.update('run', 0.3);
    expect(animator.mixer.clipAction(run).isRunning()).toBe(true);
    animator.update('idle', 0.3);
    expect(animator.mixer.clipAction(run).getEffectiveWeight()).toBe(0);
    animator.dispose();
  });
});
