import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import VersionComposer from './VersionComposer';

const onAppend = vi.fn();
const FILE = new File(['%PDF-1.4'], 'chapter.pdf', { type: 'application/pdf' });

beforeEach(() => {
  vi.clearAllMocks();
  onAppend.mockResolvedValue(undefined);
});

const renderComposer = () =>
  render(<VersionComposer onAppend={onAppend} />);

describe('VersionComposer (§11.5 new version, task 11.3 history)', () => {
  it('explains that versions are immutable (I7)', () => {
    renderComposer();
    expect(screen.getByText(/Versions are immutable \(I7\)/)).toBeInTheDocument();
  });

  it('defaults to text mode and posts the trimmed body', async () => {
    const user = userEvent.setup();
    renderComposer();

    await user.type(screen.getByLabelText('Revised text'), '  Chapter 3, v2  ');
    await user.click(screen.getByRole('button', { name: /post new version/i }));

    expect(onAppend).toHaveBeenCalledWith({ body: 'Chapter 3, v2' }, expect.any(Function));
  });

  it('refuses an empty text version with an inline error', async () => {
    const user = userEvent.setup();
    renderComposer();

    await user.click(screen.getByRole('button', { name: /post new version/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Write the revised text first.');
    expect(onAppend).not.toHaveBeenCalled();
  });

  it('switches to file mode and posts the file', async () => {
    const user = userEvent.setup();
    renderComposer();

    await user.click(screen.getByRole('button', { name: /upload file/i }));
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [FILE] } });
    expect(screen.getByText(/Selected:/)).toHaveTextContent('chapter.pdf');

    await user.click(screen.getByRole('button', { name: /post new version/i }));

    expect(onAppend).toHaveBeenCalledWith({ file: FILE }, expect.any(Function));
    expect(screen.queryByLabelText('Revised text')).toBeNull();
  });

  it('refuses an empty file version with an inline error', async () => {
    const user = userEvent.setup();
    renderComposer();

    await user.click(screen.getByRole('button', { name: /upload file/i }));
    await user.click(screen.getByRole('button', { name: /post new version/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Choose a file first.');
    expect(onAppend).not.toHaveBeenCalled();
  });

  it('surfaces a failed append instead of pretending success (Rule 3)', async () => {
    onAppend.mockRejectedValue(new Error('upload rejected'));
    const user = userEvent.setup();
    renderComposer();

    await user.type(screen.getByLabelText('Revised text'), 'text');
    await user.click(screen.getByRole('button', { name: /post new version/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('upload rejected');
  });
});
