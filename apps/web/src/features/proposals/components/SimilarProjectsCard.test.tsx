import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import SimilarProjectsCard from './SimilarProjectsCard';
import { listSimilarForProposal } from '../data/similarProjects';
import type { SimilarProject } from '../data/similarProjects';

vi.mock('../data/similarProjects', () => ({
  listSimilarForProposal: vi.fn(),
}));

const MATCH: SimilarProject = {
  id: 'lib-1',
  title: 'Campus energy ledger',
  status: 'active',
  session: '2025/2026',
  student: { firstName: 'Kari', lastName: 'Berg' },
  department: { name: 'Informatics' },
  score: 0.62,
  excerpt: 'A shared ledger for campus energy.',
};

function renderCard(enabled: boolean) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<SimilarProjectsCard proposalId="p-1" enabled={enabled} />, { wrapper });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listSimilarForProposal).mockResolvedValue([]);
});

describe('SimilarProjectsCard', () => {
  it('renders nothing and fires no request when disabled', () => {
    renderCard(false);
    expect(screen.queryByText('Similar existing projects')).toBeNull();
    expect(listSimilarForProposal).not.toHaveBeenCalled();
  });

  it('lists matches when enabled', async () => {
    vi.mocked(listSimilarForProposal).mockResolvedValue([MATCH]);
    renderCard(true);

    expect(await screen.findByText(MATCH.title)).toBeInTheDocument();
    expect(listSimilarForProposal).toHaveBeenCalledWith('p-1');
    expect(screen.getByText(/advisory matches/i)).toBeInTheDocument();
  });

  it('shows the empty message', async () => {
    renderCard(true);
    expect(
      await screen.findByText('No similar projects found in the library.'),
    ).toBeInTheDocument();
  });

  it('shows an inline retry on failure', async () => {
    const user = userEvent.setup();
    vi.mocked(listSimilarForProposal).mockRejectedValue(new Error('offline'));
    renderCard(true);

    expect(await screen.findByText(/similar projects could not be loaded/i)).toBeInTheDocument();
    const before = vi.mocked(listSimilarForProposal).mock.calls.length;
    await user.click(screen.getByRole('button', { name: /try again/i }));
    await waitFor(() =>
      expect(vi.mocked(listSimilarForProposal).mock.calls.length).toBeGreaterThan(before),
    );
  });

  it('collapses and reopens its content', async () => {
    const user = userEvent.setup();
    vi.mocked(listSimilarForProposal).mockResolvedValue([MATCH]);
    renderCard(true);
    await screen.findByText(MATCH.title);

    await user.click(screen.getByRole('button', { name: /hide/i }));
    expect(screen.queryByText(MATCH.title)).toBeNull();

    await user.click(screen.getByRole('button', { name: /show/i }));
    expect(await screen.findByText(MATCH.title)).toBeInTheDocument();
  });
});
