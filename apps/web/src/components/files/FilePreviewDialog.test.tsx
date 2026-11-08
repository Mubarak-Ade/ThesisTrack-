import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderAsync } from 'docx-preview';

import FilePreviewDialog from './FilePreviewDialog';
import {
  PREVIEW_MAX_BYTES,
  PREVIEW_TEXT_MAX_CHARS,
  previewKindFor,
  type PreviewTarget,
} from './previewSupport';
import { fetchFileBlob } from '@/lib/api/files';

vi.mock('docx-preview', () => ({ renderAsync: vi.fn() }));
vi.mock('@/lib/api/files', () => ({ fetchFileBlob: vi.fn() }));

const PDF: PreviewTarget = {
  filename: 'proposal-v2.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 482_113,
  path: '/proposal-attachments/a-1/download',
};

function blobOf(text: string, type = 'application/octet-stream'): Blob {
  return new Blob([text], { type });
}

function renderDialog(
  target: PreviewTarget | null,
  onClose = vi.fn(),
  onDownload = vi.fn(),
) {
  return render(
    <FilePreviewDialog target={target} onClose={onClose} onDownload={onDownload} />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview-1');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('previewKindFor', () => {
  it('classifies supported formats and leaves everything else to Download', () => {
    expect(previewKindFor('application/pdf')).toBe('pdf');
    expect(previewKindFor('IMAGE/PNG')).toBe('image');
    expect(previewKindFor('image/jpeg')).toBe('image');
    expect(previewKindFor('text/plain')).toBe('text');
    expect(previewKindFor('text/csv')).toBe('text');
    expect(
      previewKindFor(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ),
    ).toBe('docx');
    expect(previewKindFor('application/msword')).toBe('unsupported');
    expect(previewKindFor('application/zip')).toBe('unsupported');
  });
});

describe('FilePreviewDialog', () => {
  it('renders nothing and does no work while closed', () => {
    const { container } = renderDialog(null);
    expect(container.firstChild).toBeNull();
    expect(fetchFileBlob).not.toHaveBeenCalled();
  });

  it('previews a PDF from an object URL and keeps Download working', async () => {
    vi.mocked(fetchFileBlob).mockResolvedValue({
      blob: blobOf('%PDF-1.7', 'application/pdf'),
      filename: PDF.filename,
    });
    const onDownload = vi.fn();
    renderDialog(PDF, vi.fn(), onDownload);

    const frame = await screen.findByTitle('Preview of proposal-v2.pdf');
    expect(frame.tagName).toBe('IFRAME');
    expect(frame).toHaveAttribute('src', 'blob:preview-1');
    expect(fetchFileBlob).toHaveBeenCalledWith(
      '/proposal-attachments/a-1/download',
      'proposal-v2.pdf',
    );

    await userEvent.setup().click(screen.getByRole('button', { name: /^download$/i }));
    expect(onDownload).toHaveBeenCalledWith(PDF);
  });

  it('previews an image as an img element', async () => {
    vi.mocked(fetchFileBlob).mockResolvedValue({
      blob: blobOf('png', 'image/png'),
      filename: 'scan.png',
    });
    renderDialog({ ...PDF, filename: 'scan.png', mimeType: 'image/png' });

    const image = await screen.findByRole('img', { name: /preview of scan\.png/i });
    expect(image).toHaveAttribute('src', 'blob:preview-1');
  });

  it('renders text/CSV as escaped text, not HTML', async () => {
    vi.mocked(fetchFileBlob).mockResolvedValue({
      blob: blobOf('name,score\n<b>Ola</b>,10'),
      filename: 'scores.csv',
    });
    renderDialog({ ...PDF, filename: 'scores.csv', mimeType: 'text/csv' });

    const pre = await screen.findByText(/name,score/);
    expect(pre.tagName).toBe('PRE');
    expect(pre).toHaveTextContent('<b>Ola</b>,10');
    expect(document.querySelector('b')).toBeNull();
  });

  it('truncates very large text and says so', async () => {
    vi.mocked(fetchFileBlob).mockResolvedValue({
      blob: blobOf('a'.repeat(PREVIEW_TEXT_MAX_CHARS + 50), 'text/plain'),
      filename: 'log.txt',
    });
    renderDialog({ ...PDF, filename: 'log.txt', mimeType: 'text/plain' });

    expect(await screen.findByText(/preview truncated/i)).toBeInTheDocument();
    expect(fetchFileBlob).toHaveBeenCalled();
  });

  it('renders .docx into a sandboxed iframe and strips unsafe nodes', async () => {
    vi.mocked(fetchFileBlob).mockResolvedValue({
      blob: blobOf('docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
      filename: 'thesis.docx',
    });
    vi.mocked(renderAsync).mockImplementation(async (_data, body, styles) => {
      (body as HTMLElement).innerHTML =
        '<p>Hello <strong>thesis</strong></p><img src="https://evil.test/pixel.png"><a href="https://evil.test">link</a>';
      (styles as HTMLElement).innerHTML = '<style>.docx { color: black; }</style>';
    });

    renderDialog({
      ...PDF,
      filename: 'thesis.docx',
      mimeType:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });

    const frame = await screen.findByTitle('Preview of thesis.docx');
    expect(frame).toHaveAttribute('sandbox', '');
    const srcdoc = frame.getAttribute('srcdoc') ?? '';
    expect(srcdoc).toContain('Hello');
    expect(srcdoc).toContain('thesis');
    expect(srcdoc).not.toContain('evil.test');
    expect(srcdoc).toContain('Content-Security-Policy');
    expect(renderAsync).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ useBase64URL: true, renderAltChunks: false }),
    );
  });

  it('falls back to Download for a legacy .doc without fetching', async () => {
    renderDialog({ ...PDF, filename: 'old.doc', mimeType: 'application/msword' });

    expect(await screen.findByText(/can.t be previewed/i)).toBeInTheDocument();
    expect(fetchFileBlob).not.toHaveBeenCalled();
    expect(screen.getAllByRole('button', { name: /download/i })).not.toHaveLength(0);
  });

  it('refuses to fetch a file larger than the preview cap', async () => {
    renderDialog({ ...PDF, sizeBytes: PREVIEW_MAX_BYTES + 1 });

    expect(await screen.findByText(/larger than 10 MB/i)).toBeInTheDocument();
    expect(fetchFileBlob).not.toHaveBeenCalled();
  });

  it('shows an inline retry after a failed fetch', async () => {
    vi.mocked(fetchFileBlob)
      .mockRejectedValueOnce(new Error('Network down'))
      .mockResolvedValueOnce({ blob: blobOf('%PDF', 'application/pdf'), filename: PDF.filename });

    renderDialog(PDF);
    expect(await screen.findByText('Network down')).toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole('button', { name: /try again/i }));
    await waitFor(() => expect(fetchFileBlob).toHaveBeenCalledTimes(2));
    expect(await screen.findByTitle('Preview of proposal-v2.pdf')).toBeInTheDocument();
  });

  it('closes on Escape, the close button and a backdrop click', async () => {
    vi.mocked(fetchFileBlob).mockResolvedValue({
      blob: blobOf('%PDF', 'application/pdf'),
      filename: PDF.filename,
    });
    const onClose = vi.fn();
    const { container } = renderDialog(PDF, onClose);
    await screen.findByTitle('Preview of proposal-v2.pdf');

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);

    await userEvent.setup().click(screen.getByRole('button', { name: /close preview/i }));
    expect(onClose).toHaveBeenCalledTimes(2);

    fireEvent.mouseDown(container.firstElementChild as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('revokes the object URL when the dialog unmounts', async () => {
    vi.mocked(fetchFileBlob).mockResolvedValue({
      blob: blobOf('%PDF', 'application/pdf'),
      filename: PDF.filename,
    });
    const { unmount } = renderDialog(PDF);
    await screen.findByTitle('Preview of proposal-v2.pdf');

    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview-1');
  });
});
