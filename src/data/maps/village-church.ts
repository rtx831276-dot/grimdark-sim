import type { MapDefinition } from '../map-types';

/**
 * « Le Hameau de la Cloche » — carte d'assaut V0.
 *
 * Lecture de la carte (largeur 44, hauteur 34) :
 *   - colonnes 0..8   : arrière des Pénitents (routes, gravats, arbres morts)
 *   - colonnes 9..11  : ligne de tranchées des Pénitents (sacs de sable en col. 11)
 *   - colonnes 12..32 : no man's land labouré d'obus, hameau ruiné, cimetière et église
 *   - colonnes 33..35 : ligne de tranchées de l'Ordre du Marteau (sacs en col. 33)
 *   - colonnes 36..43 : arrière de l'Ordre
 *
 * Points durs :
 *   - l'église (H) occupe cols 20..26 / lignes 5..11, avec son beffroi (t) au nord-ouest
 *     et une porte (+) au sud : c'est l'objectif central, tenable mais rasable à l'artillerie.
 *   - le cimetière clos (f) est à l'ouest de l'église (cols 13..17, lignes 3..8).
 *   - la Grand-Rue (=) traverse la carte en lignes 17..18 : axe d'assaut rapide, donc exposé.
 *
 * Modifier la carte = modifier ces rangées. Les lignes plus courtes sont complétées par de
 * la boue, les lignes plus longues sont tronquées : pas de risque de casser la grille.
 */
export const VILLAGE_CHURCH: MapDefinition = {
  id: 'village-church',
  name: 'Le Hameau de la Cloche',
  briefing:
    "Un hameau déjà mort, une église encore debout, deux lignes de tranchées creusées dans la même boue. L'Ordre du Marteau veut la nef pour y installer son poste d'observation ; les Pénitents refusent de céder un mètre de terrain consacré. L'artillerie décidera qui a raison.",
  width: 44,
  height: 34,
  legend: {
    '.': 'mud',
    '=': 'road',
    o: 'crater',
    T: 'trench',
    '"': 'sandbag',
    r: 'rubble',
    '#': 'wall',
    H: 'churchWall',
    t: 'tower',
    _: 'churchFloor',
    '+': 'door',
    c: 'grave',
    f: 'fence',
    w: 'water',
    A: 'tree',
  },
  rows: [
    '..A......TT"......A.............A"TT........',
    '...A.....TT"..........A.........."TT....A...',
    '.A.......TT"...............A....."TT........',
    '....A....TT"..fffff............A."TT......A.',
    '.........TT"..fcccf.............."TT........',
    '..rr.....TT"..fcccf.ttHHHHH......"TT....A...',
    '..rr.....TT"..fcccf.tt____H......"TT........',
    '..o......TT"..fcccf.H_____H.####."TT..o.....',
    '.........TT"..fffff.H_____H.#rr#."TT........',
    '..A......TT".A......H_____H.#+##."TT.....A..',
    '.........TT".........H_____H....A"TT........',
    '.........TT"........HHH+HHH......"TT........',
    '.........TT"...........==........"TT..A.....',
    '..o......TT"..rr....o..==....o..."TT......o.',
    '.........TT".####......==.####..."TT........',
    '..A......TT".#rr#......==.#rr#..."TT........',
    '.........TT".#+##......==.#+##..."TT...A....',
    '=========TT"====================="TT========',
    '=========TT"====================="TT========',
    '..o......TT"..o....o........o...."TT....o...',
    '..rr.....TT"..####...........####"TT........',
    '..rr.....TT"..#rr#...........#rr#"TT..A.....',
    '.........TT"..#+##...........#+##"TT........',
    '.A.......TT"....o...........o...."TT........',
    '.........TT"..w.....o.........o.."TT..o.....',
    '..o......TT"..........rrr........"TT........',
    '.........TT".......o.....o......."TT........',
    '.........TT"...A.........A......."TT..A.....',
    '..A......TT"....o......o........."TT........',
    '.........TT"......w......o......."TT........',
    '.........TT"..........A.........."TT........',
    '............o...........o...................',
    '............................................',
    '..A...............A...............A........',
  ],
  scatter: {
    seed: 20361,
    region: { x: 12, y: 3, w: 21, h: 28 },
    craters: 16,
    rubble: 12,
    trees: 8,
    water: 5,
  },
  objectives: [
    { id: 'nave', label: "Nef de l'église", x: 23, y: 8, radius: 4, value: 4 },
    { id: 'belfry', label: 'Beffroi', x: 20.5, y: 5.5, radius: 2, value: 2 },
    { id: 'crossroads', label: 'Croisement de la Grand-Rue', x: 23, y: 17.5, radius: 3, value: 3 },
    { id: 'graveyard', label: 'Cimetière', x: 15.5, y: 5.5, radius: 2.5, value: 1 },
    { id: 'house_west', label: 'Ferme ouest', x: 15.5, y: 21, radius: 2, value: 1 },
    { id: 'house_east', label: 'Ferme est', x: 30.5, y: 21, radius: 2, value: 1 },
    { id: 'ruin_north', label: 'Réservoir nord', x: 29.5, y: 8, radius: 2, value: 1 },
  ],
  deployment: {
    penitents: { x: 2, y: 4, w: 6, h: 26 },
    marteau: { x: 36, y: 4, w: 6, h: 26 },
  },
  fallbackLine: {
    penitents: { x: 3, y: 17 },
    marteau: { x: 41, y: 17 },
  },
};
