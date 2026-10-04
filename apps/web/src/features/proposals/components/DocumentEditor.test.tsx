import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import DocumentEditor from './DocumentEditor';

/** The ProseMirror surface TipTap renders inside EditorContent. */
function surface(container: HTMLElement): HTMLElement {
  const node = container.querySelector('.ProseMirror');
  if (!node) throw new Error('ProseMirror surface missing');
  return node as HTMLElement;
}

describe('DocumentEditor (ADR-14)', () => {
  it('renders exactly the spec toolbar — no image or table buttons', async () => {
    render(<DocumentEditor value="" onChange={() => undefined} />);
    await waitFor(() => expect(screen.getByRole('toolbar')).toBeInTheDocument());

    for (const label of [
      'Bold',
      'Italic',
      'Strikethrough',
      'Heading 2',
      'Heading 3',
      'Bullet list',
      'Numbered list',
      'Blockquote',
      'Undo',
      'Redo',
    ]) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }

    const toolbar = screen.getByRole('toolbar');
    expect(toolbar.querySelector('[aria-label="Image"]')).toBeNull();
    expect(toolbar.querySelector('[aria-label="Table"]')).toBeNull();
  });

  it('emits HTML through onChange when a command changes the document', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DocumentEditor value="<p>Hello</p>" onChange={onChange} />);

    await screen.findByRole('toolbar');
    await user.click(screen.getByRole('button', { name: 'Bullet list' }));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const last = onChange.mock.calls.at(-1)?.[0] as string;
    expect(last).toContain('<ul>');
    expect(last).toContain('Hello');
  });

  it('reflects the active mark in aria-pressed after a toolbar command', async () => {
    const user = userEvent.setup();
    render(<DocumentEditor value="<p>word</p>" onChange={() => undefined} />);

    await screen.findByRole('toolbar');
    const heading = screen.getByRole('button', { name: 'Heading 2' });
    expect(heading).toHaveAttribute('aria-pressed', 'false');
    await user.click(heading);
    await waitFor(() => expect(heading).toHaveAttribute('aria-pressed', 'true'));
    // Toggling off returns to plain text.
    await user.click(heading);
    await waitFor(() => expect(heading).toHaveAttribute('aria-pressed', 'false'));
  });

  it('makes the surface read-only when editable is false', async () => {
    const { container } = render(
      <DocumentEditor value="" onChange={() => undefined} editable={false} />,
    );
    await screen.findByRole('toolbar');
    expect(surface(container)).toHaveAttribute('contenteditable', 'false');
  });
});
