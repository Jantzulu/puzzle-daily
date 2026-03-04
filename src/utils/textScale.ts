/**
 * Returns a Tailwind font-size class scaled to the name length,
 * so longer asset names shrink to fit the sidebar panel without
 * mid-word breaks. Minimum size stays legible (~11px).
 * Uses leading-relaxed to prevent medieval font ascenders/descenders
 * from being clipped or overlapping adjacent lines.
 */
export function scaledNameClass(name: string): string {
  const len = name.length;
  if (len <= 10) return 'text-sm leading-relaxed';       // 14px – fits comfortably
  if (len <= 16) return 'text-xs leading-relaxed';       // 12px – medium names
  return 'text-[11px] leading-relaxed';                  // 11px floor – long names
}
