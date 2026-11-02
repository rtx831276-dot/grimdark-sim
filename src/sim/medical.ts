import { distance } from '../core/math';
import { unitDef } from '../data/units';
import { killUnit } from './combat';
import { lineOfSight } from './los';
import { followPath, requestPath } from './movement';
import type { SimState, Unit } from './types';

/** En ticks de simulation (10 ticks/s), pas en secondes réelles. */
export const BLEED_OUT_TICKS = 600;
export const HOSPITAL_TICKS = 80;
const PICKUP_RANGE = 1.0;
const HOSPITAL_RANGE = 0.8;
const AUTO_RESCUE_RANGE = 6;

/** Un porteur libère son patient en cas d'ordre, de fuite, de blessure ou de mort. */
export function cancelRescue(state: SimState, carrier: Unit): void {
  const task = carrier.rescue;
  if (!task) return;
  const patient = state.units.find(unit => unit.id === task.targetId);
  if (patient?.wound?.assignedTo === carrier.id) {
    patient.wound.assignedTo = null;
    patient.wound.carriedBy = null;
    // La dernière position du patient suit le porteur au sol ; on ne le téléporte pas.
    if (task.stage === 'carrying') {
      patient.x = carrier.x; patient.y = carrier.y; patient.prevX = patient.x; patient.prevY = patient.y;
    }
    patient.intent = 'blessé : attend une évacuation';
  }
  carrier.rescue = undefined;
  carrier.path = []; carrier.pathIndex = 0; carrier.pathGoal = null; carrier.nextRepathTick = 0;
}

/** Détache aussi un blessé qui succombe pendant sa prise en charge. */
export function releaseMedicalLinks(state: SimState, unit: Unit): void {
  cancelRescue(state, unit);
  if (unit.wound?.assignedTo !== null && unit.wound?.assignedTo !== undefined) {
    const carrier = state.units.find(other => other.id === unit.wound!.assignedTo);
    if (carrier?.rescue?.targetId === unit.id) cancelRescue(state, carrier);
  }
  unit.wound = undefined;
}

/** Tombe au sol sans être compté mort ni recevoir de renfort tant qu'il peut être sauvé. */
export function incapacitate(state: SimState, unit: Unit, sourceId?: number, sourceFaction?: string): void {
  releaseMedicalLinks(state, unit);
  unit.logisticsTask = undefined;
  unit.hp = 1; unit.state = 'wounded'; unit.wound = {
    bleedOutTick: state.tick + BLEED_OUT_TICKS, assignedTo: null, carriedBy: null, hospitalUntil: null, sourceId, sourceFaction,
  };
  unit.meleeAttack = null; unit.meleeDodge = null; unit.burstLeft = 0; unit.goal = null; unit.forcedTargetId = null;
  unit.path = []; unit.pathIndex = 0; unit.pathGoal = null; unit.targetId = null;
  unit.intent = 'blessé : attend une évacuation';
  state.events.push({ tick: state.tick, type: 'wounded', unitId: unit.id, faction: unit.faction, x: unit.x, y: unit.y });
}

/** Attribue un seul porteur à un blessé allié. Les ordres manuels prévalent sur l'IA. */
export function assignRescue(state: SimState, carrier: Unit, patient: Unit, automatic = false): boolean {
  if (!state.map.def.hospitals?.[carrier.faction] || !carrier.alive || carrier.state === 'broken' || carrier.state === 'wounded' ||
      carrier.defId === 'creature' || !patient.alive || patient.state !== 'wounded' || !patient.wound ||
      patient.faction !== carrier.faction || patient.id === carrier.id || patient.wound.hospitalUntil !== null) return false;
  if (patient.wound.assignedTo !== null && patient.wound.assignedTo !== carrier.id) {
    const previous = state.units.find(unit => unit.id === patient.wound!.assignedTo);
    // Un ordre explicite peut remplacer un secours automatique, jamais un autre ordre explicite.
    if (automatic || !previous?.rescue?.automatic) return false;
    cancelRescue(state, previous);
  }
  cancelRescue(state, carrier);
  carrier.logisticsTask = undefined;
  patient.wound.assignedTo = carrier.id;
  carrier.rescue = { targetId: patient.id, stage: 'approach', automatic };
  carrier.meleeAttack = null; carrier.meleeDodge = null; carrier.goal = null; carrier.forcedTargetId = null;
  carrier.path = []; carrier.pathIndex = 0; carrier.pathGoal = null; carrier.nextRepathTick = 0;
  carrier.intent = 'évacuation : approche';
  state.events.push({ tick: state.tick, type: 'rescueStarted', unitId: carrier.id, targetId: patient.id,
    faction: carrier.faction, x: patient.x, y: patient.y });
  return true;
}

/** Saignement, admission et retour au combat, indépendants du rendu et de la fréquence d'images. */
export function updateMedical(state: SimState): void {
  if (!state.map.def.hospitals) return;
  for (const patient of state.units) {
    const wound = patient.wound;
    if (!patient.alive || patient.state !== 'wounded' || !wound) continue;
    if (wound.hospitalUntil !== null) {
      if (state.tick < wound.hospitalUntil) continue;
      patient.wound = undefined; patient.hp = patient.maxHp; patient.state = 'idle';
      patient.morale = Math.max(patient.morale, 50); patient.suppression = 0; patient.sinceUnderFire = 10;
      patient.intent = 'soigné à l’hôpital';
      state.events.push({ tick: state.tick, type: 'medicalRecovered', unitId: patient.id, faction: patient.faction, x: patient.x, y: patient.y });
    } else if (state.tick >= wound.bleedOutTick) {
      const attacker = state.units.find(unit => unit.id === wound.sourceId);
      killUnit(state, patient, wound.sourceId, wound.sourceFaction);
      if (attacker?.alive && attacker.faction !== patient.faction) attacker.kills++;
    }
  }
}

/** Secours autonome : médecins prioritaires, puis camarades libres et proches. */
export function assignNearbyMedics(state: SimState, controlledUnitId?: number): void {
  if (!state.map.def.hospitals || state.tick % 10 !== 0) return;
  for (const patient of state.units) {
    if (!patient.alive || patient.state !== 'wounded' || !patient.wound || patient.wound.assignedTo !== null || patient.wound.hospitalUntil !== null) continue;
    const candidates = state.units.filter(unit => {
      const medic = unitDef(unit.defId).abilities.includes('heal');
      return unit.alive && unit.faction === patient.faction && unit.id !== patient.id && unit.id !== controlledUnitId &&
        unit.state !== 'wounded' && unit.state !== 'broken' && unit.state !== 'pinned' && !unit.rescue &&
        !unit.goal && unit.forcedTargetId === null && !unit.meleeAttack && !unit.meleeDodge &&
        unit.suppression < 50 && (medic || (state.map.def.logistics && unit.stance === 'advance' && unit.sinceUnderFire >= 3)) &&
        distance(unit.x, unit.y, patient.x, patient.y) <= AUTO_RESCUE_RANGE &&
        lineOfSight(state.map, unit.x, unit.y, patient.x, patient.y).visible;
    });
    candidates.sort((a, b) => Number(unitDef(b.defId).abilities.includes('heal')) - Number(unitDef(a.defId).abilities.includes('heal')) ||
      distance(a.x, a.y, patient.x, patient.y) - distance(b.x, b.y, patient.x, patient.y) || a.id - b.id);
    if (candidates[0]) assignRescue(state, candidates[0], patient, true);
  }
}

/** Déplacement réel du porteur vers le blessé puis son poste médical, avec collisions. */
export function updateRescueTasks(state: SimState, dt: number): void {
  for (const carrier of state.units) {
    const task = carrier.rescue;
    if (!task) continue;
    const patient = state.units.find(unit => unit.id === task.targetId);
    const hospital = state.map.def.hospitals?.[carrier.faction];
    if (!carrier.alive || carrier.state === 'broken' || carrier.state === 'wounded' || !patient?.alive ||
        patient.state !== 'wounded' || !patient.wound || patient.wound.assignedTo !== carrier.id || !hospital) {
      cancelRescue(state, carrier); continue;
    }
    if (task.stage === 'approach' && distance(carrier.x, carrier.y, patient.x, patient.y) <= PICKUP_RANGE &&
        lineOfSight(state.map, carrier.x, carrier.y, patient.x, patient.y).visible) {
      task.stage = 'carrying'; patient.wound.carriedBy = carrier.id;
      carrier.path = []; carrier.pathIndex = 0; carrier.pathGoal = null; carrier.nextRepathTick = 0;
      patient.intent = 'blessé : transporté';
    }
    if (task.stage === 'carrying' && distance(carrier.x, carrier.y, hospital.x, hospital.y) <= HOSPITAL_RANGE) {
      patient.x = hospital.x; patient.y = hospital.y; patient.prevX = patient.x; patient.prevY = patient.y;
      patient.wound.carriedBy = null; patient.wound.assignedTo = null; patient.wound.hospitalUntil = state.tick + HOSPITAL_TICKS;
      patient.intent = 'soins à l’hôpital';
      carrier.rescue = undefined; carrier.path = []; carrier.pathIndex = 0; carrier.pathGoal = null;
      state.events.push({ tick: state.tick, type: 'hospitalized', unitId: patient.id, targetId: carrier.id,
        faction: patient.faction, x: hospital.x, y: hospital.y });
      continue;
    }
    const destination = task.stage === 'approach' ? patient : hospital;
    carrier.intent = task.stage === 'approach' ? 'évacuation : approche' : 'évacuation : transport';
    if (!carrier.path.length) requestPath(state, carrier, destination.x, destination.y, 0.8);
    followPath(state, carrier, task.stage === 'carrying' ? dt * 0.65 : dt);
  }
}

/** Synchronisation après la séparation : aucun espace fantôme entre porteur et patient. */
export function syncCarriedPatients(state: SimState): void {
  for (const patient of state.units) {
    if (!patient.wound || patient.wound.carriedBy === null) continue;
    const carrier = state.units.find(unit => unit.id === patient.wound!.carriedBy);
    if (!carrier?.alive || carrier.rescue?.targetId !== patient.id || carrier.rescue.stage !== 'carrying') {
      patient.wound.carriedBy = null; patient.wound.assignedTo = null; continue;
    }
    patient.x = carrier.x; patient.y = carrier.y; patient.facing = carrier.facing;
  }
}
