/**
 * Générateur pseudo-aléatoire déterministe (mulberry32).
 *
 * Règle d'or du projet : la simulation ne tire du hasard QUE via ces instances, dans un
 * ordre d'appel identique d'une exécution à l'autre. Le rendu possède son propre RNG pour
 * que les effets visuels ne puissent jamais modifier le déroulement d'une bataille.
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    // 0 est un état dégénéré pour mulberry32 : on le remplace.
    this.state = (seed >>> 0) || 0x9e3779b9;
  }

  /** Nombre réel dans [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Entier dans [0, max). */
  int(max: number): number {
    return Math.floor(this.next() * max);
  }

  /** Réel dans [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Réel symétrique dans [-spread, +spread]. */
  spread(spread: number): number {
    return (this.next() * 2 - 1) * spread;
  }

  chance(probability: number): boolean {
    return this.next() < probability;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Rng.pick: liste vide');
    return items[this.int(items.length)]!;
  }

  /** Sauvegarde/restauration d'état : utile pour rejouer une bataille depuis un snapshot. */
  snapshot(): number {
    return this.state;
  }

  restore(state: number): void {
    this.state = state >>> 0;
  }
}

/** Hash stable d'une chaîne, pour dériver une graine d'un identifiant de carte. */
export function hashString(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
