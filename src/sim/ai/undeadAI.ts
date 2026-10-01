/**
 * COUCHE NON-MORTE — troisième force. **NON IMPLÉMENTÉE EN V0, ET VOLONTAIREMENT.**
 *
 * La mission V0 demande que cette couche existe et soit documentée, pas qu'elle joue.
 * Elle est donc écrite comme une spécification exécutable : des règles pures, testées,
 * mais qu'aucune boucle de jeu n'appelle encore. Aucune unité non-morte n'existe dans
 * l'état de la simulation, donc rien de ce fichier ne peut influencer une bataille
 * aujourd'hui — c'est la garantie que ce couteau n'est pas encore dans la plaie.
 *
 * ── Doctrine prévue ────────────────────────────────────────────────────────────────
 * Une horde ne manœuvre pas : elle converge. Ce qui la déplace, dans l'ordre d'importance :
 *
 *   1. **le bruit**  — les tirs, les explosions et les ordres sont des appels. Une salve
 *                      de mitrailleuse vaut mieux qu'un appât : c'est ce qui rend l'usage
 *                      du feu lourd dangereux, et non seulement coûteux.
 *   2. **les vivants** — une unité vivante et visible attire plus qu'une trace ancienne.
 *   3. **les cadavres** — un champ de bataille déjà meurtri les attire de loin et les
 *                      retient : l'endroit du massacre devient le prochain objectif.
 *   4. **la cohésion** — une unité isolée du gros de la horde hésite, se disperse.
 *
 * Conséquences de design (à tenir en V1) : la poudre attire, l'artillerie attire, le
 * combat de tranchée silencieux (corps à corps) devient une stratégie ; et une bataille
 * entre deux camps humains peut être décidée par ce qu'ils ont attiré. Les Pénitents
 * fanatiques devraient s'en accommoder mieux que l'Ordre mécanisé : doctrine à écrire.
 *
 * ── Points d'accroche prévus en V1 ─────────────────────────────────────────────────
 *   - `SimState.cues` : bruit par tuile (décrue temporelle) alimenté par les événements
 *     `shot`, `explosion`, `artilleryRequested` déjà émis par la simulation ;
 *   - `Unit.corpse` : les cadavres sont déjà présents à l'écran (rendu) mais ne sont pas
 *     des entités de simulation — à promouvoir en entités pour servir d'attracteurs ;
 *   - la faction `undead` s'ajoute dans `src/data/factions.ts` comme n'importe quelle
 *     autre faction (l'architecture ne présuppose que deux camps nulle part ailleurs
 *     que dans les données et les conditions de victoire).
 */

/** Signal perçu par une unité non-morte à un endroit donné. */
export interface UndeadCue {
  /** Intensité sonore locale (tirs, explosions), 0..1. */
  noise: number;
  /** Nombre de cadavres proches, ramené à 0..1. */
  corpses: number;
  /** Nombre de vivants visibles, ramené à 0..1. */
  living: number;
  /** Distance au gros de la horde, en tuiles. */
  distanceFromHorde: number;
}

/** Poids des attracteurs. Le bruit domine volontairement tout le reste. */
export const UNDEAD_ATTRACTION = {
  noise: 0.55,
  living: 0.35,
  corpses: 0.25,
  /** Pénalité par tuile d'éloignement de la horde (cohésion). */
  cohesionPenalty: 0.04,
} as const;

/**
 * Score d'attraction d'un endroit, de 0 (rien à faire ici) à ~1 (toute la horde y va).
 * Fonction pure et déterministe : c'est la seule chose que la V0 teste de cette couche.
 */
export function undeadAttractionScore(cue: UndeadCue): number {
  const raw =
    cue.noise * UNDEAD_ATTRACTION.noise +
    cue.living * UNDEAD_ATTRACTION.living +
    cue.corpses * UNDEAD_ATTRACTION.corpses;
  const cohesion = 1 - Math.min(1, cue.distanceFromHorde * UNDEAD_ATTRACTION.cohesionPenalty);
  return Math.max(0, Math.min(1, raw * cohesion));
}

/** Texte de doctrine, affiché dans un futur écran de briefing. */
export const UNDEAD_DOCTRINE =
  "La horde n'a ni plan ni peur. Elle va là où on a fait du bruit, et elle reste là où on est mort.";
