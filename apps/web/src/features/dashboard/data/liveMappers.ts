/**
 * Pure payload → dashboard mappers for the LIVE Coordinator Dashboard path.
 * Every mapper throws on contract drift so `dashboardRepo` can take its
 * all-or-nothing fallback (fixtures + SampleDataBanner) instead of ever
 * rendering a half-mapped screen (spec §4 Rule 1, §10.4).
 */
import { formatDue, formatRelative } from '@/lib/utils/time';
import type {
  CriticalTask,
  DashActivity,
  TaskItem,
  WorkspaceRow,
  WorkspaceStatus,
} from './types';

/* ------------------------------------------------------------- plumbing */

function asRecord(value: unknown, scope: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    throw new Error(`[dashboard] ${scope} is not an object`);
  }
  return value as Record<string, unknown>;
}

/** Read a required array off an envelope (`{ <key>: [...] }`). */
function envelope(payload: unknown, key: string): unknown[] {
  const list = asRecord(payload, `${key} payload`)[key];
  if (!Array.isArray(list)) throw new Error(`[dashboard] ${key} envelope missing`);
  return list;
}

/** `pagination.total` probe reader (§11 list contract — throws on drift). */
export function probeTotal(payload: unknown): number {
  const total = asRecord(payload, 'pagination payload').pagination;
  const value = asRecord(total, 'pagination').total;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error('[dashboard] pagination.total missing');
  }
  return value;
}

/** Timestamp → epoch ms; unreadable values are drift, not a silent skip. */
function toMs(value: unknown, scope: string): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string' || typeof value === 'number') {
    const ms = new Date(value).getTime();
    if (Number.isFinite(ms)) return ms;
  }
  throw new Error(`[dashboard] unreadable timestamp in ${scope}`);
}

/* -------------------------------------------------------- workspace rows */

const LIVE_STATUSES = ['active', 'completed', 'archived'] as const;
type LiveStatus = (typeof LIVE_STATUSES)[number];

const STATUS_MAP: Record<LiveStatus, WorkspaceStatus> = {
  active: 'IN PROGRESS',
  completed: 'COMPLETED',
  archived: 'ARCHIVED',
};

function isLiveStatus(value: unknown): value is LiveStatus {
  return LIVE_STATUSES.includes(value as LiveStatus);
}

export interface LiveProject {
  id: string;
  title: string;
  status: LiveStatus;
  studentName: string;
}

/** `GET /projects` list rows (§11.2 — throws on contract drift). */
export function mapProjectList(payload: unknown): LiveProject[] {
  return envelope(payload, 'projects').map((raw) => {
    const row = asRecord(raw, 'project');
    if (typeof row.id !== 'string' || typeof row.title !== 'string' || !isLiveStatus(row.status)) {
      throw new Error('[dashboard] project row drifted from the /projects contract');
    }
    const student = asRecord(row.student, 'project student');
    if (typeof student.firstName !== 'string' || typeof student.lastName !== 'string') {
      throw new Error('[dashboard] project student drifted from the /projects contract');
    }
    return {
      id: row.id,
      title: row.title,
      status: row.status,
      studentName: `${student.firstName} ${student.lastName}`,
    };
  });
}

/**
 * One table row: the list fields plus the per-project stage/supervisor
 * fan-out. Live rows carry no thesis `code` (the API has no such field) —
 * the table renders the cell only when a code exists.
 */
export function mapWorkspaceRow(
  project: LiveProject,
  stagesPayload: unknown,
  supervisorPayload: unknown,
): WorkspaceRow {
  const stages = asRecord(stagesPayload, 'stages payload');
  if (!Array.isArray(stages.stages)) throw new Error('[dashboard] stages envelope missing');
  const current =
    stages.current === null || stages.current === undefined
      ? null
      : asRecord(stages.current, 'current stage');
  const phase =
    current && typeof current.name === 'string' && current.name.length > 0 ? current.name : '—';

  const assignment = asRecord(supervisorPayload, 'supervisor payload');
  if (!('active' in assignment)) throw new Error('[dashboard] supervisor envelope missing');
  let supervisor = 'Unassigned';
  if (assignment.active !== null && assignment.active !== undefined) {
    const active = asRecord(assignment.active, 'active assignment');
    const person = asRecord(active.supervisor, 'active supervisor');
    if (typeof person.firstName !== 'string' || typeof person.lastName !== 'string') {
      throw new Error('[dashboard] active supervisor drifted from the contract');
    }
    supervisor = `${person.firstName} ${person.lastName}`;
  }

  return {
    id: project.id,
    student: project.studentName,
    project: project.title,
    phase,
    status: STATUS_MAP[project.status],
    supervisor,
  };
}

/* -------------------------------------------------------- activity feed */

/** The nine derived kinds (§11.13) collapse onto the three rail icons. */
function iconKind(kind: string): DashActivity['iconKind'] {
  if (kind.startsWith('proposal.')) return 'proposal';
  if (kind.startsWith('milestone.') || kind.startsWith('stage.')) return 'milestone';
  // feedback.* · submission.* · assignment.changed (and any future kind).
  return 'feedback';
}

/**
 * Merge the per-project `/activity` feeds, newest first, capped at four
 * (the rail's mockup length).
 */
export function mapActivity(payloads: unknown[]): DashActivity[] {
  const events = payloads.flatMap((payload) =>
    envelope(payload, 'activity').map((raw) => {
      const row = asRecord(raw, 'activity entry');
      if (typeof row.kind !== 'string' || typeof row.summary !== 'string') {
        throw new Error('[dashboard] activity entry drifted from the /activity contract');
      }
      return { at: toMs(row.at, 'activity entry'), kind: row.kind, summary: row.summary };
    }),
  );

  return events
    .sort((left, right) => right.at - left.at)
    .slice(0, 4)
    .map((event) => ({
      iconKind: iconKind(event.kind),
      strong: event.summary,
      when: formatRelative(event.at).toUpperCase(),
    }));
}

/* ----------------------------------------------------------- task rails */

/** Deadline cards only cover milestones still on the student (`§11.4`). */
const OPEN_MILESTONE_STATUSES = new Set(['pending', 'in_progress', 'submitted']);
const UPCOMING_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export interface MilestoneFeed {
  payload: unknown;
  projectTitle: string;
}

/**
 * Classify the per-project `/milestones` feeds into the OVERDUE / UPCOMING
 * groups: past-due vs. due within seven days, open statuses only, three of
 * each (soonest first).
 */
export function mapMilestoneTasks(
  feeds: MilestoneFeed[],
  now: number,
): { upcoming: TaskItem[]; overdue: TaskItem[] } {
  const overdue: { dueAt: number; item: TaskItem }[] = [];
  const upcoming: { dueAt: number; item: TaskItem }[] = [];

  for (const feed of feeds) {
    for (const raw of envelope(feed.payload, 'milestones')) {
      const row = asRecord(raw, 'milestone');
      if (typeof row.title !== 'string') throw new Error('[dashboard] milestone title missing');
      if (row.dueAt === null || row.dueAt === undefined) continue; // no deadline → no card
      if (typeof row.status !== 'string' || !OPEN_MILESTONE_STATUSES.has(row.status)) continue;

      const dueAt = toMs(row.dueAt, 'milestone dueAt');
      const title = `${row.title} — ${feed.projectTitle}`;
      if (dueAt < now) {
        overdue.push({ dueAt, item: { kind: 'OVERDUE', title, due: 'URGENT' } });
      } else if (dueAt <= now + UPCOMING_WINDOW_MS) {
        // `formatRelative` is past-oriented ("just now" for a future instant);
        // `formatDue` reads forward honestly — "due in 3 days".
        upcoming.push({ dueAt, item: { kind: 'UPCOMING', title, due: formatDue(dueAt).label } });
      }
    }
  }

  overdue.sort((left, right) => left.dueAt - right.dueAt);
  upcoming.sort((left, right) => left.dueAt - right.dueAt);
  return {
    overdue: overdue.slice(0, 3).map((entry) => entry.item),
    upcoming: upcoming.slice(0, 3).map((entry) => entry.item),
  };
}

export interface ProposalProbes {
  submitted: number;
  underReview: number;
  rejected: number;
}

/** ACTION-REQUIRED entries + the red Critical Deadline card (spec §5.1). */
export function mapProposalTasks(probes: ProposalProbes): {
  action: TaskItem[];
  critical: CriticalTask;
} {
  const action: TaskItem[] = [];
  if (probes.submitted > 0) {
    action.push({
      kind: 'ACTION REQUIRED',
      title: `Review ${probes.submitted} submitted proposal${probes.submitted === 1 ? '' : 's'}`,
      due: 'Awaiting decision',
    });
  }
  if (probes.underReview > 0) {
    action.push({
      kind: 'ACTION REQUIRED',
      title: `${probes.underReview} proposal${probes.underReview === 1 ? '' : 's'} in review`,
      due: 'Continue review',
    });
  }

  return {
    action,
    critical: {
      bodyLead: 'Follow up: ',
      dateEm: `${probes.rejected} rejected proposal${probes.rejected === 1 ? '' : 's'}`,
      bodyTail:
        probes.rejected > 0
          ? ' \u2014 students must start a new submission.'
          : ' \u2014 nothing needs a new submission right now.',
      cta: 'Open Proposals \u2192',
      to: '/proposals',
    },
  };
}
