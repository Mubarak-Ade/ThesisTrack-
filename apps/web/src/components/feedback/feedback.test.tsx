import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ConfirmDialog, { DestructiveConfirmDialog } from './ConfirmDialog';
import EmptyState from './EmptyState';
import ErrorState from './ErrorState';
import LoadingState from './LoadingState';
import UnsavedChangesDialog from './UnsavedChangesDialog';

/** §16.1 global chrome — the shared feedback primitives (Phase 10 task 10.3). */
describe('feedback primitives (spec §16.1)', () => {
  it('LoadingState announces itself as a polite status region', () => {
    render(<LoadingState label="Loading submissions…" />);

    expect(screen.getByRole('status')).toBeTruthy();
    expect(screen.getByText('Loading submissions…')).toBeTruthy();
  });

  it('EmptyState renders eyebrow, heading and description', () => {
    render(
      <EmptyState
        eyebrow="Coming soon"
        title="Reports"
        description="Departmental summaries of lifecycle progress."
      />,
    );

    expect(screen.getByRole('heading', { name: 'Reports' })).toBeTruthy();
    expect(screen.getByText('Coming soon')).toBeTruthy();
    expect(screen.getByText('Departmental summaries of lifecycle progress.')).toBeTruthy();
  });

  it('ErrorState surfaces the failure as an alert and retries on demand', async () => {
    const onRetry = vi.fn();
    render(<ErrorState message="Could not load projects." onRetry={onRetry} />);

    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('Could not load projects.')).toBeTruthy();

    await userEvent.setup().click(screen.getByRole('button', { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('ConfirmDialog confirms, and Escape takes the cancel path', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open
        title="Archive project?"
        description="The project leaves the active list."
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(screen.getByText('The project leaves the active list.')).toBeTruthy();

    await userEvent.setup().click(screen.getByRole('button', { name: 'Confirm' }));
    expect(onConfirm).toHaveBeenCalledOnce();

    await userEvent.setup().keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('ConfirmDialog renders nothing while closed', () => {
    render(
      <ConfirmDialog
        open={false}
        title="Archive project?"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('DestructiveConfirmDialog focuses the safe choice and styles the confirm red', () => {
    render(
      <DestructiveConfirmDialog
        open
        title="Delete submission?"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const cancel = screen.getByRole('button', { name: 'Cancel' });
    const confirm = screen.getByRole('button', { name: 'Confirm' });
    expect(document.activeElement).toBe(cancel);
    expect(confirm.className).toContain('bg-destructive');
  });

  it('UnsavedChangesDialog: "Keep editing" stays, "Discard changes" leaves', async () => {
    const onStay = vi.fn();
    const onDiscard = vi.fn();
    render(<UnsavedChangesDialog open onStay={onStay} onDiscard={onDiscard} />);

    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(onStay).toHaveBeenCalledOnce();
    expect(onDiscard).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(onDiscard).toHaveBeenCalledOnce();
  });
});
