import type { FactionId } from '../core/ids';

/** Capacités activables en jeu. */
export type AbilityId = 'grenade' | 'artillery' | 'rally' | 'charge' | 'heal';

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
  /** Abréviation facultative affichée au-dessus du soldat. */
  roleBadge?: string;
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
  creature: {
    id: 'creature', label: 'Créature', role: 'Menace indépendante', roleBadge: '!',
    hp: 200, armor: 0.15, speed: 2.6, skill: 1, morale: 100, discipline: 1, vision: 25,
    weapon: 'creature_claw', abilities: [], charges: {}, traits: ['mechanical', 'shock'],
    description: 'Une créature hostile aux deux camps. Elle attaque au contact.',
  },
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
  modern_fighter: {
    id: 'modern_fighter', label: 'Combattant', role: 'Polyvalent', roleBadge: 'S', hp: 50, armor: 0.1,
    speed: 2.3, skill: 0.85, morale: 70, discipline: 0.6, vision: 14,
    weapon: 'unarmed', abilities: [], charges: {}, traits: [],
    description: 'Combat à mains nues en attendant son équipement.',
  },
  modern_melee_leader: {
    id: 'modern_melee_leader', label: 'Chef de groupe', role: 'Commandement', roleBadge: 'C', hp: 52, armor: 0.12,
    speed: 2.3, skill: 0.85, morale: 80, discipline: 0.8, vision: 16,
    weapon: 'unarmed', abilities: ['rally'], charges: { rally: 3 }, traits: [],
    description: 'Peut rallier ses camarades démoralisés avec la commande Ralliement.',
  },
  modern_assault_melee: {
    id: 'modern_assault_melee', label: 'Assaut', role: 'Attaque rapide', roleBadge: 'A', hp: 44, armor: 0.07,
    speed: 2.7, skill: 1.0, morale: 72, discipline: 0.55, vision: 14,
    weapon: 'unarmed', abilities: [], charges: {}, traits: [],
    description: 'Rapide et précis au contact, mais moins résistant.',
  },
  modern_defender: {
    id: 'modern_defender', label: 'Défenseur', role: 'Résistance', roleBadge: 'D', hp: 68, armor: 0.22,
    speed: 1.75, skill: 0.75, morale: 78, discipline: 0.8, vision: 13,
    weapon: 'unarmed', abilities: [], charges: {}, traits: [],
    description: 'Encaisse davantage de coups, mais se déplace plus lentement.',
  },
  modern_recon_melee: {
    id: 'modern_recon_melee', label: 'Éclaireur', role: 'Reconnaissance', roleBadge: 'E', hp: 38, armor: 0.04,
    speed: 3.0, skill: 0.75, morale: 65, discipline: 0.5, vision: 21,
    weapon: 'unarmed', abilities: [], charges: {}, traits: [],
    description: 'Se déplace vite et détecte les ennemis plus loin, mais reste fragile.',
  },
  modern_medic: {
    id: 'modern_medic', label: 'Médecin', role: 'Soutien', roleBadge: '+', hp: 42, armor: 0.06,
    speed: 2.2, skill: 0.65, morale: 68, discipline: 0.6, vision: 14,
    weapon: 'unarmed', abilities: ['heal'], charges: { heal: 3 }, traits: [],
    description: 'Soigne automatiquement un allié blessé proche quand il est disponible : 3 soins par bataille.',
  },
  modern_blade: {
    id: 'modern_blade', label: 'Combattant à la lame', role: 'Mêlée', roleBadge: 'L', hp: 58, armor: 0.12,
    speed: 2.5, skill: 0.8, morale: 75, discipline: 0.7, vision: 15,
    weapon: 'modern_sword', abilities: [], charges: {}, traits: ['shock'],
    description: 'Combat au contact avec une lame et des frappes orientées.',
  },
  modern_pistol_fighter: {
    id: 'modern_pistol_fighter', label: 'Combattant au pistolet', role: 'Infanterie', roleBadge: 'P', hp: 54, armor: 0.10,
    speed: 2.4, skill: 0.75, morale: 70, discipline: 0.6, vision: 15,
    weapon: 'modern_pistol', abilities: [], charges: {}, traits: [],
    description: 'Combat à courte portée avec un pistolet.',
  },
  modern_rifleman: {
    id: 'modern_rifleman', label: 'Fusilier', role: 'Infanterie', roleBadge: 'F', hp: 42, armor: 0.12,
    speed: 2.2, skill: 0.75, morale: 65, discipline: 0.55, vision: 14,
    weapon: 'modern_rifle', abilities: [], charges: {}, traits: [],
    description: 'Soldat polyvalent équipé d’un fusil d’assaut.',
  },
  modern_leader: {
    id: 'modern_leader', label: 'Chef de groupe', role: 'Commandement', hp: 46, armor: 0.15,
    speed: 2.3, skill: 0.8, morale: 80, discipline: 0.8, vision: 16,
    weapon: 'modern_rifle', abilities: ['rally'], charges: { rally: 3 }, traits: [],
    description: 'Coordonne les troupes et peut rallier les soldats proches.',
  },
  modern_grenadier: {
    id: 'modern_grenadier', label: 'Grenadier', role: 'Assaut', roleBadge: 'G', hp: 42, armor: 0.12,
    speed: 2.2, skill: 0.72, morale: 65, discipline: 0.55, vision: 14,
    weapon: 'modern_rifle', abilities: ['grenade'], charges: { grenade: 3 }, traits: [],
    description: 'Utilise des grenades pour déloger les ennemis à couvert.',
  },
  modern_gunner: {
    id: 'modern_gunner', label: 'Mitrailleur', role: 'Appui', hp: 44, armor: 0.15,
    speed: 1.8, skill: 0.65, morale: 64, discipline: 0.7, vision: 15,
    weapon: 'modern_lmg', abilities: [], charges: {}, traits: [],
    description: 'Fixe les adversaires par le feu de suppression.',
  },
  modern_marksman: {
    id: 'modern_marksman', label: 'Tireur de précision', role: 'Tir longue portée', hp: 38, armor: 0.1,
    speed: 2, skill: 0.95, morale: 68, discipline: 0.65, vision: 22,
    weapon: 'modern_sniper', abilities: [], charges: {}, traits: ['marksman'],
    description: 'Engage les cibles prioritaires à longue distance.',
  },
  modern_observer: {
    id: 'modern_observer', label: 'Observateur avancé', role: 'Appui feu', hp: 38, armor: 0.1,
    speed: 2.3, skill: 0.7, morale: 68, discipline: 0.7, vision: 24,
    weapon: 'modern_rifle', abilities: ['artillery'], charges: { artillery: 2 }, traits: [],
    description: 'Désigne les objectifs pour l’artillerie hors carte.',
  },
  modern_scout: {
    id: 'modern_scout', label: 'Éclaireur', role: 'Reconnaissance', hp: 36, armor: 0.08,
    speed: 2.8, skill: 0.7, morale: 65, discipline: 0.5, vision: 22,
    weapon: 'modern_rifle', abilities: [], charges: {}, traits: ['shock'],
    description: 'Rapide et doté d’une longue portée de détection.',
  },
};

export const UNIT_IDS = Object.keys(UNITS);

export function unitDef(id: string): UnitDef {
  const def = UNITS[id];
  if (!def) throw new Error(`Unité inconnue: ${id}`);
  return def;
}
