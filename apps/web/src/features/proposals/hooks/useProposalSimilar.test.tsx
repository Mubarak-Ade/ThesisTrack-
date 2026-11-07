import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { listSimilarForProposal } from '../data/similarProjects';
import type { SimilarProject } from '../data/similarProjects';
import { useProposalSimilar } from './useProposals';

vi.mock('../data/proposalsRepo', () => ({
  createProposal: vi.fn(),
  getProposal: vi.fn(),
  listProposals: vi.fn(),
  patchProposal: vi.fn(),
  removeAttachment: vi.fn(),
  reviewProposal: vi.fn(),
  startProposalReview: vi.fn(),
  submitProposal: vi.fn(),
  uploadAttachment: vi.fn(),
}));

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

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useProposalSimilar', () => {
  it('does not fire when enabled is false', () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useProposalSimilar('proposal-1', false), {
      wrapper,
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(listSimilarForProposal).not.toHaveBeenCalled();
  });

  it('uses the proposal-similar key and a 30 s stale time when enabled', async () => {
    vi.mocked(listSimilarForProposal).mockResolvedValue([MATCH]);
    const { client, wrapper } = setup();

    const { result } = renderHook(() => useProposalSimilar('proposal-1', true), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const query = client.getQueryCache().find({
      queryKey: ['proposal-similar', 'proposal-1'],
    });
    expect(query).toBeDefined();
    expect((query!.options as { staleTime?: number }).staleTime).toBe(30_000);
    expect(listSimilarForProposal).toHaveBeenCalledWith('proposal-1');
  });
});
