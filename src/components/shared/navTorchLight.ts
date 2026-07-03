// ============================================================================
// NAVBAR SPRITE TORCH LIGHTING
// ============================================================================
// The mobile navbar is a black dungeon lintel with a torch pool burning to
// the RIGHT of the sprite (WallMesh's radial glow, viewBox x≈330). The
// sprite should live in that scene: body fallen into shadow, right side
// catching the warm light. Painted with source-atop compositing so the
// shading lands ONLY on the sprite's own pixels — an overlay element would
// ghost a rectangle against the wall (rendering lesson #4).
//
// All viewports: desktop keeps its clean flat bar, but the sprite (and
// title glimmer) carry the torch scene there too — user call 2026-07-02.

/** Shade a just-drawn navbar sprite frame into the lintel's torchlight. */
export function applyNavTorchLight(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.globalCompositeOperation = 'source-atop';
  // Shadow, heaviest on the side facing away from the torch
  const shadow = ctx.createLinearGradient(0, 0, w, 0);
  shadow.addColorStop(0, 'rgba(5, 4, 4, 0.72)');
  shadow.addColorStop(1, 'rgba(5, 4, 4, 0.14)');
  ctx.fillStyle = shadow;
  ctx.fillRect(0, 0, w, h);
  // Warm rim rising toward the torch
  const warm = ctx.createLinearGradient(0, 0, w, 0);
  warm.addColorStop(0.5, 'rgba(255, 196, 128, 0)');
  warm.addColorStop(1, 'rgba(255, 196, 128, 0.30)');
  ctx.fillStyle = warm;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'source-over';
}
