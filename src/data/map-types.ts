import type { FactionId, Vec2 } from '../core/ids';
import type { TerrainId } from './terrain';

/** Point d'intérêt tactique : sert à l'IA (objectif d'avance) et au décompte de victoire. */
export interface ObjectiveDef {
  id: string;
  label: string;
  x: number;
  y: number;
  /** Rayon de contrôle en tuiles. */
  radius: number;
  /** Poids dans le score de victoire. */
  value: number;
}

/** Zone de déploiement d'une faction sur la carte. */
export interface DeploymentZone {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Définition d'une carte, écrite « à la main » en ASCII : c'est le format le plus rapide
 * à éditer pour un humain comme pour un agent.
 */
export interface MapDefinition {
  id: string;
  name: string;
  briefing: string;
  width: number;
  height: number;
  /** Glyphe ASCII -> identifiant de terrain. */
  legend: Record<string, TerrainId>;
  /** Rangées ASCII (paddées/tronquées à `width` au chargement). */
  rows: string[];
  /** Dégâts de guerre ajoutés procéduralement (cratères, gravats) sur les tuiles nues. */
  scatter: {
    /** Graine dédiée : la carte est identique à chaque partie. */
    seed: number;
    region: { x: number; y: number; w: number; h: number };
    craters: number;
    rubble: number;
    trees: number;
    water: number;
  };
  objectives: ObjectiveDef[];
  deployment: Record<FactionId, DeploymentZone>;
  /** Point de ralliement des unités démoralisées (repli), par faction. */
  fallbackLine: Record<FactionId, Vec2>;
}
