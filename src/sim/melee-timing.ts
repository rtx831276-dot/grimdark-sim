/**
 * Moveset à mains nues : portée et demi-angle décrivent un secteur au sol.
 * Les repères de contact sont estimés à partir des clips, arrondis au tick de 100 ms.
 * Chaque animation correspond à une seule fenêtre de contact, pas un coup par geste.
 */
export const MELEE_CLIPS = [
  { name: 'Punch_Combo', label: 'Direct', impactOffset: 3, durationTicks: 18, reach: 1.30, halfAngle: Math.PI / 6, damageScale: 1, maxTargets: 1 },
  { name: 'Punch_Combo_1', label: 'Enchaînement rapide', impactOffset: 4, durationTicks: 15, reach: 1.25, halfAngle: Math.PI / 5, damageScale: 0.85, maxTargets: 1 },
  { name: 'Punch_Combo_2', label: 'Pression', impactOffset: 2, durationTicks: 20, reach: 1.30, halfAngle: Math.PI / 4, damageScale: 1.05, maxTargets: 1 },
  { name: 'Punch_Combo_3', label: 'Croisé', impactOffset: 5, durationTicks: 18, reach: 1.30, halfAngle: Math.PI / 5.5, damageScale: 1.15, maxTargets: 1 },
  { name: 'Punch_Combo_4', label: 'Frappe puissante', impactOffset: 2, durationTicks: 20, reach: 1.20, halfAngle: Math.PI / 5, damageScale: 1.30, maxTargets: 1 },
  { name: 'Punch_Combo_5', label: 'Combinaison', impactOffset: 4, durationTicks: 16, reach: 1.30, halfAngle: Math.PI / 4.5, damageScale: 0.95, maxTargets: 1 },
  { name: 'Leg_Sweep', label: 'Balayage', impactOffset: 12, durationTicks: 20, reach: 1.30, halfAngle: Math.PI / 2.6, damageScale: 0.80, maxTargets: 2 },
  { name: 'Counterstrike', label: 'Contre-frappe', impactOffset: 6, durationTicks: 26, reach: 1.30, halfAngle: Math.PI / 4.0, damageScale: 1.10, maxTargets: 1 },
  { name: 'Flying_Fist_Kick', label: 'Coup de pied sauté', impactOffset: 11, durationTicks: 25, reach: 1.35, halfAngle: Math.PI / 4.0, damageScale: 1.20, maxTargets: 1 },
  { name: 'High_Kick', label: 'Coup de pied haut', impactOffset: 9, durationTicks: 18, reach: 1.35, halfAngle: Math.PI / 4.5, damageScale: 1.15, maxTargets: 1 },
  { name: 'Kung_Fu_Punch', label: 'Enchaînement kung-fu', impactOffset: 4, durationTicks: 28, reach: 1.30, halfAngle: Math.PI / 4.0, damageScale: 1.05, maxTargets: 1 },
  { name: 'Lunge_Spin_Kick', label: 'Coup de pied tournant', impactOffset: 7, durationTicks: 18, reach: 1.35, halfAngle: Math.PI / 3.5, damageScale: 1.15, maxTargets: 1 },
  { name: 'Roundhouse_Kick', label: 'Coup de pied circulaire', impactOffset: 11, durationTicks: 20, reach: 1.35, halfAngle: Math.PI / 3.0, damageScale: 1.20, maxTargets: 1 },
  { name: 'Step_in_High_Kick', label: 'Pas et coup de pied haut', impactOffset: 5, durationTicks: 15, reach: 1.35, halfAngle: Math.PI / 5.0, damageScale: 1.05, maxTargets: 1 },
  { name: 'Sweeping_Kick', label: 'Coup de pied balayé', impactOffset: 8, durationTicks: 20, reach: 1.35, halfAngle: Math.PI / 2.8, damageScale: 0.85, maxTargets: 2 },
  { name: 'Boxing_Guard_Prep_Straight_Punch', label: 'Direct en garde', impactOffset: 9, durationTicks: 20, reach: 1.30, halfAngle: Math.PI / 5.0, damageScale: 1.00, maxTargets: 1 },
  { name: 'Boxing_Guard_Right_Straight_Kick', label: 'Coup de pied direct', impactOffset: 7, durationTicks: 15, reach: 1.35, halfAngle: Math.PI / 5.0, damageScale: 1.10, maxTargets: 1 },
  { name: 'Boxing_Guard_Step_Knee_Strike', label: 'Coup de genou', impactOffset: 3, durationTicks: 17, reach: 1.15, halfAngle: Math.PI / 4.5, damageScale: 1.15, maxTargets: 1 },
  { name: 'Elbow_Strike', label: 'Coup de coude', impactOffset: 4, durationTicks: 17, reach: 1.15, halfAngle: Math.PI / 3.5, damageScale: 1.10, maxTargets: 1 },
  { name: 'Left_Hook_from_Guard', label: 'Crochet gauche', impactOffset: 4, durationTicks: 14, reach: 1.20, halfAngle: Math.PI / 3.2, damageScale: 1.05, maxTargets: 1 },
  { name: 'Left_Jab_from_Guard', label: 'Jab gauche', impactOffset: 4, durationTicks: 14, reach: 1.30, halfAngle: Math.PI / 6.0, damageScale: 0.80, maxTargets: 1 },
  { name: 'Left_Short_Hook_from_Guard', label: 'Crochet court gauche', impactOffset: 4, durationTicks: 14, reach: 1.15, halfAngle: Math.PI / 3.5, damageScale: 1.00, maxTargets: 1 },
  { name: 'Left_Uppercut_from_Guard', label: 'Uppercut gauche', impactOffset: 4, durationTicks: 14, reach: 1.20, halfAngle: Math.PI / 5.0, damageScale: 1.10, maxTargets: 1 },
  { name: 'Punch_Forward_with_Both_Fists', label: 'Double frappe', impactOffset: 9, durationTicks: 20, reach: 1.30, halfAngle: Math.PI / 4.5, damageScale: 1.15, maxTargets: 1 },
  { name: 'Right_Jab_from_Guard', label: 'Jab droit', impactOffset: 5, durationTicks: 16, reach: 1.30, halfAngle: Math.PI / 6.0, damageScale: 0.85, maxTargets: 1 },
  { name: 'Right_Upper_Hook_from_Guard', label: 'Crochet haut droit', impactOffset: 6, durationTicks: 15, reach: 1.20, halfAngle: Math.PI / 4.0, damageScale: 1.05, maxTargets: 1 },
  { name: 'Right_Uppercut_from_Guard', label: 'Uppercut droit', impactOffset: 6, durationTicks: 14, reach: 1.20, halfAngle: Math.PI / 5.0, damageScale: 1.10, maxTargets: 1 },
  { name: 'Spartan_Kick', label: 'Coup de pied frontal', impactOffset: 6, durationTicks: 16, reach: 1.35, halfAngle: Math.PI / 5.5, damageScale: 1.20, maxTargets: 1 },
  { name: 'Dodge_and_Counter', label: 'Contre-combinaison', impactOffset: 17, durationTicks: 30, reach: 1.30, halfAngle: Math.PI / 4, damageScale: 1.10, maxTargets: 1 },
  { name: 'Boxing_Practice', label: 'Série de boxe', impactOffset: 2, durationTicks: 26, reach: 1.30, halfAngle: Math.PI / 4.5, damageScale: 1.00, maxTargets: 1 },
] as const;
/** Une fenêtre de contact par animation de lame. */
export const SWORD_CLIPS = [
  { name: 'Right_Hand_Sword_Slash', label: 'Entaille à la lame', impactOffset: 6, durationTicks: 15, reach: 1.70, halfAngle: Math.PI / 3.5, damageScale: 1, maxTargets: 1 },
  { name: 'Weapon_Combo', label: 'Combinaison à la lame', impactOffset: 15, durationTicks: 25, reach: 1.65, halfAngle: Math.PI / 3, damageScale: 1.1, maxTargets: 1 },
  { name: 'Weapon_Combo_1', label: 'Frappe à la lame', impactOffset: 4, durationTicks: 20, reach: 1.70, halfAngle: Math.PI / 3.5, damageScale: 0.9, maxTargets: 1 },
] as const;
/** Compatibilité avec le premier clip et anciens consommateurs. */
export const MELEE_DURATION_TICKS = MELEE_CLIPS[0].durationTicks;
export type MeleeClipName = typeof MELEE_CLIPS[number]['name'] | typeof SWORD_CLIPS[number]['name'];
export type MeleeMove = typeof MELEE_CLIPS[number] | typeof SWORD_CLIPS[number];

export function meleeMove(name: MeleeClipName): MeleeMove {
  return [...MELEE_CLIPS, ...SWORD_CLIPS].find(move => move.name === name)!;
}
