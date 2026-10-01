import { factionDef } from '../data/factions';
import { unitDef } from '../data/units';
import type { Unit } from '../sim';
import { worldDirectionToScreen } from './iso';
import type { ScreenPoint } from './iso';

/**
 * Rendu des unités : entièrement procédural (pas de sprite à charger).
 * Choix assumé pour la V0 : on lit l'état de l'unité d'un coup d'œil — couleur de faction,
 * barre de vie, moral, suppression, posture — sans dépendre d'un artiste.
 */
export interface SpriteOptions {
  selected: boolean;
  hovered: boolean;
  zoom: number;
}

export function drawUnit(ctx: CanvasRenderingContext2D, unit: Unit, position: ScreenPoint, options: SpriteOptions): void {
  const def = unitDef(unit.defId);
  const faction = factionDef(unit.faction);
  const scale = Math.max(0.55, Math.min(1.5, options.zoom));
  const radius = 9 * scale;
  const { x, y } = position;

  // Ombre portée : ancre visuelle de l'unité sur la tuile.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.beginPath();
  ctx.ellipse(x, y + 2, radius * 1.15, radius * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Cercle de sélection.
  if (options.selected || options.hovered) {
    ctx.strokeStyle = options.selected ? '#f0e2b0' : 'rgba(240, 226, 176, 0.5)';
    ctx.lineWidth = options.selected ? 2 : 1.2;
    ctx.beginPath();
    ctx.ellipse(x, y + 2, radius * 1.5, radius * 0.75, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Corps : couleur de faction, éclaircie pour les officiers et les mécanisés.
  const isLeader = def.abilities.includes('rally');
  const bodyColor = isLeader ? faction.colorBright : faction.color;
  const body = unit.state === 'broken' ? shade(faction.colorDark, 0.8) : bodyColor;
  // Liseré sombre : sans lui, une unité sombre se confond avec la boue.
  ctx.strokeStyle = 'rgba(10, 9, 7, 0.85)';
  ctx.lineWidth = 1.4 * scale;
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(x, y - radius * 0.35, radius * 0.85, radius * 0.95, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Casque / sommet.
  ctx.fillStyle = shade(bodyColor, 1.3);
  ctx.beginPath();
  ctx.arc(x, y - radius * 1.15, radius * 0.52, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Arme : orientée par le cap de l'unité, projetée dans le plan isométrique.
  const direction = worldDirectionToScreen(Math.cos(unit.facing), Math.sin(unit.facing));
  const gun = def.weapon.includes('lmg') || def.weapon.includes('sniper') ? 2.2 : 1.4;
  ctx.strokeStyle = '#1d1b16';
  ctx.lineWidth = gun * scale;
  ctx.beginPath();
  ctx.moveTo(x + direction.x * radius * 0.2, y - radius * 0.5 + direction.y * radius * 0.2);
  ctx.lineTo(x + direction.x * radius * 1.6, y - radius * 0.5 + direction.y * radius * 1.6);
  ctx.stroke();

  // Flash de tir : l'unité vient de lâcher une salve.
  if (unit.burstLeft > 0) {
    ctx.fillStyle = 'rgba(255, 226, 140, 0.85)';
    ctx.beginPath();
    ctx.arc(x + direction.x * radius * 1.9, y - radius * 0.5 + direction.y * radius * 1.9, 2.4 * scale, 0, Math.PI * 2);
    ctx.fill();
  }

  drawStatusBars(ctx, unit, x, y - radius * 2.1, scale);

  // Marqueurs d'état.
  if (unit.state === 'pinned') {
    ctx.strokeStyle = '#e0c341';
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.ellipse(x, y + 2, radius * 1.5, radius * 0.75, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  } else if (unit.state === 'broken') {
    ctx.fillStyle = '#d8544a';
    ctx.font = `${Math.round(11 * scale)}px "Segoe UI", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('!', x, y - radius * 2.9);
  } else if (unit.chargeTicks > 0) {
    ctx.fillStyle = '#e0703c';
    ctx.font = `${Math.round(11 * scale)}px "Segoe UI", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('⚡', x, y - radius * 2.9);
  }

  // Unité à couvert : petit chevron au sol.
  if (unit.cover > 0.4 && scale > 0.6) {
    ctx.strokeStyle = `rgba(120, 180, 220, ${0.25 + unit.cover * 0.5})`;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x - 5 * scale, y + 4);
    ctx.lineTo(x, y + 1);
    ctx.lineTo(x + 5 * scale, y + 4);
    ctx.stroke();
  }
}

/** Cadavre : trace au sol, sans sang animé (le sang est un effet séparé). */
export function drawCorpse(ctx: CanvasRenderingContext2D, unit: Unit, position: ScreenPoint, zoom: number): void {
  const scale = Math.max(0.55, Math.min(1.5, zoom));
  const radius = 7 * scale;
  ctx.fillStyle = 'rgba(30, 26, 22, 0.55)';
  ctx.beginPath();
  ctx.ellipse(position.x, position.y + 1, radius * 1.1, radius * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(120, 108, 96, 0.8)';
  ctx.lineWidth = 1.4;
  const arm = radius * 0.9;
  ctx.beginPath();
  ctx.moveTo(position.x - arm, position.y - 2);
  ctx.lineTo(position.x + arm, position.y + 2);
  ctx.moveTo(position.x + arm, position.y - 2);
  ctx.lineTo(position.x - arm, position.y + 2);
  ctx.stroke();
  if (zoom > 0.8) {
    ctx.fillStyle = 'rgba(150, 140, 120, 0.5)';
    ctx.font = `${Math.round(9 * scale)}px "Segoe UI", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(unitDef(unit.defId).label, position.x, position.y + 14 * scale);
  }
}

/** Barre de vie + moral + suppression, empilées au-dessus de l'unité. */
function drawStatusBars(ctx: CanvasRenderingContext2D, unit: Unit, x: number, y: number, scale: number): void {
  const width = 20 * scale;
  const height = 2.6 * scale;
  const hpRatio = Math.max(0, unit.hp / unit.maxHp);

  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.fillRect(x - width / 2 - 1, y - 1, width + 2, height + 2);
  ctx.fillStyle = hpRatio > 0.6 ? '#7fb069' : hpRatio > 0.3 ? '#d9a441' : '#c8503f';
  ctx.fillRect(x - width / 2, y, width * hpRatio, height);

  if (scale > 0.7) {
    const moraleColor = unit.morale > 60 ? '#9fb3c8' : unit.morale > 40 ? '#d9a441' : '#c8503f';
    ctx.fillStyle = moraleColor;
    ctx.fillRect(x - width / 2, y + height + 1.5, width * (unit.morale / 100), 1.6 * scale);
  }

  if (unit.suppression > 15 && scale > 0.7) {
    ctx.fillStyle = '#e0c341';
    ctx.fillRect(x - width / 2, y + height + 4, width * (unit.suppression / 100), 1.6 * scale);
  }
}

function shade(hex: string, factor: number): string {
  const value = hex.replace('#', '');
  const r = Math.min(255, Math.round(parseInt(value.slice(0, 2), 16) * factor));
  const g = Math.min(255, Math.round(parseInt(value.slice(2, 4), 16) * factor));
  const b = Math.min(255, Math.round(parseInt(value.slice(4, 6), 16) * factor));
  return `rgb(${r}, ${g}, ${b})`;
}
