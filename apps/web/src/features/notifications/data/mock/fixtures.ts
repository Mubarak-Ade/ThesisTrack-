import type { AppNotification } from '../types';

/** §10.4 fixture fallback for the bell feed — illustrative, clearly banner'd. */
export const NOTIFICATION_FIXTURES: AppNotification[] = [
  {
    id: '00000000-0000-4000-8000-0000000000f1',
    kind: 'proposal',
    title: 'Your proposal needs revision',
    message: 'Dr. Helen Brooks asked for a narrower scope in section 2.',
    resourceType: 'proposal',
    resourceId: '00000000-0000-4000-8000-0000000000p1',
    readAt: null,
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: '00000000-0000-4000-8000-0000000000f2',
    kind: 'milestone',
    title: 'Milestone due soon',
    message: '“Literature review” is due in 3 days.',
    resourceType: 'milestone',
    resourceId: null,
    readAt: null,
    createdAt: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: '00000000-0000-4000-8000-0000000000f3',
    kind: 'assignment',
    title: 'Supervisor assigned',
    message: 'Dr. Helen Brooks is now your supervisor.',
    resourceType: 'assignment',
    resourceId: null,
    readAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
    createdAt: new Date(Date.now() - 4 * 86_400_000).toISOString(),
  },
  {
    id: '00000000-0000-4000-8000-0000000000f4',
    kind: 'general',
    title: 'Welcome to ThesisTrack',
    message: 'Your department has opened the final-year project workspace.',
    resourceType: null,
    resourceId: null,
    readAt: new Date(Date.now() - 6 * 86_400_000).toISOString(),
    createdAt: new Date(Date.now() - 7 * 86_400_000).toISOString(),
  },
];
