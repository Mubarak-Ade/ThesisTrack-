/**
 * Non-component preview policy: what we can render, how large a file may be
 * before we stop, and where the bytes come from. Split out of the dialog so
 * the component module only exports components (Vite Fast Refresh), and so
 * the rules are testable without mounting a modal.
 */

/** Formats the browser can render directly, plus the one we render ourselves. */
export type PreviewKind = 'pdf' | 'image' | 'text' | 'docx' | 'unsupported';

/** §14.4 uploads cap at 20 MB; preview stops at half that to stay light. */
export const PREVIEW_MAX_BYTES = 10 * 1024 * 1024;

/** A plain-text preview is capped so a huge log cannot freeze the modal. */
export const PREVIEW_TEXT_MAX_CHARS = 200_000;

const KIND_BY_MIME: Record<string, PreviewKind> = {
  'application/pdf': 'pdf',
  'image/png': 'image',
  'image/jpeg': 'image',
  'text/plain': 'text',
  'text/csv': 'text',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
};

export function previewKindFor(mimeType: string): PreviewKind {
  return KIND_BY_MIME[mimeType.toLowerCase()] ?? 'unsupported';
}

export interface PreviewTarget {
  filename: string;
  mimeType: string;
  sizeBytes: number;
  /** Authenticated §14.5 download path — the same route Download uses. */
  path: string;
}
