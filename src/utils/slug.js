/**
 * Convert a title to a URL-friendly slug.
 * e.g. "Mowing Procedures" → "mowing-procedures"
 */
export function toSlug(title) {
  return (title || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
