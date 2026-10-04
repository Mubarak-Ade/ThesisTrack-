import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BellRing, CheckCheck, MailOpen } from 'lucide-react';

import { Button } from '@/components/ui/button';
import Pagination from '@/components/ui/pagination';
import EmptyState from '@/components/feedback/EmptyState';
import ErrorState from '@/components/feedback/ErrorState';
import LoadingState from '@/components/feedback/LoadingState';
import SampleDataBanner from '@/components/feedback/SampleDataBanner';
import { formatRelative } from '@/lib/utils/time';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from '../hooks/useNotifications';
import type { AppNotification, NotificationKind } from '../data/types';

const KIND_LABEL: Record<NotificationKind, string> = {
  assignment: 'Assignment',
  submission: 'Submission',
  review: 'Review',
  feedback: 'Feedback',
  milestone: 'Milestone',
  general: 'General',
  proposal: 'Proposal',
  deadline: 'Deadline',
};

/** Deep link for the resources that have a student screen today. */
function resourceHref(row: AppNotification): string | null {
  if (row.resourceType === 'proposal' && row.resourceId) return `/proposals/${row.resourceId}`;
  if (row.resourceType === 'submission' && row.resourceId) {
    return `/project/submissions/${row.resourceId}`;
  }
  return null;
}

const PAGE_SIZE = 20;

/**
 * §16.3 Notifications — the bell's destination. The `?unread=true` search
 * param *is* the filter (task 11.5), so a filtered view is linkable and the
 * back button behaves; "Mark all as read" and per-row "Mark as read" are the
 * only writes, and both surface failures instead of pretending (§10.4).
 */
export default function NotificationsScreen() {
  const [params, setParams] = useSearchParams();
  const unreadOnly = params.get('unread') === 'true';
  const [page, setPage] = useState(1);

  const query = useNotifications({ page, limit: PAGE_SIZE, unreadOnly });
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();

  function setFilter(unread: boolean): void {
    const next = new URLSearchParams(params);
    if (unread) next.set('unread', 'true');
    else next.delete('unread');
    setParams(next, { replace: true });
    setPage(1);
  }

  const data = query.data;
  const pageCount = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));
  const unreadCount = (data?.items ?? []).filter((row) => row.readAt === null).length;

  return (
    <div className="mx-auto w-full max-w-[1000px] px-4 py-6 sm:px-6 sm:py-8">
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
      >
        <span>Home</span>
        <span aria-hidden="true">›</span>
        <span className="text-foreground">Notifications</span>
      </nav>

      <header className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground sm:text-3xl">
            Notifications
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Updates from your projects — proposals, reviews, milestones and deadlines.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter">
          <Button
            type="button"
            variant={unreadOnly ? 'outline' : 'secondary'}
            size="sm"
            aria-pressed={!unreadOnly}
            onClick={() => setFilter(false)}
          >
            All
          </Button>
          <Button
            type="button"
            variant={unreadOnly ? 'secondary' : 'outline'}
            size="sm"
            aria-pressed={unreadOnly}
            onClick={() => setFilter(true)}
          >
            Unread{unreadCount > 0 ? ` (${unreadCount})` : ''}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={markAll.isPending || unreadCount === 0}
            onClick={() => markAll.mutate()}
          >
            <CheckCheck aria-hidden="true" /> Mark all as read
          </Button>
        </div>
      </header>

      {data?.usedFallback && <div className="mt-4"><SampleDataBanner /></div>}

      <section className="mt-6" aria-label="Notification feed">
        {query.isPending ? (
          <LoadingState label="Loading notifications…" />
        ) : query.isError ? (
          <ErrorState
            message="Your notifications could not be loaded right now."
            onRetry={() => void query.refetch()}
          />
        ) : !data || data.items.length === 0 ? (
          <EmptyState
            icon={<BellRing className="size-5" />}
            eyebrow={unreadOnly ? 'Nothing pending' : 'All clear'}
            title={unreadOnly ? 'No unread notifications' : 'No notifications yet'}
            description={
              unreadOnly
                ? 'You have read everything — switch to “All” to see the full history.'
                : 'When your supervisor, coordinator or deadlines change something, it shows up here.'
            }
            action={
              unreadOnly ? (
                <Button type="button" variant="outline" onClick={() => setFilter(false)}>
                  Show all
                </Button>
              ) : undefined
            }
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {data.items.map((row) => {
              const unread = row.readAt === null;
              const href = resourceHref(row);
              return (
                <li
                  key={row.id}
                  className="flex flex-wrap items-start gap-3 rounded-xl border bg-card p-4"
                  aria-label={unread ? 'Unread notification' : undefined}
                >
                  <span
                    className={
                      unread
                        ? 'mt-1.5 size-2.5 shrink-0 rounded-full bg-primary'
                        : 'mt-1.5 size-2.5 shrink-0 rounded-full bg-muted'
                    }
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className={`text-sm ${unread ? 'font-semibold' : 'font-medium'}`}>
                        {row.title}
                      </p>
                      <span className="rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {KIND_LABEL[row.kind]}
                      </span>
                    </div>
                    {row.message && (
                      <p className="mt-1 break-words text-sm text-muted-foreground">{row.message}</p>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {row.createdAt ? formatRelative(row.createdAt) : ''}
                      {unread && <span className="sr-only"> — unread</span>}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {href && (
                      <Button asChild variant="ghost" size="sm">
                        <Link to={href}>Open</Link>
                      </Button>
                    )}
                    {unread && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={markRead.isPending}
                        onClick={() => markRead.mutate(row.id)}
                      >
                        <MailOpen aria-hidden="true" /> Mark read
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {data && data.items.length > 0 && (
        <div className="mt-6">
          <Pagination
            page={page}
            pageCount={pageCount}
            loading={query.isFetching}
            footer={`Showing ${data.items.length} of ${data.total} notifications`}
            onPageChange={setPage}
          />
        </div>
      )}
    </div>
  );
}
