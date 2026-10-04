import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import AttachmentDropzone from './AttachmentDropzone';

const onFile = vi.fn();
const FILE = new File(['%PDF-1.4'], 'proposal.pdf', { type: 'application/pdf' });

function renderDropzone(props: Partial<Parameters<typeof AttachmentDropzone>[0]> = {}) {
  return render(<AttachmentDropzone onFile={onFile} {...props} />);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AttachmentDropzone (§11.3 drag-or-click)', () => {
  it('accepts a file from the hidden input (click path)', () => {
    renderDropzone();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [FILE] } });
    expect(onFile).toHaveBeenCalledWith(FILE);
    // Same file twice must re-trigger — the input clears itself.
    expect(input.value).toBe('');
  });

  it('accepts a dropped file (drag path)', () => {
    renderDropzone();
    const zone = screen.getByRole('button', { name: /upload a document/i });
    fireEvent.drop(zone, { dataTransfer: { files: [FILE] } });
    expect(onFile).toHaveBeenCalledWith(FILE);
  });

  it('reports upload progress with a determinate bar (task 11.4)', () => {
    renderDropzone({ progress: 42 });
    expect(screen.getByText(/uploading… 42%/i)).toBeInTheDocument();
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '42');
  });

  it('surfaces upload errors instead of swallowing them (§10.4)', () => {
    renderDropzone({ error: 'File too large' });
    expect(screen.getByRole('alert')).toHaveTextContent('File too large');
  });

  it('ignores interaction while disabled (frozen proposal)', () => {
    renderDropzone({ disabled: true });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [FILE] } });
    expect(onFile).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /choose file/i })).toBeDisabled();
  });
});
