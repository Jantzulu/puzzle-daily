import type { AttributeEntry } from '../types/game';

// Shape helpers for attribute entries (2026-07-21): attributes are
// `string | {text, subItems}` — strings are the historic shape and stay
// the storage form until a sub-item exists (withAttributeSubItems
// collapses childless objects back to plain strings, keeping untouched
// assets byte-identical in storage and cloud diffs). Every surface reads
// through these instead of typeof-checking inline.

export function attributeText(a: AttributeEntry): string {
  return typeof a === 'string' ? a : a.text;
}

export function attributeSubItems(a: AttributeEntry): string[] | undefined {
  if (typeof a === 'string') return undefined;
  return a.subItems && a.subItems.length > 0 ? a.subItems : undefined;
}

export function withAttributeText(a: AttributeEntry, text: string): AttributeEntry {
  return typeof a === 'string' ? text : { ...a, text };
}

export function withAttributeSubItems(a: AttributeEntry, subItems: string[] | undefined): AttributeEntry {
  const text = attributeText(a);
  return subItems && subItems.length > 0 ? { text, subItems } : text;
}
