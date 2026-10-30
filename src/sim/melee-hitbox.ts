/** Rayon de la zone vulnérable au sol d'un soldat. Pas une collision 3D du mesh. */
export const SOLDIER_HURTBOX_RADIUS = 0.22;

/** Intersection entre le disque d'une cible et un secteur orienté (unités en tuiles). */
export function meleeHitboxIntersects(
  x: number, y: number, facing: number, move: { reach: number; halfAngle: number },
  targetX: number, targetY: number, targetRadius = SOLDIER_HURTBOX_RADIUS,
): boolean {
  const dx = targetX - x, dy = targetY - y;
  const d = Math.hypot(dx, dy);
  if (d <= targetRadius) return true;
  if (d > move.reach + targetRadius) return false;
  const angle = Math.atan2(Math.sin(Math.atan2(dy, dx) - facing), Math.cos(Math.atan2(dy, dx) - facing));
  if (Math.abs(angle) <= move.halfAngle) return d <= move.reach + targetRadius;
  // Distance minimale vers l'un des deux segments radiaux du secteur.
  for (const sign of [-1, 1]) {
    const a = facing + sign * move.halfAngle;
    const ux = Math.cos(a), uy = Math.sin(a);
    const along = Math.max(0, Math.min(move.reach, dx * ux + dy * uy));
    if (Math.hypot(dx - along * ux, dy - along * uy) <= targetRadius) return true;
  }
  return false;
}
