import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import FeedbackThread from './FeedbackThread';
import type { FeedbackEntry } from './FeedbackThread';

const MINE: FeedbackEntry = {
  id: 'f-1',
  projectId: 'p-1',
  submissionId: null,
  body: 'First draft is up.',
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-01T10:00:00.000Z',
  author: { id: 'me', firstName: 'Ola', lastName: 'Nordmann', email: 'o@t.local' },
};

const THEIRS: FeedbackEntry = {
  id: 'f-2',
  projectId: 'p-1',
  submissionId: null,
  body: 'Narrow the scope.',
  createdAt: '2026-10-01T11:00:00.000Z',
  updatedAt: '2026-10-01T11:00:00.000Z',
  author: { id: 'sup-1', firstName: 'Helen', lastName: 'Brooks', email: 'h@t.local' },
};

const onPost = vi.fn();
const onEdit = vi.fn();
const onDelete = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  onPost.mockResolvedValue(undefined);
  onEdit.mockResolvedValue(undefined);
  onDelete.mockResolvedValue(undefined);
});

const renderThread = (entries: FeedbackEntry[] = [MINE, THEIRS]) =>
  render(
    <FeedbackThread
      entries={entries}
      currentUserId="me"
      onPost={onPost}
      onEdit={onEdit}
      onDelete={onDelete}
      posting={false}
    />,
  );

describe('FeedbackThread (§11.7 discussion)', () => {
  it('renders both sides with the author names and bodies', () => {
    renderThread();
    expect(screen.getByText('Ola Nordmann')).toBeInTheDocument();
    expect(screen.getByText('Helen Brooks')).toBeInTheDocument();
    expect(screen.getByText('Narrow the scope.')).toBeInTheDocument();
    expect(screen.getByText('you')).toBeInTheDocument();
  });

  it('shows the empty state when nobody has written yet', () => {
    renderThread([]);
    expect(screen.getByText('No messages yet')).toBeInTheDocument();
  });

  it('posts the trimmed draft and clears the composer', async () => {
    const user = userEvent.setup();
    renderThread();

    await user.type(screen.getByLabelText(/type a message/i), '  Looks good!  ');
    await user.click(screen.getByRole('button', { name: /post message/i }));

    expect(onPost).toHaveBeenCalledWith('Looks good!');
    expect(screen.getByLabelText(/type a message/i)).toHaveValue('');
  });

  it('disables the send button while the composer is empty', () => {
    renderThread();
    expect(screen.getByRole('button', { name: /post message/i })).toBeDisabled();
  });

  it('offers edit/delete on own message only', () => {
    renderThread();
    const items = screen.getAllByRole('listitem');
    expect(within(items[0]).getByRole('button', { name: /edit/i })).toBeInTheDocument();
    expect(within(items[0]).getByRole('button', { name: /delete/i })).toBeInTheDocument();
    expect(within(items[1]).queryByRole('button', { name: /edit/i })).toBeNull();
    expect(within(items[1]).queryByRole('button', { name: /delete/i })).toBeNull();
  });

  it('edits in place through the callback', async () => {
    const user = userEvent.setup();
    renderThread();

    await user.click(screen.getAllByRole('button', { name: /edit/i })[0]);
    const editor = screen.getByLabelText('Edit message');
    await user.clear(editor);
    await user.type(editor, 'Edited body');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(onEdit).toHaveBeenCalledWith('f-1', 'Edited body');
  });

  it('routes deletion through the destructive confirmation (§16.1)', async () => {
    const user = userEvent.setup();
    renderThread();

    await user.click(screen.getAllByRole('button', { name: /delete/i })[0]);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Delete this message?');

    // Safe choice focused first (keyboard-reachable, §16.7).
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();

    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(onDelete).toHaveBeenCalledWith('f-1');
  });

  it('surfaces a failed post instead of clearing the draft', async () => {
    onPost.mockRejectedValue(new Error('network down'));
    const user = userEvent.setup();
    renderThread();

    await user.type(screen.getByLabelText(/type a message/i), 'hello');
    await user.click(screen.getByRole('button', { name: /post message/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('network down');
    expect(screen.getByLabelText(/type a message/i)).toHaveValue('hello');
  });
});
