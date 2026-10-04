import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, ScrollText } from 'lucide-react';

import { Button } from '@/components/ui/button';
import Pagination from '@/components/ui/pagination';
import EmptyState from '@/components/feedback/EmptyState';
import ErrorState from '@/components/feedback/ErrorState';
import LoadingState from '@/components/feedback/LoadingState';
import SampleDataBanner from '@/components/feedback/SampleDataBanner';
import { formatRelative } from '@/lib/utils/time';
import { useAuthStore } from '@/stores/auth';
import ProposalStatusBadge from '../components/ProposalStatusBadge';
import { useProposals } from '../hooks/useProposals';
import type { ProposalStatus } from '../data/types';

const FILTERS: Array<{ value: ProposalStatus | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'under_review', label: 'Under review' },
  { value: 'revision_required', label: 'Revision required' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];

const PAGE_SIZE = 10;

/**
 * §16.3 Proposals — the role-scoped list (§11.3 `GET /proposals` scopes by
 * role server-side: students see their own, supervisors their caseload,
 * administrators everything). Students get the create action; everyone gets
 * the same rows, chips and honest pagination.
 */
export default function ProposalList() {
  const role = useAuthStore((s) => s.user?.role);
  const [status, setStatus] = useState<ProposalStatus | 'all'>('all');
  const [page, setPage] = useState(1);

  const query = useProposals({ page, limit: PAGE_SIZE, status: status === 'all' ? undefined : status });
  const data = query.data;
  const pageCount = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-6 sm:px-6 sm:py-8">
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
      >
        <span>Home</span>
        <span aria-hidden="true">›</span>
        <span className="text-foreground">Proposals</span>
      </nav>

      <header className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground sm:text-3xl">
            Proposals
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Final-year project proposals — drafts, submissions, revisions and approvals.
          </p>
        </div>
        {role === 'student' && (
          <Button asChild>
            <Link to="/proposals/new">
              <Plus aria-hidden="true" /> New proposal
            </Link>
          </Button>
        )}
      </header>

      {data?.usedFallback && (
        <div className="mt-4">
          <SampleDataBanner />
        </div>
      )}

      <div
        className="mt-5 flex flex-wrap items-center gap-2"
        role="group"
        aria-label="Filter by status"
      >
        {FILTERS.map((filter) => (
          <button
            key={filter.value}
            type="button"
            aria-pressed={status === filter.value}
            onClick={() => {
              setStatus(filter.value);
              setPage(1);
            }}
            className={
              status === filter.value
                ? 'rounded-full border border-primary bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground'
                : 'rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-muted-foreground hover:text-foreground'
            }
          >
            {filter.label}
          </button>
        ))}
      </div>

      <section className="mt-5" aria-label="Proposal list">
        {query.isPending ? (
          <LoadingState label="Loading proposals…" />
        ) : query.isError ? (
          <ErrorState
            message="Your proposals could not be loaded right now."
            onRetry={() => void query.refetch()}
          />
        ) : !data || data.items.length === 0 ? (
          <EmptyState
            icon={<ScrollText className="size-5" />}
            eyebrow="Nothing here yet"
            title={status === 'all' ? 'No proposals yet' : 'No proposals with this status'}
            description={
              role === 'student'
                ? 'A proposal is the first step: write your title and abstract, attach your document and send it to your supervisor.'
                : 'No proposals match this filter in your scope.'
            }
            action={
              role === 'student' ? (
                <Button asChild>
                  <Link to="/proposals/new">
                    <Plus aria-hidden="true" /> New proposal
                  </Link>
                </Button>
              ) : undefined
            }
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {data.items.map((proposal) => (
              <li key={proposal.id}>
                <Link
                  to={`/proposals/${proposal.id}`}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border bg-card px-4 py-3 transition-colors hover:border-primary/40"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-foreground">
                      {proposal.title}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      v{proposal.version} · updated {formatRelative(proposal.updatedAt)}
                      {role !== 'student' &&
                        ` · ${proposal.student.firstName} ${proposal.student.lastName}`}
                    </span>
                  </span>
                  <ProposalStatusBadge status={proposal.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {data && data.items.length > 0 && (
        <div className="mt-6">
          <Pagination
            page={page}
            pageCount={pageCount}
            loading={query.isFetching}
            footer={`Showing ${data.items.length} of ${data.total} proposals`}
            onPageChange={setPage}
          />
        </div>
      )}
    </div>
  );
}
