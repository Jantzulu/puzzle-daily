/**
 * Legacy plain-text cleanup. Some asset descriptions saved by an early
 * rich-text editor carry literal "<br>" tags — an empty description could
 * serialize as exactly "<br>". These fields render as PLAIN TEXT (not
 * sanitized HTML), so the tags must be converted, never printed.
 */

/** Multi-line contexts: <br> → newline. Render with white-space: pre-line. */
export function brToNewlines(text: string | undefined): string {
  return (text ?? '').replace(/<br\s*\/?>/gi, '\n').trim();
}

/** Single-line (truncated) contexts: <br> → a single space. */
export function brToSpaces(text: string | undefined): string {
  return (text ?? '').replace(/\s*<br\s*\/?>\s*/gi, ' ').trim();
}
