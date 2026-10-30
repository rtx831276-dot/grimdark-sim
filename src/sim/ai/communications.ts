import { distance } from '../../core/math';
import { unitDef } from '../../data/units';
import { weapon } from '../../data/weapons';
import { lineOfSight } from '../los';
import type { SimState, TacticalReport, Unit } from '../types';

/** Portée locale et durée de validité : pas de connaissance globale de la carte. */
export const COMMS_RADIUS = 7;
export const COMMS_LIFETIME_TICKS = 30;
export const COMMS_SPEAKER_COOLDOWN = 80;
export const COMMS_FACTION_COOLDOWN = 20;
const MAX_TARGET_DRIFT = 2.5;

/**
 * Un soldat signale un ennemi qu'il voit aux alliés proches, ou demande de l'aide
 * s'il est blessé. Les limites de fréquence évitent de saturer l'écran et le journal.
 */
export function updateCommunications(state: SimState): void {
  const comms = state.communications;
  if (!state.map.def.tacticalCommunications) return;
  comms.reports = comms.reports.filter((report) => report.expiresTick > state.tick);
  if (state.units.length === 0) return;
  // Alterner le premier candidat évite que les identifiants les plus bas parlent toujours.
  const start = state.tick % state.units.length;
  for (let i = 0; i < state.units.length; i++) {
    const speaker = state.units[(start + i) % state.units.length]!;
    if (!speaker.alive || speaker.state === 'broken' || weapon(unitDef(speaker.defId).weapon).kind !== 'melee') continue;
    if ((comms.nextSpeakerTick[speaker.id] ?? 0) > state.tick || (comms.nextFactionTick[speaker.faction] ?? 0) > state.tick) continue;
    const recipients = state.units.filter((ally) => ally.alive && ally.state !== 'broken' && ally.id !== speaker.id &&
      ally.faction === speaker.faction && distance(ally.x, ally.y, speaker.x, speaker.y) <= COMMS_RADIUS).map((ally) => ally.id);
    if (recipients.length === 0) continue;
    let target: Unit | null = null;
    let bestDistance = Infinity;
    for (const enemy of state.units) {
      if (!enemy.alive || enemy.faction === speaker.faction) continue;
      const dist = distance(speaker.x, speaker.y, enemy.x, enemy.y);
      if (dist > unitDef(speaker.defId).vision || dist > bestDistance) continue;
      if (!lineOfSight(state.map, speaker.x, speaker.y, enemy.x, enemy.y).visible) continue;
      if (dist < bestDistance || enemy.id < (target?.id ?? Infinity)) { target = enemy; bestDistance = dist; }
    }
    if (!target) continue;
    const kind = speaker.hp / speaker.maxHp < 0.55 && bestDistance <= 5 ? 'help' : 'contact';
    const report: TacticalReport = {
      senderId: speaker.id, faction: speaker.faction, targetId: target.id,
      targetX: target.x, targetY: target.y, kind, recipients,
      expiresTick: state.tick + COMMS_LIFETIME_TICKS,
    };
    comms.reports.push(report);
    comms.nextSpeakerTick[speaker.id] = state.tick + COMMS_SPEAKER_COOLDOWN;
    comms.nextFactionTick[speaker.faction] = state.tick + COMMS_FACTION_COOLDOWN;
    state.events.push({ tick: state.tick, type: 'communication', unitId: speaker.id, targetId: target.id,
      faction: speaker.faction, x: speaker.x, y: speaker.y,
      label: kind === 'help' ? 'Besoin de renfort !' : 'Ennemi repéré !' });
  }
}

/** Renseignement reçu à l'émission, encore valide et proche du dernier point observé. */
export function reportForTarget(state: SimState, receiver: Unit, target: Unit): TacticalReport | null {
  let best: TacticalReport | null = null;
  if (!receiver.alive || !target.alive || receiver.faction === target.faction) return null;
  for (const report of state.communications.reports) {
    if (report.faction !== receiver.faction || report.targetId !== target.id || report.expiresTick <= state.tick ||
        !report.recipients.includes(receiver.id) ||
        distance(target.x, target.y, report.targetX, report.targetY) > MAX_TARGET_DRIFT) continue;
    if (!best || (report.kind === 'help' && best.kind !== 'help') || (report.expiresTick > best.expiresTick && report.kind === best.kind)) best = report;
  }
  return best;
}
