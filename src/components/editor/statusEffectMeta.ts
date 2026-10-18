import type { StatusEffectAsset } from '../../types/game';

// Moved out of StatusEffectPicker.tsx (2026-10-18 delint): a component file
// that also exports plain values breaks React Fast Refresh.

export const TYPE_COLORS: Record<string, string> = {
  poison: '#22c55e',
  regen: '#4ade80',
  sleep: '#6366f1',
  stun: '#eab308',
  shield: '#3b82f6',
  slow: '#f97316',
  haste: '#06b6d4',
  burn: '#ef4444',
  freeze: '#67e8f9',
  disarmed: '#a855f7',
  silenced: '#ec4899',
  polymorph: '#d946ef',
  deflect: '#f59e0b',
  stealth: '#6b7280',
  invulnerable: '#fcd34d',
  steadfast: '#78716c',
  reflect: '#06b6d4',
  bleed: '#dc2626',
};

export function getStatusEffectFlags(_effect: StatusEffectAsset): string[] {
  return [];
}
