import { db } from '../config/db.js';
import { notifications } from '../schema/index.js';

/**
 * §15.4 — the **single** notification write helper (task 7.2).
 *
 * Every domain service calls this inside its own transaction, so a
 * notification is written in the same unit as the state change it reports:
 * never orphaned (the change rolled back but the row survived) and never
 * lying (the row missing while the change committed). There is no other
 * insert path for `notifications` — a test-free invariant kept by review: the
 * only alternative this phase replaced was `proposals/repository.insertNotification`,
 * now deleted so this module owns the table's writes.
 *
 * Recipient resolution is the caller's job (§15.2's table): counterparties of
 * the event, never a broadcast. `notify` deliberately does no filtering — the
 * decision "who hears about this" belongs next to the domain rules that
 * determine it.
 */
export type NotificationType = typeof notifications.$inferInsert['type'];

export interface NotifyInput {
  /** The single recipient — one row per user (§15.4 reads are per-user). */
  userId: string;
  type: NotificationType;
  title: string;
  message?: string | null;
  /** e.g. `proposal` | `submission` | `milestone` | `assignment` — for linking. */
  resourceType?: string | null;
  resourceId?: string | null;
}

/** Multi-statement units pass their transaction; standalone calls default. */
export type NotifyExecutor = Pick<typeof db, 'insert'>;

/** Insert one notification row — inside `executor` when one is given (§15.4). */
export async function notify(input: NotifyInput, executor: NotifyExecutor = db): Promise<void> {
  await executor.insert(notifications).values({
    userId: input.userId,
    type: input.type,
    title: input.title,
    message: input.message ?? null,
    resourceType: input.resourceType ?? null,
    resourceId: input.resourceId ?? null,
  });
}
