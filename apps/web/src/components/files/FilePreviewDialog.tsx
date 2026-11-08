import { useEffect, useId, useState } from 'react';
import { Download, FileWarning, X } from 'lucide-react';

import ErrorState from '@/components/feedback/ErrorState';
import LoadingState from '@/components/feedback/LoadingState';
import { Button } from '@/components/ui/button';
import { fetchFileBlob } from '@/lib/api/files';
import { useFocusTrap } from '@/lib/hooks/useFocusTrap';
import {
  PREVIEW_MAX_BYTES,
  PREVIEW_TEXT_MAX_CHARS,
  previewKindFor,
  type PreviewTarget,
} from './previewSupport';

export interface FilePreviewDialogProps {
  /** `null` closes the dialog; the component stays mounted per hooks rules. */
  target: PreviewTarget | null;
  onClose: () => void;
  onDownload: (target: PreviewTarget) => void;
}

type PreviewState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; kind: 'pdf' | 'image'; url: string }
  | { status: 'ready'; kind: 'text'; text: string; truncated: boolean }
  | { status: 'ready'; kind: 'docx'; html: string }
  | { status: 'fallback'; reason: 'unsupported' | 'too_large' }
  | { status: 'error'; message: string };

const DROP_TAGS = new Set(['script', 'iframe', 'object', 'embed', 'link', 'meta', 'form', 'base']);
const URL_ATTRS = new Set(['src', 'srcset', 'poster', 'background', 'data']);

/**
 * Strip anything a document could use to execute code or reach the network.
 * Rendering already happens inside a sandboxed, CSP-locked iframe; this is
 * defence in depth for the serialized HTML that goes into `srcdoc`.
 */
function sanitizeRenderedDoc(root: HTMLElement): void {
  root.querySelectorAll('*').forEach((node) => {
    const element = node as HTMLElement;
    if (DROP_TAGS.has(element.tagName.toLowerCase())) {
      element.remove();
      return;
    }
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      if (name.startsWith('on') || name === 'href' || name === 'xlink:href') {
        element.removeAttribute(attribute.name);
        continue;
      }
      if (URL_ATTRS.has(name) && !/^\s*data:/i.test(attribute.value)) {
        element.removeAttribute(attribute.name);
        continue;
      }
      if (name === 'style' && /url\s*\(\s*['"]?(?!#|data:)/i.test(attribute.value)) {
        element.removeAttribute(attribute.name);
      }
    }
  });
}

function buildSandboxDocument(bodyHtml: string, styleHtml: string): string {
  // A style element's text is serialized raw. Neutralize a literal closing
  // tag so a crafted stylesheet cannot break out of its element.
  const safeStyles = styleHtml.replace(/<\/style/gi, '<\\/style');
  return [
    '<!doctype html><html><head><meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:; media-src data:; form-action 'none'">`,
    '<style>html,body{margin:0;padding:0;background:#f3f4f6}body{padding:16px}img{max-width:100%;height:auto}a{pointer-events:none}</style>',
    safeStyles,
    '</head><body>',
    bodyHtml,
    '</body></html>',
  ].join('');
}

/**
 * Render a .docx offscreen with `docx-preview`, then serialize it into a
 * sandboxed iframe document. `renderAltChunks` is off (altChunk can carry raw
 * HTML) and assets become data URLs so no blob/network URL escapes the frame.
 */
async function renderDocxPreview(blob: Blob): Promise<string> {
  // Code-split: the renderer (and its zip reader) only loads for a .docx
  // preview, keeping the initial app bundle unchanged.
  const { renderAsync } = await import('docx-preview');
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText =
    'position:fixed;left:-10000px;top:0;width:900px;visibility:hidden;pointer-events:none;';
  const body = document.createElement('div');
  const styles = document.createElement('div');
  host.append(body, styles);
  document.body.appendChild(host);
  try {
    await renderAsync(blob, body, styles, {
      inWrapper: true,
      useBase64URL: true,
      renderAltChunks: false,
      renderChanges: false,
      renderComments: false,
      breakPages: true,
      ignoreLastRenderedPageBreak: false,
    });
    sanitizeRenderedDoc(body);
    return buildSandboxDocument(body.innerHTML, styles.innerHTML);
  } finally {
    host.remove();
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function PreviewFallback({
  reason,
  onDownload,
}: {
  reason: 'unsupported' | 'too_large';
  onDownload: () => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <FileWarning className="size-10 text-muted-foreground" aria-hidden="true" />
      <p className="max-w-sm text-sm text-muted-foreground">
        {reason === 'too_large'
          ? 'This file is larger than 10 MB, so it isn’t previewed here. Download it to open it locally.'
          : 'This file type can’t be previewed in the app. Download it to open it locally.'}
      </p>
      <Button type="button" onClick={onDownload}>
        <Download aria-hidden="true" /> Download file
      </Button>
    </div>
  );
}

/**
 * Inline document preview for attachments and submission versions (2026-11-07).
 *
 * PDF, PNG/JPEG and plain text/CSV render from a blob object URL; .docx is
 * rendered to sandboxed HTML with `docx-preview`; anything else (legacy .doc,
 * ZIP, unknown) falls back to Download. Download always stays available — this
 * is an addition, never a replacement.
 */
export default function FilePreviewDialog({
  target,
  onClose,
  onDownload,
}: FilePreviewDialogProps) {
  const titleId = useId();
  const trapRef = useFocusTrap<HTMLDivElement>(target !== null);
  const [state, setState] = useState<PreviewState>({ status: 'idle' });
  const [attempt, setAttempt] = useState(0);

  const open = target !== null;
  const path = target?.path ?? '';
  const mimeType = target?.mimeType ?? '';
  const sizeBytes = target?.sizeBytes ?? 0;
  const filename = target?.filename ?? '';

  useEffect(() => {
    if (!open) {
      setState({ status: 'idle' });
      return;
    }

    const kind = previewKindFor(mimeType);
    if (kind === 'unsupported') {
      setState({ status: 'fallback', reason: 'unsupported' });
      return;
    }
    if (sizeBytes > PREVIEW_MAX_BYTES) {
      setState({ status: 'fallback', reason: 'too_large' });
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;
    setState({ status: 'loading' });

    void (async () => {
      try {
        const { blob } = await fetchFileBlob(path, filename);
        if (cancelled) return;

        if (kind === 'pdf' || kind === 'image') {
          objectUrl = URL.createObjectURL(blob);
          setState({ status: 'ready', kind, url: objectUrl });
          return;
        }
        if (kind === 'text') {
          const text = await blob.text();
          if (cancelled) return;
          const truncated = text.length > PREVIEW_TEXT_MAX_CHARS;
          setState({
            status: 'ready',
            kind: 'text',
            text: truncated ? text.slice(0, PREVIEW_TEXT_MAX_CHARS) : text,
            truncated,
          });
          return;
        }
        const html = await renderDocxPreview(blob);
        if (cancelled) return;
        setState({ status: 'ready', kind: 'docx', html });
      } catch (error) {
        if (cancelled) return;
        setState({
          status: 'error',
          message: error instanceof Error ? error.message : 'Preview failed.',
        });
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [open, path, mimeType, sizeBytes, filename, attempt]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!target) return null;

  const body = (() => {
    switch (state.status) {
      case 'loading':
        return <LoadingState label="Loading preview…" />;
      case 'error':
        return (
          <ErrorState message={state.message} onRetry={() => setAttempt((value) => value + 1)} />
        );
      case 'fallback':
        return (
          <PreviewFallback reason={state.reason} onDownload={() => onDownload(target)} />
        );
      case 'ready':
        if (state.kind === 'pdf') {
          return (
            <iframe
              title={`Preview of ${target.filename}`}
              src={state.url}
              referrerPolicy="no-referrer"
              className="h-full w-full border-0 bg-white"
            />
          );
        }
        if (state.kind === 'image') {
          return (
            <div className="flex h-full w-full items-center justify-center overflow-auto p-4">
              <img
                src={state.url}
                alt={`Preview of ${target.filename}`}
                className="max-h-full max-w-full object-contain"
              />
            </div>
          );
        }
        if (state.kind === 'text') {
          return (
            <div className="h-full overflow-auto p-4">
              <pre className="whitespace-pre-wrap break-words font-mono text-xs text-foreground">
                {state.text}
              </pre>
              {state.truncated && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Preview truncated — download the file to read the rest.
                </p>
              )}
            </div>
          );
        }
        if (!('html' in state)) return null;
        return (
          <iframe
            title={`Preview of ${target.filename}`}
            sandbox=""
            srcDoc={state.html}
            referrerPolicy="no-referrer"
            className="h-full w-full border-0 bg-white"
          />
        );
      default:
        return null;
    }
  })();

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <h2 id={titleId} className="truncate text-sm font-semibold text-foreground">
              {target.filename}
            </h2>
            <p className="text-xs text-muted-foreground">{formatBytes(target.sizeBytes)}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => onDownload(target)}>
              <Download aria-hidden="true" /> Download
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Close preview"
              onClick={onClose}
            >
              <X aria-hidden="true" />
            </Button>
          </div>
        </header>
        <div className="min-h-0 flex-1 bg-muted/20">{body}</div>
      </div>
    </div>
  );
}
