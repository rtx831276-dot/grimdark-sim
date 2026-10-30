/**
 * Définition des armes. Modifier une valeur ici change immédiatement le gameplay
 * de toutes les unités qui utilisent l'arme (aucune donnée en dur dans la simulation).
 */

export type WeaponKind = 'rifle' | 'pistol' | 'lmg' | 'smg' | 'shotgun' | 'sniper' | 'melee' | 'grenade' | 'artillery';

export interface WeaponDef {
  id: string;
  label: string;
  kind: WeaponKind;
  /** Portée maximale en tuiles. */
  range: number;
  /** Portée où l'arme est la plus précise. */
  optimalRange: number;
  /** Précision de base 0..1 (unité immobile, cible à découvert, à portée optimale). */
  accuracy: number;
  /** Dégâts par projectile. */
  damage: number;
  /** Pénétration d'armure 0..1 (1 = ignore l'armure). */
  armorPen: number;
  /** Projectiles par salve. */
  burst: number;
  /** Secondes entre deux salves. */
  cooldown: number;
  /** Nombre de salves tirées avant de devoir recharger (0 = jamais). */
  reloadEvery: number;
  /** Durée du rechargement, en secondes. Crée les accalmies du champ de bataille. */
  reloadTime: number;
  /** Suppression infligée par projectile qui passe près de la cible. */
  suppression: number;
  /** Munitions. -1 = illimité (corps à corps, artillerie). */
  ammo: number;
  /** Rayon d'explosion en tuiles (0 = impact simple). */
  splashRadius: number;
  /** Dégâts d'explosion au centre (dégressifs avec la distance). */
  splashDamage: number;
  /** Dégâts infligés aux structures dans le rayon. */
  tileDamage: number;
  /** Temps de vol d'une arme à arc (secondes). 0 = tir direct. */
  arcTime: number;
  /** Nombre de projectiles par frappe d'artillerie. */
  shellsPerStrike: number;
  /** Dispersion à l'impact (tuiles). */
  scatter: number;
  description: string;
}

export const WEAPONS: Record<string, WeaponDef> = {
  creature_claw: {
    id: 'creature_claw', label: 'Griffes', kind: 'melee', range: 1.6, optimalRange: 1.6,
    accuracy: 0.9, damage: 24, armorPen: 0.4, burst: 1, cooldown: 1.4,
    reloadEvery: 0, reloadTime: 0, suppression: 10, ammo: -1, splashRadius: 0,
    splashDamage: 0, tileDamage: 0, arcTime: 0, shellsPerStrike: 0, scatter: 0,
    description: 'Attaque de contact de la créature.',
  },
  rifle_semi: {
    id: 'rifle_semi',
    label: 'Fusil semi-auto Vrille',
    kind: 'rifle',
    range: 12,
    optimalRange: 6,
    accuracy: 0.34,
    damage: 8,
    armorPen: 0.25,
    burst: 2,
    cooldown: 1.5,
    reloadEvery: 6,
    reloadTime: 2.2,
    suppression: 6,
    ammo: 90,
    splashRadius: 0,
    splashDamage: 0,
    tileDamage: 0,
    arcTime: 0,
    shellsPerStrike: 0,
    scatter: 0,
    description: 'Arme de dotation. Polyvalente, sans éclat.',
  },
  rifle_bolt: {
    id: 'rifle_bolt',
    label: 'Fusil à verrou Mle-9',
    kind: 'rifle',
    range: 15,
    optimalRange: 9,
    accuracy: 0.5,
    damage: 22,
    armorPen: 0.4,
    burst: 1,
    cooldown: 2.2,
    reloadEvery: 5,
    reloadTime: 2.6,
    suppression: 8,
    ammo: 60,
    splashRadius: 0,
    splashDamage: 0,
    tileDamage: 0,
    arcTime: 0,
    shellsPerStrike: 0,
    scatter: 0,
    description: 'Lent, précis, punitif à moyenne portée.',
  },
  smg_ash: {
    id: 'smg_ash',
    label: 'PM Cendre',
    kind: 'smg',
    range: 6,
    optimalRange: 3,
    accuracy: 0.32,
    damage: 5,
    armorPen: 0.1,
    burst: 5,
    cooldown: 1.2,
    reloadEvery: 5,
    reloadTime: 1.8,
    suppression: 5,
    ammo: 120,
    splashRadius: 0,
    splashDamage: 0,
    tileDamage: 0,
    arcTime: 0,
    shellsPerStrike: 0,
    scatter: 0,
    description: "Déluge de balles, redoutable à bout portant, sature l'adversaire.",
  },
  shotgun_trench: {
    id: 'shotgun_trench',
    label: 'Fusil de tranchée',
    kind: 'shotgun',
    range: 4,
    optimalRange: 2,
    accuracy: 0.6,
    damage: 26,
    armorPen: 0.5,
    burst: 1,
    cooldown: 2,
    reloadEvery: 4,
    reloadTime: 2.4,
    suppression: 14,
    ammo: 30,
    splashRadius: 0,
    splashDamage: 0,
    tileDamage: 12,
    arcTime: 0,
    shellsPerStrike: 0,
    scatter: 0,
    description: 'Nettoie un boyau. Inutile au-delà de quelques mètres.',
  },
  lmg_grinder: {
    id: 'lmg_grinder',
    label: 'Mitrailleuse Broyeuse',
    kind: 'lmg',
    range: 16,
    optimalRange: 9,
    accuracy: 0.22,
    damage: 6,
    armorPen: 0.3,
    burst: 7,
    cooldown: 2.6,
    reloadEvery: 8,
    reloadTime: 4.2,
    suppression: 11,
    ammo: 300,
    splashRadius: 0,
    splashDamage: 0,
    tileDamage: 6,
    arcTime: 0,
    shellsPerStrike: 0,
    scatter: 0,
    description: "Moins de dégâts qu'elle n'écrase : c'est une arme de suppression.",
  },
  sniper_longvue: {
    id: 'sniper_longvue',
    label: 'Long-Vue',
    kind: 'sniper',
    range: 24,
    optimalRange: 17,
    accuracy: 0.52,
    damage: 38,
    armorPen: 0.7,
    burst: 1,
    cooldown: 3.6,
    reloadEvery: 3,
    reloadTime: 3,
    suppression: 10,
    ammo: 24,
    splashRadius: 0,
    splashDamage: 0,
    tileDamage: 8,
    arcTime: 0,
    shellsPerStrike: 0,
    scatter: 0,
    description: 'Un coup, une mort. Très sensible à la suppression.',
  },
  melee_pick: {
    id: 'melee_pick',
    label: 'Pioche de guerre',
    kind: 'melee',
    range: 1.4,
    optimalRange: 1,
    accuracy: 0.78,
    damage: 21,
    armorPen: 0.75,
    burst: 2,
    cooldown: 1.5,
    reloadEvery: 0,
    reloadTime: 0,
    suppression: 16,
    ammo: -1,
    splashRadius: 0,
    splashDamage: 0,
    tileDamage: 4,
    arcTime: 0,
    shellsPerStrike: 0,
    scatter: 0,
    description: 'Corps à corps. Ignore la couverture de la cible (contact).',
  },
  grenade_frag: {
    id: 'grenade_frag',
    label: 'Grenade à fragmentation',
    kind: 'grenade',
    range: 11,
    optimalRange: 6,
    accuracy: 1,
    damage: 0,
    armorPen: 0.4,
    burst: 1,
    cooldown: 2,
    reloadEvery: 0,
    reloadTime: 0,
    suppression: 30,
    ammo: -1,
    splashRadius: 2.6,
    splashDamage: 38,
    tileDamage: 95,
    arcTime: 1.3,
    shellsPerStrike: 0,
    scatter: 0.7,
    description: "Passe au-dessus des obstacles assez bas, rebondit sur les obstacles trop hauts et explose après sa mèche.",
  },
  artillery_barrage: {
    id: 'artillery_barrage',
    label: 'Barrage d’artillerie',
    kind: 'artillery',
    range: 999,
    optimalRange: 999,
    accuracy: 1,
    damage: 0,
    armorPen: 0.55,
    burst: 1,
    cooldown: 8,
    reloadEvery: 0,
    reloadTime: 0,
    suppression: 45,
    ammo: -1,
    splashRadius: 3,
    splashDamage: 42,
    tileDamage: 230,
    arcTime: 6,
    shellsPerStrike: 5,
    scatter: 1.8,
    description: "Frappe hors-carte demandée par un observateur. Détruit les murs et les couverts.",
  },
  unarmed: {
    id: 'unarmed', label: 'Combat à mains nues', kind: 'melee',
    range: 1.3, optimalRange: 1, accuracy: 0.78, damage: 11, armorPen: 0.45,
    burst: 1, cooldown: 0.9, reloadEvery: 0, reloadTime: 0, suppression: 0,
    ammo: -1, splashRadius: 0, splashDamage: 0, tileDamage: 0, arcTime: 0,
    shellsPerStrike: 0, scatter: 0, description: 'Frappe au contact, sans arme à feu.',
  },
  modern_pistol: {
    id: 'modern_pistol', label: 'Pistolet', kind: 'pistol',
    range: 8, optimalRange: 4, accuracy: 0.4, damage: 11, armorPen: 0.2,
    burst: 1, cooldown: 1.0, reloadEvery: 8, reloadTime: 1.8, suppression: 4,
    ammo: 80, splashRadius: 0, splashDamage: 0, tileDamage: 0, arcTime: 0,
    shellsPerStrike: 0, scatter: 0, description: 'Arme de poing, courte portée.',
  },
  modern_sword: {
    id: 'modern_sword', label: 'Lame', kind: 'melee',
    range: 1.7, optimalRange: 1.3, accuracy: 1, damage: 13, armorPen: 0.5,
    burst: 1, cooldown: 1, reloadEvery: 0, reloadTime: 0, suppression: 0,
    ammo: -1, splashRadius: 0, splashDamage: 0, tileDamage: 0, arcTime: 0,
    shellsPerStrike: 0, scatter: 0, description: 'Lame de contact, frappe avec une hitbox orientée.',
  },
  modern_rifle: {
      id: 'modern_rifle', label: 'Fusil d’assaut 5,56 mm', kind: 'rifle',
      range: 13, optimalRange: 7, accuracy: 0.32, damage: 8, armorPen: 0.25,
      burst: 3, cooldown: 1.4, reloadEvery: 10, reloadTime: 2.2, suppression: 6,
      ammo: 120, splashRadius: 0, splashDamage: 0, tileDamage: 0, arcTime: 0,
      shellsPerStrike: 0, scatter: 0, description: 'Arme polyvalente pour les engagements à moyenne portée.',
  },
  modern_sniper: {
    id: 'modern_sniper', label: 'Fusil de précision 7,62 mm', kind: 'sniper',
    range: 22, optimalRange: 15, accuracy: 0.52, damage: 32, armorPen: 0.55,
    burst: 1, cooldown: 3.3, reloadEvery: 5, reloadTime: 2.8, suppression: 9,
    ammo: 40, splashRadius: 0, splashDamage: 0, tileDamage: 2, arcTime: 0,
    shellsPerStrike: 0, scatter: 0, description: 'Tir précis à longue portée, cadence lente.',
  },
  modern_lmg: {
    id: 'modern_lmg', label: 'Mitrailleuse légère 5,56 mm', kind: 'lmg',
    range: 16, optimalRange: 9, accuracy: 0.22, damage: 6, armorPen: 0.3,
    burst: 7, cooldown: 2.5, reloadEvery: 8, reloadTime: 4.2, suppression: 10,
    ammo: 300, splashRadius: 0, splashDamage: 0, tileDamage: 4, arcTime: 0,
    shellsPerStrike: 0, scatter: 0, description: 'Appui automatique efficace pour fixer les ennemis.',
  },
};

export function weapon(id: string): WeaponDef {
  const def = WEAPONS[id];
  if (!def) throw new Error(`Arme inconnue: ${id}`);
  return def;
}
