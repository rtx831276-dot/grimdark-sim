import { Rng } from '../core/rng';
import type { SimEvent, SimState } from '../sim';
import type { Camera } from './camera';
import { worldDirectionToScreen } from './iso';

/**
 * Effets purement visuels : traces de balles, impacts, explosions, fumée, sang, cadavres.
 *
 * Règle d'or respectée ici : ces effets naissent des événements de la simulation et ne
 * peuvent JAMAIS la modifier. Ils ont leur propre générateur aléatoire, séparé du RNG
 * de la simulation, pour que les particules n'influencent pas le déroulement du combat.
 */
export interface VisualEffect {
  kind: 'tracer' | 'impact' | 'explosion' | 'smoke' | 'blood' | 'rally' | 'flag' | 'text';
  x: number;
  y: number;
  fromX?: number;
  fromY?: number;
  ttl: number;
  maxTtl: number;
  radius?: number;
  color?: string;
  label?: string;
  /** Graine fixe pour que l'effet reste identique d'une frame à l'autre. */
  seed?: number;
}

export class Effects {
  readonly list: VisualEffect[] = [];
  private rng = new Rng(0xc0ffee);

  /**
   * Traduit les événements du tick courant en effets visuels.
   * `_state` est accepté pour la lisibilité des appels (et pour les effets futurs
   * qui auront besoin du contexte) mais n'est volontairement pas lu ici.
   */
  spawnFromEvents(_state: SimState, events: SimEvent[]): void {
    for (const event of events) {
      switch (event.type) {
        case 'shot': {
          this.list.push({
            kind: 'tracer',
            x: event.tx ?? event.x ?? 0,
            y: event.ty ?? event.y ?? 0,
            fromX: event.x,
            fromY: event.y,
            ttl: 0.11,
            maxTtl: 0.11,
            seed: this.rng.int(1000),
          });
          this.list.push({
            kind: 'impact',
            x: event.tx ?? 0,
            y: event.ty ?? 0,
            ttl: 0.35,
            maxTtl: 0.35,
            radius: 0.16,
            seed: this.rng.int(1000),
          });
          break;
        }
        case 'hit': {
          this.list.push({
            kind: 'blood',
            x: event.x ?? 0,
            y: event.y ?? 0,
            ttl: 0.7,
            maxTtl: 0.7,
            radius: 0.22,
            seed: this.rng.int(1000),
          });
          break;
        }
        case 'kill': {
          this.list.push({
            kind: 'blood',
            x: event.x ?? 0,
            y: event.y ?? 0,
            ttl: 30,
            maxTtl: 30,
            radius: 0.42,
            seed: this.rng.int(1000),
          });
          this.list.push({
            kind: 'text',
            x: event.x ?? 0,
            y: event.y ?? 0,
            ttl: 1.4,
            maxTtl: 1.4,
            label: 'TUÉ',
            color: '#d8544a',
          });
          break;
        }
        case 'explosion': {
          this.list.push({
            kind: 'explosion',
            x: event.x ?? 0,
            y: event.y ?? 0,
            ttl: 0.75,
            maxTtl: 0.75,
            radius: event.radius ?? 2.5,
            seed: this.rng.int(1000),
          });
          this.list.push({
            kind: 'smoke',
            x: event.x ?? 0,
            y: event.y ?? 0,
            ttl: 2.6,
            maxTtl: 2.6,
            radius: event.radius ?? 2.5,
            seed: this.rng.int(1000),
          });
          break;
        }
        case 'terrainDestroyed': {
          this.list.push({
            kind: 'smoke',
            x: event.x ?? 0,
            y: event.y ?? 0,
            ttl: 3.4,
            maxTtl: 3.4,
            radius: 1.1,
            color: '#8a8374',
            seed: this.rng.int(1000),
          });
          break;
        }
        case 'rally': {
          this.list.push({
            kind: 'rally',
            x: event.x ?? 0,
            y: event.y ?? 0,
            ttl: 1.2,
            maxTtl: 1.2,
            radius: 8,
            seed: this.rng.int(1000),
          });
          break;
        }
        case 'objectiveCaptured': {
          this.list.push({
            kind: 'flag',
            x: event.x ?? 0,
            y: event.y ?? 0,
            ttl: 4,
            maxTtl: 4,
            label: event.label,
            seed: this.rng.int(1000),
          });
          break;
        }
        case 'grenadeThrown': {
          this.list.push({
            kind: 'text',
            x: event.x ?? 0,
            y: event.y ?? 0,
            ttl: 1,
            maxTtl: 1,
            label: 'GRENADE',
            color: '#c9a227',
          });
          break;
        }
        case 'artilleryRequested': {
          this.list.push({
            kind: 'text',
            x: event.x ?? 0,
            y: event.y ?? 0,
            ttl: 3,
            maxTtl: 3,
            label: 'BARRAGE EN APPROCHE',
            color: '#e0703c',
          });
          break;
        }
        case 'pinned': {
          this.list.push({ kind: 'text', x: event.x ?? 0, y: event.y ?? 0, ttl: 1.1, maxTtl: 1.1, label: 'CLOUÉ', color: '#e0c341' });
          break;
        }
        case 'broken': {
          this.list.push({ kind: 'text', x: event.x ?? 0, y: event.y ?? 0, ttl: 1.6, maxTtl: 1.6, label: 'DÉMORALISÉ', color: '#d8544a' });
          break;
        }
        case 'fled': {
          this.list.push({ kind: 'text', x: event.x ?? 0, y: event.y ?? 0, ttl: 1.6, maxTtl: 1.6, label: 'FUITE', color: '#9a8f7a' });
          break;
        }
        case 'recovered': {
          this.list.push({ kind: 'text', x: event.x ?? 0, y: event.y ?? 0, ttl: 1.2, maxTtl: 1.2, label: 'REPRIS', color: '#7fb069' });
          break;
        }
        default:
          break;
      }
    }
    // Garde-fou : une bataille très longue ne doit pas accumuler d'effets.
    if (this.list.length > 900) this.list.splice(0, this.list.length - 900);
  }

  update(dt: number): void {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const effect = this.list[i]!;
      effect.ttl -= dt;
      if (effect.ttl <= 0) this.list.splice(i, 1);
    }
  }

  clear(): void {
    this.list.length = 0;
  }
}

/** Dessine les effets. Appelé par le renderer après le monde, avant l'interface. */
export function drawEffects(
  ctx: CanvasRenderingContext2D,
  effects: Effects,
  camera: Camera,
): void {
  for (const effect of effects.list) {
    const progress = 1 - effect.ttl / effect.maxTtl;
    switch (effect.kind) {
      case 'tracer': {
        if (effect.fromX === undefined || effect.fromY === undefined) break;
        const from = camera.worldToScreen(effect.fromX, effect.fromY - 0.35);
        const to = camera.worldToScreen(effect.x, effect.y - 0.35);
        ctx.strokeStyle = `rgba(255, 224, 150, ${0.85 * (1 - progress)})`;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
        break;
      }
      case 'impact': {
        const p = camera.worldToScreen(effect.x, effect.y - 0.2);
        ctx.fillStyle = `rgba(190, 180, 150, ${0.6 * (1 - progress)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2 + progress * 6, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'blood': {
        const p = camera.worldToScreen(effect.x, effect.y);
        const radius = (effect.radius ?? 0.3) * 26 * camera.zoom;
        ctx.fillStyle = `rgba(104, 24, 20, ${0.42 * (1 - progress * 0.4)})`;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, radius, radius * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'explosion': {
        const p = camera.worldToScreen(effect.x, effect.y);
        const radius = (effect.radius ?? 2) * 24 * camera.zoom;
        const pulse = 1 - Math.pow(1 - progress, 2);
        ctx.fillStyle = `rgba(255, ${Math.round(200 - progress * 120)}, 90, ${0.7 * (1 - progress)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius * pulse, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = `rgba(255, 240, 200, ${0.9 * (1 - progress)})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius * pulse * 1.05, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
      case 'smoke': {
        const p = camera.worldToScreen(effect.x, effect.y);
        const drift = progress * 22 * camera.zoom;
        const radius = (effect.radius ?? 1.5) * 20 * camera.zoom * (0.6 + progress * 0.8);
        const seedOffset = (effect.seed ?? 0) % 7;
        // Fumée claire et peu opaque : une fumée sombre se lisait comme un trou noir sur
        // une carte elle-même sombre.
        ctx.fillStyle = `rgba(126, 118, 104, ${0.26 * (1 - progress)})`;
        for (let i = 0; i < 4; i++) {
          const angle = (i / 4) * Math.PI * 2 + seedOffset;
          ctx.beginPath();
          ctx.arc(
            p.x + Math.cos(angle) * drift * 0.5,
            p.y + Math.sin(angle) * drift * 0.25 - drift * 0.4,
            radius * (0.5 + 0.2 * ((i + seedOffset) % 3)),
            0,
            Math.PI * 2,
          );
          ctx.fill();
        }
        break;
      }
      case 'rally': {
        const p = camera.worldToScreen(effect.x, effect.y);
        const radius = (effect.radius ?? 8) * 24 * camera.zoom * progress;
        ctx.strokeStyle = `rgba(200, 180, 90, ${0.55 * (1 - progress)})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, radius, radius * 0.5, 0, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
      case 'flag': {
        const p = camera.worldToScreen(effect.x, effect.y - 1.2);
        ctx.fillStyle = `rgba(230, 220, 180, ${Math.min(1, effect.ttl)})`;
        ctx.font = '12px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`⚑ ${effect.label ?? 'objectif'}`, p.x, p.y);
        break;
      }
      case 'text': {
        const p = camera.worldToScreen(effect.x, effect.y - 0.8 - progress * 0.6);
        ctx.fillStyle = effect.color ?? '#ddd';
        ctx.globalAlpha = Math.min(1, effect.ttl * 1.5);
        ctx.font = 'bold 12px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(effect.label ?? '', p.x, p.y);
        ctx.globalAlpha = 1;
        break;
      }
      default:
        break;
    }
  }
}

/** Direction d'une unité vers une cible, en repère écran (utilitaire de rendu). */
export function screenDirection(fromX: number, fromY: number, toX: number, toY: number): { x: number; y: number } {
  return worldDirectionToScreen(toX - fromX, toY - fromY);
}
