import type { FactionId } from '../core/ids';

export interface FactionDef {
  id: FactionId;
  name: string;
  shortName: string;
  creed: string;
  /** Couleurs de rendu (unités + HUD). */
  color: string;
  colorDark: string;
  colorBright: string;
  /** Zone de déploiement par défaut sur une carte : x, y, largeur, hauteur en tuiles. */
  deployment: { x: number; y: number; w: number; h: number };
  /** Composition d'armée : id d'archétype -> nombre d'unités. */
  roster: Array<{ unit: string; count: number }>;
  doctrine: string;
}

export const FACTIONS: Record<FactionId, FactionDef> = {
  penitents: {
    id: 'penitents',
    name: 'Les Pénitents de la Cendre',
    shortName: 'Pénitents',
    creed: 'La cendre lave. Le rempart protège. Le doute est une trahison.',
    color: '#b4623a',
    colorDark: '#5d2f1a',
    colorBright: '#e08a52',
    deployment: { x: 2, y: 4, w: 6, h: 26 },
    roster: [
      { unit: 'sergent', count: 1 },
      { unit: 'predicateur', count: 1 },
      { unit: 'observateur', count: 1 },
      { unit: 'fusilier', count: 3 },
      { unit: 'tireur_verrou', count: 1 },
      { unit: 'mitrailleur', count: 1 },
      { unit: 'grenadier', count: 1 },
      { unit: 'eclaireur', count: 1 },
      { unit: 'sapeur', count: 1 },
      { unit: 'milice', count: 1 },
      { unit: 'flagellant', count: 1 },
    ],
    doctrine:
      "Vagues humaines précédées de fanatiques. Excellent moral, discipline moyenne : il faut tuer leurs sergents et leurs prédicateurs pour que la ligne cède.",
  },
  marteau: {
    id: 'marteau',
    name: "Ordre du Marteau Noir",
    shortName: 'Marteau',
    creed: "Ce que l'Engin n'a pas forgé ne mérite pas de tenir.",
    color: '#4a7f9c',
    colorDark: '#20394a',
    colorBright: '#79b0cb',
    deployment: { x: 36, y: 4, w: 6, h: 26 },
    roster: [
      { unit: 'sergent', count: 1 },
      { unit: 'frere_engin', count: 1 },
      { unit: 'observateur', count: 1 },
      { unit: 'fusilier', count: 3 },
      { unit: 'tireur_verrou', count: 1 },
      { unit: 'mitrailleur', count: 2 },
      { unit: 'grenadier', count: 1 },
      { unit: 'eclaireur', count: 1 },
      { unit: 'sentinelle', count: 1 },
      { unit: 'milice', count: 1 },
    ],
    doctrine:
      "Feu écrasant et marcheurs mécanisés. Peu d'hommes, beaucoup de plomb : ils gagnent en clouant l'adversaire au sol, puis en avançant sous couvert de la mitraille.",
  },
};

export const FACTION_IDS = Object.keys(FACTIONS) as FactionId[];

export function factionDef(id: FactionId): FactionDef {
  const def = FACTIONS[id];
  if (!def) throw new Error(`Faction inconnue: ${id}`);
  return def;
}

/** Nombre total d'unités que déploie une faction (10 à 15 visés en V0/V1). */
export function rosterSize(id: FactionId): number {
  return factionDef(id).roster.reduce((sum, entry) => sum + entry.count, 0);
}
