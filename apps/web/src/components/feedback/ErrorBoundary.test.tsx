import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ErrorBoundary from './ErrorBoundary';

/** Throws on first mount; stops once the test flips `shouldThrow`. */
let shouldThrow = true;
function Bomb() {
  if (shouldThrow) throw new Error('boom');
  return <p>recovered content</p>;
}

describe('ErrorBoundary (spec §16.1)', () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    shouldThrow = true;
    // React logs every caught render error — silence the expected noise.
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  const renderBoundary = () =>
    render(
      <MemoryRouter>
        <ErrorBoundary>
          <Bomb />
        </ErrorBoundary>
      </MemoryRouter>,
    );

  it('renders its children while healthy', () => {
    shouldThrow = false;

    renderBoundary();

    expect(screen.getByText('recovered content')).toBeTruthy();
    expect(screen.queryByText('Something went wrong')).toBeNull();
  });

  it('catches a render crash and shows the recovery fallback', () => {
    renderBoundary();

    expect(screen.getByText('Something went wrong')).toBeTruthy();
    expect(screen.getByText('boom')).toBeTruthy();
    expect(screen.getByRole('link', { name: /back to home/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /try again/i })).toBeTruthy();
  });

  it('"Try again" resets the boundary so the subtree can recover', async () => {
    renderBoundary();
    expect(screen.getByText('Something went wrong')).toBeTruthy();

    shouldThrow = false;
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /try again/i }));

    expect(screen.getByText('recovered content')).toBeTruthy();
    expect(screen.queryByText('Something went wrong')).toBeNull();
  });
});
