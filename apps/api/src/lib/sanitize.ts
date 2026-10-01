import sanitizeHtml from 'sanitize-html';

/**
 * ADR-14 write-time sanitizer — the security half of the proposal editor.
 *
 * `proposals.body` is HTML produced by TipTap; storing it unfiltered would be
 * **stored XSS** rendered by the supervisor's review screen (spec §10.1,
 * §11.3, ADR-14 — LOCKED). The API sanitizes on every write (create + patch);
 * the value is stored already clean and reads render it as-is — re-sanitizing
 * on read would be a second source of truth.
 *
 * The allowlist is inclusive by construction, so `script`, `style`,
 * `iframe`, event handlers and `javascript:` URLs never need enumerating:
 *
 *   tags : p, h1–h6, strong, em, u, s, a, ul, ol, li, blockquote, code, pre, br, hr
 *   attrs: a[href] ∈ { http, https, mailto }
 *
 * `img` is deliberately excluded — TipTap StarterKit cannot insert images, so
 * allowing them would be attack surface with no legitimate authoring path
 * (an uploaded figure belongs in the PDF, ADR-14).
 */
const ALLOWED_TAGS = [
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'strong',
  'em',
  'u',
  's',
  'a',
  'ul',
  'ol',
  'li',
  'blockquote',
  'code',
  'pre',
  'br',
  'hr',
];

/** Sanitize editor HTML on write (create + patch). Stored already-clean. */
export function sanitizeProposalBody(dirty: string): string {
  return sanitizeHtml(dirty, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: { a: ['href'] },
    allowedSchemes: ['http', 'https', 'mailto'],
  });
}

/**
 * The visible text of an HTML string (tags and all non-text content removed).
 *
 * The §11.3 document rule needs to know whether a body *says* anything:
 * `<p></p>` and `<script>…</script>` are empty content, not a document, so a
 * body whose text is blank must not satisfy "at least one of body or
 * attachments" at submit.
 */
export function htmlToText(html: string): string {
  return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} });
}
