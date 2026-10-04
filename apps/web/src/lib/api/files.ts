import { client, normalizeError, ApiError } from './http';

/**
 * File half of the API surface (§11.3 attachments, §11.5 submission versions,
 * §14.5 download headers).
 *
 * Both helpers bypass the JSON `api` envelope helper on purpose:
 *  - downloads arrive as bytes (`responseType: 'blob'`), not an envelope;
 *  - uploads are `FormData` and need `onUploadProgress` (task 11.4).
 * They still go through `client`, so the Bearer header, the 401-refresh queue
 * and the error normalisation behave exactly like every other call.
 */

/** Parse `attachment; filename="…"` (§14.5) — falls back to the caller's name. */
function filenameFromDisposition(header: string | null | undefined, fallback: string): string {
  if (!header) return fallback;
  const star = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1]);
    } catch {
      /* malformed percent-encoding → keep looking */
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(header);
  return plain?.[1]?.trim() || fallback;
}

/**
 * GET a file as bytes and hand it to the browser's download path — an anchor
 * click on a fresh object URL (revoked on the next tick). Bearer tokens cannot
 * ride a plain `<a href>`, so the authenticated fetch *is* the download.
 */
export async function downloadFile(path: string, fallbackName: string): Promise<void> {
  try {
    const res = await client.get<Blob>(path, { responseType: 'blob' });
    const name = filenameFromDisposition(res.headers['content-disposition'], fallbackName);
    const url = URL.createObjectURL(res.data);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  } catch (error) {
    throw error instanceof ApiError ? error : normalizeError(error);
  }
}

/** `onUploadProgress` reports — 0…100, `null` before the first tick. */
export type UploadProgress = (percent: number | null) => void;

/**
 * POST `FormData` (multipart) and report upload progress. The envelope is
 * unwrapped exactly like `api.*`, so callers receive `data` or an ApiError.
 */
export async function uploadFile<T>(
  path: string,
  form: FormData,
  onProgress?: UploadProgress,
  method: 'POST' | 'PATCH' = 'POST',
): Promise<T> {
  try {
    const res = await client.request<{ success: true; data: T }>({
      method,
      url: path,
      data: form,
      onUploadProgress: (event) => {
        if (!onProgress) return;
        onProgress(event.total ? Math.round((event.loaded / event.total) * 100) : null);
      },
    });
    if (!res.data.success) {
      // A success:false envelope on a 2xx is unreachable today, but treating it
      // as an error keeps the "writes never fake success" rule total (§10.4).
      const err = (res.data as { error?: { code?: string; message?: string; details?: unknown } })
        .error;
      throw new ApiError({
        status: 0,
        code: err?.code ?? 'ENVELOPE_ERROR',
        message: err?.message ?? 'Unexpected error',
        details: err?.details,
      });
    }
    return res.data.data;
  } catch (error) {
    throw error instanceof ApiError ? error : normalizeError(error);
  }
}
