import { Request, RequestHandler } from 'express';
import {
  AuthorizationError,
  BusinessRuleError,
  NotFoundError,
} from '../errors/index.js';
import { asyncHandler } from '../lib/async-handler.js';
import { Role } from '../lib/roles.js';
import { requireUser } from './guards.js';

export interface WorkflowResource<S extends string = string> {
  status: S;
}

export interface WorkflowOptions<S extends string, A extends string> {
  /** Noun used in the404 message (default: 'Resource'). */
  resource?: string;
  /** Loads the current resource; `undefined` →404. */
  load: (req: Request) => Promise<WorkflowResource<S> | undefined>;
  /** The action being attempted — fixed key or derived from the request. */
  action: A | ((req: Request) => A);
  /** action → statuses it may start from. */
  transitions: Record<A, readonly S[]>;
  /** action → roles permitted (absent = any authenticated user). */
  roles?: Partial<Record<A, readonly Role[]>>;
}

interface WorkflowContext {
  action: string;
  resource: unknown;
}

const workflowContexts = new WeakMap<Request, WorkflowContext>();

/** The resource `requireWorkflow` validated, for the handler to reuse. */
export function getWorkflowContext<T = unknown>(
  req: Request,
): { action: string; resource: T } | undefined {
  const ctx = workflowContexts.get(req);
  return ctx ? { action: ctx.action, resource: ctx.resource as T } : undefined;
}

/**
 * Layer 3 — workflow authorization: "may *this* actor perform *this* action
 * on *this* resource in its *current state*?"
 *
 *   1. role check    → wrong actor            → 403 AuthorizationError
 *   2. state check   → impossible transition  → 422 BusinessRuleError
 *
 * Example:
 *   requireWorkflow({
 *     resource: 'Proposal',
 *     load: (req) => findProposalById(req.params.proposalId),
 *     action: (req) => (req.body as { action: string }).action,
 *     transitions: { submit: ['draft'], withdraw: ['draft', 'submitted'] },
 *     roles: { submit: ['student'], withdraw: ['student', 'supervisor'] },
 *   })
 */
export function requireWorkflow<S extends string, A extends string>(
  options: WorkflowOptions<S, A>,
): RequestHandler {
  return asyncHandler(async (req, _res, next) => {
    const user = requireUser(req);

    const resource = await options.load(req);
    if (!resource) {
      throw new NotFoundError(options.resource ?? 'Resource');
    }

    const action = typeof options.action === 'function' ? options.action(req) : options.action;

    // Who may act?
    const allowedRoles = options.roles?.[action];
    if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
      throw new AuthorizationError(`You are not allowed to '${action}'`);
    }

    // …and in which state may they act?
    const allowedStatuses = options.transitions[action];
    if (!allowedStatuses) {
      throw new BusinessRuleError(`Unknown workflow action '${action}'`);
    }
    if (!allowedStatuses.includes(resource.status)) {
      throw new BusinessRuleError(`Cannot '${action}' while in status '${resource.status}'`, [
        { path: 'status', message: `'${action}' is not permitted from status '${resource.status}'` },
      ]);
    }

    workflowContexts.set(req, { action, resource });
    next();
  });
}
