import type { FactionId } from '../core/ids';

/** Capacités activables en jeu. */
export type AbilityId = 'grenade' | 'artillery' | 'rally' | 'charge';

/**
 * Traits passifs. Ils sont interprétés par la simulation (src/sim/), pas par le rendu.
 *  - fearless   : le moral ne peut pas tomber en dessous de 55 (fanatiques)
 *  - mechanical : suppression plafonnée à 40, jamais démoralisé
 *  - marksman   : +12 % de précision
 *  - shock      : ignore la pénalité de tir en mouvement
 */
export type TraitId = 'fearless' | 'mechanical' | 'marksman' | 'shock';

export interface UnitDef {
  id: string;
  label: string;
  role: string;
  /** Absent = unité disponible pour toutes les factions. */
  faction?: FactionId;
  hp: number;
  /** 0..1 : réduction des dégâts encaissés. */
  armor: number;
  /** Tuiles par seconde. */
  speed: number;
  /** Multiplicateur de précision (0.5 = recrue, 1.2 = vétéran). */
  skill: number;
  /** Moral de base 0..100. */
  morale: number;
  /** 0..1 : résistance à la suppression et vitesse de récupération. */
  discipline: number;
  /** Portée de détection en tuiles. */
  vision: number;
  weapon: string;
  abilities: AbilityId[];
  charges: Partial<Record<AbilityId, number>>;
  traits: TraitId[];
  description: string;
}

export const UNITS: Record<string, UnitDef> = {
  milice: {
    id: 'milice',
    label: 'Milice levée',
    role: 'Chair à canon',
    hp: 32,
    armor: 0.02,
    speed: 2.0,
    skill: 0.5,
    morale: 45,
    discipline: 0.3,
    vision: 12,
    weapon: 'rifle_semi',
    abilities: [],
    charges: {},
    traits: [],
    description: "Conscrite hier, morte demain. Se brise vite sous le feu.",
  },
  fusilier: {
    id: 'fusilier',
    label: 'Fusilier',
    role: 'Ligne',
    hp: 42,
    armor: 0.08,
    speed: 2.2,
    skill: 0.75,
    morale: 62,
    discipline: 0.5,
    vision: 14,
    weapon: 'rifle_semi',
    abilities: [],
    charges: {},
    traits: [],
    description: "L'ossature des deux camps. Tient tant qu'on lui donne un mur.",
  },
  tireur_verrou: {
    id: 'tireur_verrou',
    label: 'Tireur à verrou',
    role: 'Tir d\'élite',
    hp: 36,
    armor: 0.06,
    speed: 2.0,
    skill: 0.95,
    morale: 66,
    discipline: 0.55,
    vision: 20,
    weapon: 'rifle_bolt',
    abilities: [],
    charges: {},
    traits: ['marksman'],
    description: 'Choisit ses cibles. Un fusilier isolé meurt avant de le voir.',
  },
  mitrailleur: {
    id: 'mitrailleur',
    label: 'Mitrailleur',
    role: 'Suppression',
    hp: 44,
    armor: 0.1,
    speed: 1.6,
    skill: 0.6,
    morale: 58,
    discipline: 0.7,
    vision: 14,
    weapon: 'lmg_grinder',
    abilities: [],
    charges: {},
    traits: [],
    description: 'Ne tue pas beaucoup : cloue sur place tout un flanc.',
  },
  grenadier: {
    id: 'grenadier',
    label: 'Grenadier',
    role: 'Assaut',
    hp: 42,
    armor: 0.1,
    speed: 2.2,
    skill: 0.7,
    morale: 64,
    discipline: 0.55,
    vision: 14,
    weapon: 'rifle_semi',
    abilities: ['grenade'],
    charges: { grenade: 4 },
    traits: [],
    description: 'Ouvre les trous dans lesquels les autres s\'engouffrent.',
  },
  eclaireur: {
    id: 'eclaireur',
    label: 'Éclaireur',
    role: 'Reconnaissance',
    hp: 30,
    armor: 0.03,
    speed: 3.0,
    skill: 0.6,
    morale: 60,
    discipline: 0.45,
    vision: 22,
    weapon: 'smg_ash',
    abilities: [],
    charges: {},
    traits: ['shock'],
    description: 'Voit tout, encaisse rien. Ouvre la carte pour le barrage.',
  },
  sapeur: {
    id: 'sapeur',
    label: 'Sapeur de tranchée',
    role: 'Nettoyage',
    hp: 50,
    armor: 0.18,
    speed: 2.1,
    skill: 0.75,
    morale: 66,
    discipline: 0.65,
    vision: 12,
    weapon: 'shotgun_trench',
    abilities: ['grenade'],
    charges: { grenade: 2 },
    traits: [],
    description: 'Entre dans les boyaux en premier. En ressort rarement propre.',
  },
  sergent: {
    id: 'sergent',
    label: 'Sergent',
    role: 'Commandement',
    hp: 46,
    armor: 0.12,
    speed: 2.3,
    skill: 0.8,
    morale: 82,
    discipline: 0.85,
    vision: 16,
    weapon: 'rifle_semi',
    abilities: ['rally'],
    charges: { rally: 3 },
    traits: [],
    description: "Sa voix tient un flanc entier. Sa mort le fait s'effondrer.",
  },
  observateur: {
    id: 'observateur',
    label: 'Observateur d\'artillerie',
    role: 'Appui feu',
    hp: 36,
    armor: 0.06,
    speed: 2.4,
    skill: 0.7,
    morale: 68,
    discipline: 0.7,
    vision: 24,
    weapon: 'rifle_semi',
    abilities: ['artillery'],
    charges: { artillery: 2 },
    traits: ['marksman'],
    description: 'Porte la radio du Grand Moteur. Désigne, et le ciel tombe.',
  },
  predicateur: {
    id: 'predicateur',
    label: 'Prédicateur de la Cendre',
    role: 'Commandement',
    faction: 'penitents',
    hp: 44,
    armor: 0.05,
    speed: 2.2,
    skill: 0.7,
    morale: 95,
    discipline: 1.0,
    vision: 16,
    weapon: 'rifle_semi',
    abilities: ['rally'],
    charges: { rally: 3 },
    traits: [],
    description: 'Crie plus fort que les obus. Rallie les pénitents jusqu\'au dernier souffle.',
  },
  flagellant: {
    id: 'flagellant',
    label: 'Flagellant',
    role: 'Choc',
    faction: 'penitents',
    hp: 34,
    armor: 0.0,
    speed: 3.2,
    skill: 0.8,
    morale: 100,
    discipline: 1.0,
    vision: 14,
    weapon: 'melee_pick',
    abilities: ['charge'],
    charges: { charge: 2 },
    traits: ['fearless', 'shock'],
    description: 'Cherche la mort en la donnant. Aucune mitrailleuse ne le fait reculer longtemps.',
  },
  frere_engin: {
    id: 'frere_engin',
    label: "Frère de l'Engin",
    role: 'Choc',
    faction: 'marteau',
    hp: 60,
    armor: 0.35,
    speed: 2.2,
    skill: 0.75,
    morale: 88,
    discipline: 0.9,
    vision: 14,
    weapon: 'melee_pick',
    abilities: ['charge'],
    charges: { charge: 2 },
    traits: ['shock'],
    description: "Cuirassé de plaques de chaudière. Avance sous les balles comme sous la pluie.",
  },
  sentinelle: {
    id: 'sentinelle',
    label: 'Sentinelle mécanisée',
    role: 'Appui lourd',
    faction: 'marteau',
    hp: 90,
    armor: 0.45,
    speed: 1.4,
    skill: 0.6,
    morale: 100,
    discipline: 1.0,
    vision: 16,
    weapon: 'lmg_grinder',
    abilities: [],
    charges: {},
    traits: ['mechanical'],
    description: "Marcheur à vapeur. Lent, increvable, et il ne connaît pas la peur.",
  },
};

export const UNIT_IDS = Object.keys(UNITS);

export function unitDef(id: string): UnitDef {
  const def = UNITS[id];
  if (!def) throw new Error(`Unité inconnue: ${id}`);
  return def;
}
