import { factionDef, FACTION_IDS } from '../data/factions';
import { unitDef } from '../data/units';
import { weapon } from '../data/weapons';
import type { SimEvent, SimState, Unit } from '../sim';
import type { ControlMode } from '../input/controls';

export interface HudCallbacks {
  onTogglePause(): void;
  onSpeedChange(speed: number): void;
  onStanceOrder(stance: 'advance' | 'hold' | 'fallback'): void;
  onRallyOrder(): void;
  onModeChange(mode: ControlMode): void;
  onToggleFlag(flag: 'cover' | 'los' | 'paths'): void;
  onNewBattle(): void;
}

export interface HudState {
  speed: number;
  paused: boolean;
  mode: ControlMode;
  flags: { cover: boolean; los: boolean; paths: boolean };
}

const MAX_LOG_LINES = 9;

/**
 * HUD en DOM (pas de rendu canvas) : texte net, sélectionnable, et impossible à
 * confondre avec le monde. Il ne fait que LIRE l'état de la simulation et transmettre
 * les intentions du joueur via des callbacks.
 */
export class Hud {
  private readonly scoreboard: HTMLElement;
  private readonly selectionPanel: HTMLElement;
  private readonly logPanel: HTMLElement;
  private readonly clock: HTMLElement;
  private readonly speedLabel: HTMLElement;
  private readonly banner: HTMLElement;
  private readonly tiles = new Map<string, HTMLElement>();
  private logLines: string[] = [];

  constructor(
    private readonly root: HTMLElement,
    private readonly callbacks: HudCallbacks,
  ) {
    this.scoreboard = this.require('scoreboard');
    this.selectionPanel = this.require('selection');
    this.logPanel = this.require('log');
    this.clock = this.require('clock');
    this.speedLabel = this.require('speed');
    // Le bandeau de fin est un calque posé AU-DESSUS du canvas, pas un enfant du HUD :
    // on le cherche donc dans le document.
    const banner = document.querySelector<HTMLElement>('#banner');
    if (!banner) throw new Error('HUD: élément #banner introuvable');
    this.banner = banner;
    this.bindControls();
    this.buildFactionCards();
  }

  private require(id: string): HTMLElement {
    const element = this.root.querySelector<HTMLElement>(`#${id}`);
    if (!element) throw new Error(`HUD: élément #${id} introuvable`);
    return element;
  }

  private bindControls(): void {
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('button[data-action]')) {
      button.addEventListener('click', () => {
        const action = button.dataset.action ?? '';
        const value = button.dataset.value ?? '';
        switch (action) {
          case 'pause':
            this.callbacks.onTogglePause();
            break;
          case 'speed':
            this.callbacks.onSpeedChange(Number(value));
            break;
          case 'stance':
            this.callbacks.onStanceOrder(value as 'advance' | 'hold' | 'fallback');
            break;
          case 'rally':
            this.callbacks.onRallyOrder();
            break;
          case 'mode':
            this.callbacks.onModeChange(value as ControlMode);
            break;
          case 'flag':
            this.callbacks.onToggleFlag(value as 'cover' | 'los' | 'paths');
            break;
          case 'newBattle':
            this.callbacks.onNewBattle();
            break;
          default:
            break;
        }
      });
    }
  }

  private buildFactionCards(): void {
    this.scoreboard.innerHTML = '';
    this.tiles.clear();
    for (const factionId of FACTION_IDS) {
      const def = factionDef(factionId);
      const card = document.createElement('div');
      card.className = 'faction-card';
      card.style.borderColor = def.color;
      card.innerHTML = `
        <div class="faction-name" style="color:${def.colorBright}">${def.name}</div>
        <div class="faction-creed">${def.creed}</div>
        <dl class="faction-stats">
          <dt>Effectifs</dt><dd data-stat="effective">—</dd>
          <dt>Moral</dt><dd data-stat="morale">—</dd>
          <dt>Objectifs</dt><dd data-stat="objectives">—</dd>
          <dt>Morts</dt><dd data-stat="casualties">—</dd>
          <dt>Fuyards</dt><dd data-stat="fled">—</dd>
          <dt>Barrages</dt><dd data-stat="barrages">—</dd>
        </dl>`;
      this.scoreboard.appendChild(card);
      for (const stat of card.querySelectorAll<HTMLElement>('[data-stat]')) {
        this.tiles.set(`${factionId}:${stat.dataset.stat}`, stat);
      }
    }
  }

  /** Met à jour le tableau de bord. Appelé à basse fréquence (le HUD n'a pas besoin de 60 Hz). */
  update(state: SimState, selection: Unit[], hudState: HudState): void {
    const minutes = Math.floor(state.elapsed / 60);
    const seconds = Math.floor(state.elapsed % 60);
    this.clock.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')} · tick ${state.tick}`;
    this.speedLabel.textContent = `${hudState.speed}×${hudState.paused ? ' (en pause)' : ''}`;

    for (const factionId of FACTION_IDS) {
      const runtime = state.factions[factionId];
      if (!runtime) continue;
      this.setStat(factionId, 'effective', String(runtime.effective));
      this.setStat(factionId, 'morale', `${runtime.avgMorale.toFixed(0)} %`);
      this.setStat(factionId, 'objectives', `${runtime.objectivesHeld} (score ${runtime.score})`);
      this.setStat(factionId, 'casualties', String(runtime.casualties));
      this.setStat(factionId, 'fled', String(runtime.fled));
      this.setStat(factionId, 'barrages', String(runtime.barrages));
    }

    this.renderSelection(selection);
    this.renderModeButtons(hudState);
    this.renderFlagButtons(hudState.flags);
    this.renderBanner(state);
  }

  private setStat(factionId: string, stat: string, value: string): void {
    const element = this.tiles.get(`${factionId}:${stat}`);
    if (element) element.textContent = value;
  }

  private renderSelection(selection: Unit[]): void {
    if (selection.length === 0) {
      this.selectionPanel.innerHTML = `<div class="empty">Aucune unité sélectionnée.<br /><span class="hint">Clic gauche sur une unité, ou clic glissé pour un groupe. Clic droit : ordre de déplacement ou d'attaque.</span></div>`;
      return;
    }

    if (selection.length === 1) {
      const unit = selection[0]!;
      const def = unitDef(unit.defId);
      const gun = weapon(def.weapon);
      const faction = factionDef(unit.faction);
      const abilities = def.abilities
        .map((ability) => {
          const slot = unit.abilities[ability];
          const charges = slot ? slot.charges : 0;
          return `<span class="chip ${charges > 0 ? '' : 'spent'}">${abilityLabel(ability)} ${charges}</span>`;
        })
        .join('');
      this.selectionPanel.innerHTML = `
        <div class="unit-card">
          <div class="unit-title">
            <span class="swatch" style="background:${faction.color}"></span>
            <strong>${def.label}</strong>
            <span class="role">${def.role} · ${faction.shortName}</span>
          </div>
          <div class="bars">
            <label>Vie</label><div class="bar hp"><i style="width:${Math.max(0, (unit.hp / unit.maxHp) * 100)}%"></i></div>
            <label>Moral</label><div class="bar morale"><i style="width:${unit.morale}%"></i></div>
            <label>Suppr.</label><div class="bar suppression"><i style="width:${unit.suppression}%"></i></div>
            <label>Couvert</label><div class="bar cover"><i style="width:${unit.cover * 100}%"></i></div>
          </div>
          <dl class="unit-stats">
            <dt>État</dt><dd>${stateLabel(unit)}</dd>
            <dt>Intention</dt><dd>${unit.intent}</dd>
            <dt>Arme</dt><dd>${gun.label} (${gun.range} tuiles)</dd>
            <dt>Posture</dt><dd>${stanceLabel(unit.stance)}</dd>
            <dt>Kills</dt><dd>${unit.kills}</dd>
          </dl>
          <div class="chips">${abilities || '<span class="chip spent">aucune capacité</span>'}</div>
        </div>`;
      return;
    }

    const counts = new Map<string, number>();
    for (const unit of selection) {
      const key = unitDef(unit.defId).label;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const list = [...counts.entries()].map(([label, count]) => `<li>${label} ×${count}</li>`).join('');
    const avgMorale = selection.reduce((sum, unit) => sum + unit.morale, 0) / selection.length;
    const pinned = selection.filter((unit) => unit.state === 'pinned').length;
    const broken = selection.filter((unit) => unit.state === 'broken').length;
    this.selectionPanel.innerHTML = `
      <div class="unit-card">
        <div class="unit-title"><strong>${selection.length} unités sélectionnées</strong></div>
        <dl class="unit-stats">
          <dt>Moral moyen</dt><dd>${avgMorale.toFixed(0)} %</dd>
          <dt>Clouées au sol</dt><dd>${pinned}</dd>
          <dt>Démoralisées</dt><dd>${broken}</dd>
        </dl>
        <ul class="roster">${list}</ul>
      </div>`;
  }

  private renderModeButtons(hudState: HudState): void {
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('button[data-action="mode"]')) {
      button.classList.toggle('active', button.dataset.value === hudState.mode);
    }
    const pause = this.root.querySelector<HTMLButtonElement>('button[data-action="pause"]');
    if (pause) pause.textContent = hudState.paused ? '▶ Reprendre (Espace)' : '⏸ Pause (Espace)';
  }

  private renderFlagButtons(flags: HudState['flags']): void {
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('button[data-action="flag"]')) {
      const flag = button.dataset.value as 'cover' | 'los' | 'paths';
      button.classList.toggle('active', flags[flag]);
    }
  }

  private renderBanner(state: SimState): void {
    if (!state.over) {
      this.banner.classList.add('hidden');
      return;
    }
    this.banner.classList.remove('hidden');
    const winner = state.over.winner ? factionDef(state.over.winner).name : 'Personne';
    this.banner.innerHTML = `<h1>${winner}</h1><p>${state.over.reason}</p><p class="hint">Barre d'espace pour relancer une bataille ? Utilisez « Nouvelle bataille ».</p>`;
  }

  /** Journal d'événements : les dernières lignes de la bataille, pour comprendre qui gagne et pourquoi. */
  logEvent(event: SimEvent): void {
    const line = describeEvent(event);
    if (!line) return;
    const seconds = (event.tick / 10).toFixed(0).padStart(3, ' ');
    this.logLines.unshift(`<li><span class="t">${seconds}s</span> ${line}</li>`);
    if (this.logLines.length > MAX_LOG_LINES) this.logLines.pop();
    this.logPanel.innerHTML = `<ul>${this.logLines.join('')}</ul>`;
  }

  clearLog(): void {
    this.logLines = [];
    this.logPanel.innerHTML = '<ul><li class="hint">— début de la bataille —</li></ul>';
  }

}

function describeEvent(event: SimEvent): string | null {
  switch (event.type) {
    case 'kill':
      return `<span class="bad">mort</span> ${event.label ? factionDef(event.label).shortName : '?'}`;
    case 'broken':
      return `<span class="warn">démoralisé</span>`;
    case 'pinned':
      return `<span class="warn">cloué au sol</span>`;
    case 'recovered':
      return `<span class="good">reprise en main</span>`;
    case 'fled':
      return `<span class="bad">fuite hors du champ</span>`;
    case 'rally':
      return `<span class="good">ralliement</span> (${event.label ?? 'officier'})`;
    case 'terrainDestroyed':
      return `<span class="warn">structure effondrée</span> → ${event.label ?? ''}`;
    case 'explosion':
      return `<span class="warn">explosion</span> (${event.weaponId ?? ''})`;
    case 'artilleryRequested':
      return `<span class="bad">barrage demandé</span> par ${event.faction ? factionDef(event.faction).shortName : '?'}`;
    case 'grenadeThrown':
      return `<span class="warn">grenade lancée</span>`;
    case 'objectiveCaptured':
      return `objectif <strong>${event.label ?? ''}</strong> → ${event.faction ? factionDef(event.faction).shortName : 'contesté'}`;
    case 'orderRefused':
      return `<span class="warn">ordre refusé</span> (${event.label ?? ''})`;
    case 'gameOver':
      return `<span class="bad">fin de bataille</span> ${event.label ?? ''}`;
    default:
      return null;
  }
}

function stateLabel(unit: Unit): string {
  switch (unit.state) {
    case 'broken':
      return 'démoralisée';
    case 'pinned':
      return 'clouée au sol';
    case 'engaging':
      return 'au contact';
    case 'moving':
      return 'en mouvement';
    case 'dead':
      return 'hors de combat';
    default:
      return 'en attente';
  }
}

function stanceLabel(stance: Unit['stance']): string {
  switch (stance) {
    case 'advance':
      return 'assaut';
    case 'hold':
      return 'tenir';
    case 'fallback':
      return 'repli';
    default:
      return stance;
  }
}

function abilityLabel(ability: string): string {
  switch (ability) {
    case 'grenade':
      return 'Grenades';
    case 'artillery':
      return 'Barrages';
    case 'rally':
      return 'Ralliements';
    case 'charge':
      return 'Charges';
    default:
      return ability;
  }
}
