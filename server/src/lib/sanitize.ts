const URL_RE = /(?:https?:\/\/|www\.)\S+/gi;

/**
 * Clean a user-authored chat message.
 *
 * URLs are stripped *before* truncating, not after. The Flask version did it
 * the other way round, so replacing a short link with the longer placeholder
 * could push the string back over the column limit and the insert would fail.
 */
export function sanitizeChat(input: unknown, maxLength: number, stripUrls = true): string {
  if (typeof input !== 'string') return '';

  let text = input.replace(/\r\n/g, '\n').trim();
  if (stripUrls) {
    // Off-platform links are the usual vector for scams and contact-swapping.
    text = text.replace(URL_RE, '[link removed]');
  }
  // Collapse runs of blank lines so one message cannot scroll the whole pane.
  text = text.replace(/\n{3,}/g, '\n\n');

  return text.length > maxLength ? text.slice(0, maxLength).trimEnd() : text;
}

/** Trim a plain string field to a maximum length, mapping empty to null. */
export function trimToNull(input: unknown, maxLength: number): string | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (trimmed === '') return null;
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

/**
 * Escape a user-supplied string for safe use inside a RegExp.
 *
 * Search filters build regexes from query parameters; without this a crafted
 * `?search=` could inject a catastrophically backtracking pattern.
 */
export function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
