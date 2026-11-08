import { useEffect, useId, useState } from 'react';
import { Building2, CalendarDays, GraduationCap, X } from 'lucide-react';

import ErrorState from '@/components/feedback/ErrorState';
import LoadingState from '@/components/feedback/LoadingState';
import { Button } from '@/components/ui/button';
import SimilarProjectsList from '@/components/library/SimilarProjectsList';
import { useFocusTrap } from '@/lib/hooks/useFocusTrap';
import { useLibraryProject } from '../hooks/useProjectLibrary';

export interface ProjectDetailPanelProps {
  /** `null` closes the panel; the hook stays mounted per the rules of hooks. */
  projectId: string | null;
  onClose: () => void;
  /** Swap the panel to another library row (a similar project). */
  onSelectSimilar?: (projectId: string) => void;
}

/**
 * Read-only library detail (ADR-18) — description, metadata and advisory
 * similar projects. It deliberately offers no path into the project
 * workspace: the library is a research surface, not a navigation shortcut.
 */
export default function ProjectDetailPanel({ projectId, onClose, onSelectSimilar }: ProjectDetailPanelProps) {
  const titleId = useId();
  const query = useLibraryProject(projectId ?? undefined);
  const trapRef = useFocusTrap<HTMLDivElement>(projectId !== null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setExpanded(false);
  }, [projectId]);

  useEffect(() => {
    if (projectId === null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [projectId, onClose]);

  if (projectId === null) return null;

  const project = query.data?.project;
  const description = project?.description ?? '';
  const clamped = description.length > 320 && !expanded;

  return (
    <div
      className="fixed inset-0 z-40 bg-black/40"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="ml-auto flex h-full w-full max-w-xl flex-col overflow-y-auto border-l border-border bg-background shadow-2xl"
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border bg-background/95 px-5 py-4 backdrop-blur">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-widest text-primary">
              Project library
            </p>
            <h2 id={titleId} className="mt-0.5 truncate font-display text-xl font-semibold">
              {project?.title ?? 'Project details'}
            </h2>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Close project details"
            onClick={onClose}
          >
            <X aria-hidden="true" />
          </Button>
        </header>

        <div className="flex flex-col gap-5 px-5 py-5">
          {query.isPending ? (
            <LoadingState label="Loading project…" />
          ) : query.isError ? (
            <ErrorState
              message="This project could not be loaded right now."
              onRetry={() => void query.refetch()}
            />
          ) : !project ? (
            <ErrorState title="Project not found" message="It may have been archived or removed." />
          ) : (
            <>
              <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                <div className="flex items-start gap-2">
                  <GraduationCap className="mt-0.5 size-4 text-muted-foreground" aria-hidden="true" />
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">Student</dt>
                    <dd className="font-medium text-foreground">
                      {project.student.firstName} {project.student.lastName}
                    </dd>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Building2 className="mt-0.5 size-4 text-muted-foreground" aria-hidden="true" />
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">Department</dt>
                    <dd className="font-medium text-foreground">
                      {project.department?.name ?? 'Unassigned'}
                    </dd>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <CalendarDays className="mt-0.5 size-4 text-muted-foreground" aria-hidden="true" />
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">Session</dt>
                    <dd className="font-medium text-foreground">{project.session ?? 'Not set'}</dd>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <GraduationCap className="mt-0.5 size-4 text-muted-foreground" aria-hidden="true" />
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">Supervisor</dt>
                    <dd className="font-medium text-foreground">
                      {project.supervisors.length > 0
                        ? project.supervisors
                            .map((person) => `${person.firstName} ${person.lastName}`)
                            .join(', ')
                        : 'None recorded'}
                    </dd>
                  </div>
                </div>
              </dl>

              <section aria-labelledby={`${titleId}-description`}>
                <h3
                  id={`${titleId}-description`}
                  className="text-sm font-semibold text-foreground"
                >
                  Description
                </h3>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                  {clamped ? `${description.slice(0, 320)}…` : description}
                </p>
                {description.length > 320 && (
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="px-0"
                    aria-expanded={expanded}
                    onClick={() => setExpanded((value) => !value)}
                  >
                    {expanded ? 'Show less' : 'Show more'}
                  </Button>
                )}
              </section>

              <section aria-labelledby={`${titleId}-similar`}>
                <h3 id={`${titleId}-similar`} className="text-sm font-semibold text-foreground">
                  Similar projects
                </h3>
                <p className="mb-2 mt-0.5 text-xs text-muted-foreground">
                  Keyword and fuzzy matches from across the institution — advisory only.
                </p>
                <SimilarProjectsList
                  items={query.data?.similar ?? []}
                  emptyMessage="No similar projects found in the library."
                  onSelect={onSelectSimilar}
                />
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
