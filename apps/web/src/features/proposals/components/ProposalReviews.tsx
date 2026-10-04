import { Check, MessageSquareWarning, X } from 'lucide-react';

import { formatRelative } from '@/lib/utils/time';
import type { ProposalReview } from '../data/types';

const DECISION: Record<ProposalReview['decision'], { label: string; tone: string }> = {
  approved: { label: 'Approved', tone: 'text-success' },
  revision_required: { label: 'Revision required', tone: 'text-warning' },
  rejected: { label: 'Rejected', tone: 'text-danger' },
};

/**
 * §16.4 review history — append-only (I8): rows are displayed exactly as
 * recorded, newest first, with no edit or delete affordance anywhere.
 */
export default function ProposalReviews({ reviews }: { reviews: ProposalReview[] }) {
  if (reviews.length === 0) {
    return <p className="text-sm text-muted-foreground">No review decisions yet.</p>;
  }

  return (
    <ol className="flex flex-col gap-3">
      {reviews.map((review) => {
        const decision = DECISION[review.decision];
        const Icon =
          review.decision === 'approved' ? Check : review.decision === 'rejected' ? X : MessageSquareWarning;
        return (
          <li key={review.id} className="rounded-lg border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className={`inline-flex items-center gap-1.5 text-sm font-semibold ${decision.tone}`}>
                <Icon className="size-4" aria-hidden="true" /> {decision.label}
              </span>
              <span className="text-xs text-muted-foreground">
                {review.reviewer.firstName} {review.reviewer.lastName} ·{' '}
                {formatRelative(review.createdAt)}
              </span>
            </div>
            {review.comment && (
              <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">{review.comment}</p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
