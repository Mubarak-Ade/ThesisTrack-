import { useId, useState } from 'react';
import { ChevronDown, LibraryBig } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import SimilarProjectsList from '@/components/library/SimilarProjectsList';
import { useProposalSimilar } from '../hooks/useProposals';

export interface SimilarProjectsCardProps {
  proposalId: string;
  /**
   * The parent decides visibility from the loaded proposal and the current
   * user. A student (owner) passes false, so the API is never asked a question
   * it would answer with 403.
   */
  enabled: boolean;
}

/**
 * Advisory duplicate detection in the review panel (ADR-18). It never blocks a
 * decision: an unavailable library degrades to an inline retry and the review
 * form keeps working.
 */
export default function SimilarProjectsCard({
  proposalId,
  enabled,
}: SimilarProjectsCardProps) {
  const headingId = useId();
  const contentId = useId();
  const [open, setOpen] = useState(true);
  const query = useProposalSimilar(proposalId, enabled);

  if (!enabled) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base" id={headingId}>
            <LibraryBig className="size-4 text-primary" aria-hidden="true" />
            Similar existing projects
          </CardTitle>
          <CardDescription className="mt-1">
            Advisory matches from the institution-wide library. They never block a decision.
          </CardDescription>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-expanded={open}
          aria-controls={contentId}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? 'Hide' : 'Show'}
          <ChevronDown
            aria-hidden="true"
            className={open ? 'rotate-180 transition-transform' : 'transition-transform'}
          />
        </Button>
      </CardHeader>

      {open && (
        <CardContent id={contentId} aria-labelledby={headingId}>
          {query.isPending ? (
            <p className="text-sm text-muted-foreground">Checking the project library…</p>
          ) : query.isError ? (
            <div role="alert" className="flex flex-col items-start gap-2">
              <p className="text-sm text-danger">
                Similar projects could not be loaded. Your review can continue.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void query.refetch()}
              >
                Try again
              </Button>
            </div>
          ) : (
            <SimilarProjectsList
              items={query.data ?? []}
              emptyMessage="No similar projects found in the library."
            />
          )}
        </CardContent>
      )}
    </Card>
  );
}
