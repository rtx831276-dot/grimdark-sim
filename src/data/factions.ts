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
  creature: {
    id: 'creature', name: 'Créature', shortName: 'Créature', creed: 'Menace indépendante',
    color: '#9b303d', colorDark: '#39171d', colorBright: '#ff7280',
    deployment: { x: 20, y: 14, w: 6, h: 7 }, roster: [], doctrine: 'Hostile aux deux forces.',
  },
  penitents: {
    id: 'penitents',
    name: 'Force Aegis',
    shortName: 'Aegis',
    creed: 'Groupe tactique · secteur ouest',
    color: '#b89c65',
    colorDark: '#55452d',
    colorBright: '#e5c68c',
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
      "Infanterie polyvalente, appuyée par des spécialistes et un observateur.",
  },
  marteau: {
    id: 'marteau',
    name: 'Force Vostok',
    shortName: 'Vostok',
    creed: 'Groupe tactique · secteur est',
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
      "Infanterie et armes de soutien : fixer l’adversaire avant de progresser.",
  },
};

// Les deux armées seules participent au tableau de score et aux conditions de victoire.
export const FACTION_IDS: FactionId[] = ['penitents', 'marteau'];

export function factionDef(id: FactionId): FactionDef {
  const def = FACTIONS[id];
  if (!def) throw new Error(`Faction inconnue: ${id}`);
  return def;
}

/** Nombre total d'unités que déploie une faction (10 à 15 visés en V0/V1). */
export function rosterSize(id: FactionId): number {
  return factionDef(id).roster.reduce((sum, entry) => sum + entry.count, 0);
}
