/**
 * HTML sanitization utilities for user-authored content.
 * Used wherever content is rendered via dangerouslySetInnerHTML.
 */

const INLINE_TAGS = new Set(['B', 'I', 'U', 'S', 'STRONG', 'EM', 'SPAN', 'FONT', 'BR', 'A']);

const BLOCK_TAGS = new Set([
  'P', 'DIV', 'UL', 'OL', 'LI',
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'HR', 'BLOCKQUOTE', 'PRE', 'CODE',
]);

function walkAndClean(node: Node, allowedTags: Set<string>): void {
  const children = Array.from(node.childNodes);
  for (const child of children) {
    if (child.nodeType === Node.ELEMENT_NODE) {
      const el = child as Element;
      if (!allowedTags.has(el.tagName)) {
        const text = document.createTextNode(el.textContent || '');
        node.replaceChild(text, child);
      } else {
        const attrs = Array.from(el.attributes);
        for (const attr of attrs) {
          if (attr.name === 'style' || attr.name === 'color') continue;
          if (el.tagName === 'A' && attr.name === 'href') continue;
          if (attr.name === 'class') continue;
          el.removeAttribute(attr.name);
        }
        walkAndClean(child, allowedTags);
      }
    }
  }
}

/**
 * Sanitize inline HTML (descriptions, tooltips, card text).
 * Allows: B, I, U, S, STRONG, EM, SPAN, FONT, BR, A
 */
export function sanitizeHtml(input: string): string {
  const temp = document.createElement('div');
  temp.innerHTML = input;
  walkAndClean(temp, INLINE_TAGS);
  return temp.innerHTML;
}

/**
 * Sanitize block-level HTML (help content, rich articles).
 * Allows inline tags plus: P, DIV, UL, OL, LI, H1-H6, HR, BLOCKQUOTE, PRE, CODE
 */
export function sanitizeRichHtml(input: string): string {
  const temp = document.createElement('div');
  temp.innerHTML = input;
  const allTags = new Set([...INLINE_TAGS, ...BLOCK_TAGS]);
  walkAndClean(temp, allTags);
  return temp.innerHTML;
}
