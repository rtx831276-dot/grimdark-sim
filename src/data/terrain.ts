/**
 * Table des terrains — source unique de vérité pour le gameplay ET le rendu.
 *
 * Ajouter un terrain = ajouter une entrée ici + un glyphe dans la légende d'une carte.
 * Les valeurs de gameplay sont volontairement regroupées dans ce fichier pour que
 * l'équilibrage se fasse sans toucher à la simulation.
 */

export type TerrainId =
  | 'mud' // boue, terrain vague
  | 'road' // route pavée
  | 'crater' // cratère d'obus (couverture moyenne)
  | 'trench' // tranchée (forte couverture)
  | 'sandbag' // sacs de sable / parapet
  | 'rubble' // ruines, gravats (couverture moyenne, destructible)
  | 'wall' // mur de ruine (bloque la vue, destructible)
  | 'churchWall' // mur d'église (bloque la vue, très résistant)
  | 'tower' // beffroi (bloque la vue, quasi indestructible)
  | 'churchFloor' // dalle d'église
  | 'door' // porte (passage, bloque partiellement la vue)
  | 'grave' // pierre tombale
  | 'fence' // clôture / grillage
  | 'water' // boue inondée
  | 'tree' // arbre mort (bloque la vue, destructible);

export interface TerrainDef {
  id: TerrainId;
  label: string;
  /** Bloque le déplacement ET la ligne de vue. */
  solid: boolean;
  /** Couverture pour l'unité qui se tient SUR la tuile (0..1). */
  tileCover: number;
  /** Couverture pour les unités dont la LIGNE DE VUE traverse la tuile (0..1). */
  losCover: number;
  /** Multiplicateur de coût de déplacement (1 = normal, >1 = lent). */
  moveCost: number;
  /** Points de structure. 0 = indestructible. */
  hp: number;
  /** Terrain de remplacement quand la structure tombe à 0. */
  becomes: TerrainId | null;
  /** Hauteur d'extrusion visuelle (en hauteur de tuile). 0 = plat. */
  height: number;
  /** Couleur de base du rendu. */
  color: string;
  /** Couleur du dessus (léger dégradé de rendu). */
  topColor: string;
}

export const TERRAIN: Record<TerrainId, TerrainDef> = {
  mud: {
    id: 'mud',
    label: 'Boue',
    solid: false,
    tileCover: 0.05,
    losCover: 0,
    moveCost: 1,
    hp: 0,
    becomes: null,
    height: 0,
    color: '#3f3a2a',
    topColor: '#4a4432',
  },
  road: {
    id: 'road',
    label: 'Route pavée',
    solid: false,
    tileCover: 0.02,
    losCover: 0,
    moveCost: 0.85,
    hp: 0,
    becomes: null,
    height: 0,
    color: '#4c4a45',
    topColor: '#57554f',
  },
  crater: {
    id: 'crater',
    label: 'Cratère',
    solid: false,
    tileCover: 0.38,
    losCover: 0.2,
    moveCost: 1.35,
    hp: 0,
    becomes: null,
    height: 0,
    color: '#332c20',
    topColor: '#3b3325',
  },
  trench: {
    id: 'trench',
    label: 'Tranchée',
    solid: false,
    tileCover: 0.78,
    losCover: 0.45,
    moveCost: 1.55,
    hp: 0,
    becomes: null,
    height: 0,
    color: '#2c2a1c',
    topColor: '#34321f',
  },
  sandbag: {
    id: 'sandbag',
    label: 'Sacs de sable',
    solid: false,
    tileCover: 0.8,
    losCover: 0.5,
    moveCost: 1.7,
    hp: 90,
    becomes: 'mud',
    height: 0.35,
    color: '#6a6046',
    topColor: '#786d50',
  },
  rubble: {
    id: 'rubble',
    label: 'Ruines',
    solid: false,
    tileCover: 0.46,
    losCover: 0.45,
    moveCost: 1.5,
    hp: 140,
    becomes: 'crater',
    height: 0.3,
    color: '#5d584c',
    topColor: '#6b6558',
  },
  wall: {
    id: 'wall',
    label: 'Mur de ruine',
    solid: true,
    tileCover: 0,
    losCover: 1,
    moveCost: Number.POSITIVE_INFINITY,
    hp: 160,
    becomes: 'rubble',
    height: 1.5,
    color: '#6f6a5d',
    topColor: '#7d7768',
  },
  churchWall: {
    id: 'churchWall',
    label: "Mur d'église",
    solid: true,
    tileCover: 0,
    losCover: 1,
    moveCost: Number.POSITIVE_INFINITY,
    hp: 460,
    becomes: 'rubble',
    height: 2.4,
    color: '#7b7566',
    topColor: '#8a8374',
  },
  tower: {
    id: 'tower',
    label: 'Beffroi',
    solid: true,
    tileCover: 0,
    losCover: 1,
    moveCost: Number.POSITIVE_INFINITY,
    hp: 1400,
    becomes: 'rubble',
    height: 4.2,
    color: '#847e6f',
    topColor: '#948d7c',
  },
  churchFloor: {
    id: 'churchFloor',
    label: "Dalle d'église",
    solid: false,
    tileCover: 0.32,
    losCover: 0.25,
    moveCost: 1,
    hp: 0,
    becomes: null,
    height: 0,
    color: '#5a5346',
    topColor: '#655d4e',
  },
  door: {
    id: 'door',
    label: 'Porte',
    solid: false,
    tileCover: 0.3,
    losCover: 0.55,
    moveCost: 1.2,
    hp: 70,
    becomes: 'rubble',
    height: 0.9,
    color: '#4a3a28',
    topColor: '#55432d',
  },
  grave: {
    id: 'grave',
    label: 'Pierre tombale',
    solid: false,
    tileCover: 0.32,
    losCover: 0.3,
    moveCost: 1.4,
    hp: 60,
    becomes: 'rubble',
    height: 0.4,
    color: '#66615a',
    topColor: '#736d64',
  },
  fence: {
    id: 'fence',
    label: 'Clôture',
    solid: false,
    tileCover: 0.22,
    losCover: 0.22,
    moveCost: 2.1,
    hp: 40,
    becomes: 'mud',
    height: 0.6,
    color: '#453a2a',
    topColor: '#514434',
  },
  water: {
    id: 'water',
    label: 'Boue inondée',
    solid: false,
    tileCover: 0,
    losCover: 0,
    moveCost: 3.1,
    hp: 0,
    becomes: null,
    height: 0,
    color: '#2b3634',
    topColor: '#33413e',
  },
  tree: {
    id: 'tree',
    label: 'Arbre mort',
    solid: true,
    tileCover: 0,
    losCover: 1,
    moveCost: Number.POSITIVE_INFINITY,
    hp: 70,
    becomes: 'rubble',
    height: 1.8,
    color: '#3a3126',
    topColor: '#463b2c',
  },
};

export const TERRAIN_IDS = Object.keys(TERRAIN) as TerrainId[];

export function terrain(id: TerrainId): TerrainDef {
  return TERRAIN[id];
}
