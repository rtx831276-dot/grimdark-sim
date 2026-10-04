import './styles.css';
import { BattleApp } from './app';

/**
 * Point d'entrée navigateur. Il ne contient AUCUNE règle de jeu : il branche le canvas,
 * la densité de pixels, le redimensionnement et le HUD sur l'application.
 */

const canvas = document.querySelector<HTMLCanvasElement>('#battlefield');
const hudRoot = document.querySelector<HTMLElement>('#hud');

if (!canvas || !hudRoot) {
  throw new Error('Canvas ou HUD introuvable : index.html a-t-il été modifié ?');
}

const app = new BattleApp({
  canvas,
  hudRoot,
  // Graine fixe : la même bataille se rejoue à l'identique à chaque rechargement.
  seed: 20261001,
});

function resizeCanvas(): void {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const width = canvas!.clientWidth;
  const height = canvas!.clientHeight;
  canvas!.width = Math.max(1, Math.floor(width * dpr));
  canvas!.height = Math.max(1, Math.floor(height * dpr));
  const context = canvas!.getContext('2d');
  if (context) context.setTransform(dpr, 0, 0, dpr, 0, 0);
  app.camera.resize(width, height);
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();
// Cadrage initial : l'église au centre du champ de vision.
app.camera.centerOn(23, 12);
app.camera.zoom = 1.05;
app.start();

// Accès console pour expérimenter (prototype oblige) :
//   __grimdark.app.describe()  -> résumé de la bataille
//   __grimdark.state()         -> état complet de la simulation
declare global {
  interface Window {
    __grimdark: { app: BattleApp; state: () => unknown };
  }
}
window.__grimdark = { app, state: () => app.simulation };
