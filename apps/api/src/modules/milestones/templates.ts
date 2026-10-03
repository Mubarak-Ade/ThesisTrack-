import { asc, eq } from 'drizzle-orm';

import { db } from '../../config/db.js';
import { NotFoundError } from '../../errors/index.js';
import { milestoneTemplates } from '../../schema/index.js';
import type { CreateTemplateInput, PatchTemplateInput } from './schema.js';
import type { MilestoneTemplateRow, MilestoneTemplateItem } from './types.js';

/**
 * Milestone TEMPLATE service (spec §9.3 names this file inside the module —
 * `milestones/ (+ templates.ts)` — so template concerns live here rather than
 * inflating `service.ts`; queries and rules colocated, no Express imports).
 *
 * ADR-05: one table with a JSONB `items` column, edited whole. Templates are
 * read whole and edited whole, so there is no item-level repository to write.
 *
 * There are no uniqueness constraints on `name` (§8.5): duplicates are legal
 * data — `seed:templates` repairs by name (oldest row wins, matching the
 * §5.4 `Default` fallback lookup), and nothing here invents a 409 the schema
 * does not enforce.
 */

function normalizeItems(input: CreateTemplateInput['items']): MilestoneTemplateItem[] {
  return (input ?? []).map((item) => ({
    title: item.title,
    description: item.description ?? null,
    dueOffsetDays: item.dueOffsetDays,
  }));
}

/* ------------------------------------------------------------------ reads */

/** All templates, stable order — §11.4's supervisor/admin list. */
export function listTemplates(): Promise<MilestoneTemplateRow[]> {
  return db.query.milestoneTemplates.findMany({
    orderBy: [asc(milestoneTemplates.name), asc(milestoneTemplates.createdAt), asc(milestoneTemplates.id)],
  });
}

export function findTemplateById(id: string): Promise<MilestoneTemplateRow | undefined> {
  return db.query.milestoneTemplates.findFirst({ where: eq(milestoneTemplates.id, id) });
}

/** 404 wrapper for handlers behind param validation (malformed → 400 first). */
export async function getTemplate(id: string): Promise<MilestoneTemplateRow> {
  const template = await findTemplateById(id);
  if (!template) throw new NotFoundError('Milestone template');
  return template;
}

/* ---------------------------------------------------------------- writes */

/** POST /milestone-templates — admin only (§11.4); empty items are legal. */
export async function createTemplate(
  actorId: string,
  input: CreateTemplateInput,
): Promise<MilestoneTemplateRow> {
  const [created] = await db
    .insert(milestoneTemplates)
    .values({
      name: input.name,
      description: input.description ?? null,
      items: normalizeItems(input.items),
      createdBy: actorId,
    })
    .returning();
  return created;
}

/** PATCH /milestone-templates/:templateId — whole-item-set edit (ADR-05). */
export async function patchTemplate(
  template: MilestoneTemplateRow,
  input: PatchTemplateInput,
): Promise<MilestoneTemplateRow> {
  const [updated] = await db
    .update(milestoneTemplates)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.items !== undefined ? { items: normalizeItems(input.items) } : {}),
      updatedAt: new Date(),
    })
    .where(eq(milestoneTemplates.id, template.id))
    .returning();
  return updated ?? template;
}

/**
 * DELETE /milestone-templates/:templateId — unreferenced by design: approval
 * materialises copies (§5.4 step 4), never FK pointers, so deleting a template
 * cannot touch a project's milestones. The `Default` name fallback simply
 * finds nothing afterwards and approval proceeds with zero milestones — §5.4
 * never fails on template data.
 */
export async function deleteTemplate(template: MilestoneTemplateRow): Promise<MilestoneTemplateRow> {
  const [deleted] = await db
    .delete(milestoneTemplates)
    .where(eq(milestoneTemplates.id, template.id))
    .returning();
  return deleted ?? template;
}
