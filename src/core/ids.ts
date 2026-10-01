/**
 * Types primitifs partagés entre les données (src/data) et la simulation (src/sim).
 * Aucun import de rendu ici : ce module doit rester exécutable dans Node.
 */

/** Identifiant de faction. Volontairement une chaîne : ajouter une faction = ajouter une donnée. */
export type FactionId = string;

export interface Vec2 {
  x: number;
  y: number;
}

export type Team = FactionId;
