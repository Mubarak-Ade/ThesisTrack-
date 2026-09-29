import { eq } from 'drizzle-orm';
import { db } from '../config/db.js';
import { users, milestoneTemplates } from '../schema/index.js';

/**
 * Seeds the three milestone templates required by spec §8.5 (ADR-05).
 *
 * Idempotent and safe to re-run: a template is matched by `name` and its
 * items are replaced, so this repairs drift rather than duplicating rows.
 *
 *   pnpm seed:templates                      → prints JSON
 *
 * These are templates, not milestones — nothing here is due-dated. They are
 * materialised into `milestones` at project approval with
 * `due_at = projects.created_at + dueOffsetDays` (spec §5.4 step 4).
 */
type SeedItem = { title: string; description: string | null; dueOffsetDays: number };

const item = (title: string, dueOffsetDays: number, description: string | null = null): SeedItem => ({
  title,
  description,
  dueOffsetDays,
});

const TEMPLATES: Array<{ name: string; description: string; items: SeedItem[] }> = [
  {
    name: 'Default',
    description: 'Discipline-neutral fallback used when no other template applies.',
    items: [
      item('Proposal', 14, 'Approved proposal on record.'),
      item('Documentation', 60, 'Interim technical documentation.'),
      item('Final Submission', 120, 'Complete thesis submitted for review.'),
    ],
  },
  {
    name: 'Software Engineering',
    description: 'Build-and-evaluate projects: implementation and testing are separate deliverables.',
    items: [
      item('Proposal', 14, 'Approved proposal on record.'),
      item('Development', 45, 'Working implementation.'),
      item('Testing', 75, 'Test plan and results.'),
      item('Documentation', 100, 'Technical documentation.'),
      item('Final Submission', 120, 'Complete thesis submitted for review.'),
    ],
  },
  {
    name: 'Zoology / Field Sciences',
    description: 'Field and laboratory work with an analysis stage before write-up.',
    items: [
      item('Proposal', 14, 'Approved proposal on record.'),
      item('Field Work', 45, 'Field data collected.'),
      item('Laboratory Work', 70, 'Samples analysed.'),
      item('Analysis', 90, 'Results analysed.'),
      item('Documentation', 110, 'Written account of methods and findings.'),
      item('Defense', 125, 'Viva / defense completed.'),
    ],
  },
];

async function main(): Promise<void> {
  const adminEmail = (process.env.ADMIN_EMAIL ?? 'admin@thesistrack.local').trim().toLowerCase();
  const admin = await db.query.users.findFirst({ where: eq(users.email, adminEmail) });
  // created_by is nullable — a template must seed even before an admin exists.
  const createdBy = admin?.id ?? null;

  const summary: Record<string, string> = {};

  for (const t of TEMPLATES) {
    const existing = await db.query.milestoneTemplates.findFirst({
      where: eq(milestoneTemplates.name, t.name),
    });

    if (existing) {
      await db
        .update(milestoneTemplates)
        .set({ description: t.description, items: t.items, updatedAt: new Date() })
        .where(eq(milestoneTemplates.id, existing.id));
      summary[t.name] = existing.id;
      continue;
    }

    const [created] = await db
      .insert(milestoneTemplates)
      .values({ name: t.name, description: t.description, items: t.items, createdBy })
      .returning({ id: milestoneTemplates.id });
    summary[t.name] = created.id;
  }

  const result = {
    templates: TEMPLATES.length,
    items: TEMPLATES.reduce((n, t) => n + t.items.length, 0),
    createdBy: createdBy ?? 'anonymous (no admin yet)',
    ...summary,
  };
  console.log(JSON.stringify(result));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
