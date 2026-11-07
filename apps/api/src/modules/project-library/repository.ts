import { sql, type SQL } from 'drizzle-orm';

import { db } from '../../config/db.js';
import { isValidUuid } from '../../lib/uuid.js';
import type {
  DepartmentFacet,
  LibraryFilters,
  LibraryPage,
  LibraryPerson,
  LibraryRow,
  LibraryStatus,
} from './types.js';

/**
 * The project-library corpus and ranking — design 2026-11-05 (ADR-18).
 *
 * Everything search-related lives in this file so a future materialised index
 * can replace the query without touching the service, controller or UI.
 *
 * The document per project is:
 *   projects.title            weight A
 *   projects.description      weight B
 *   approved proposal title   weight A
 *   approved proposal abstract weight B
 *   approved proposal body    weight C (tags stripped, entities decoded, 20k cap)
 *
 * Only an approved proposal contributes. A lateral join with `limit 1` keeps
 * one row per project even if more than one approved row exists, so pagination
 * and totals cannot fan out.
 */

/** `ts_rank_cd` normalisation 32 = rank/(rank+1), keeping the score in [0,1]. */
const RANK_NORMALISATION = 32;

/** Similarity threshold for `<%` filtering; deliberately looser than the default. */
const WORD_SIMILARITY_THRESHOLD = '0.3';

/** The proposal body snippet cap for ranking (characters). */
const BODY_CHAR_CAP = 20_000;

/** Trim + whitespace-collapse a plain-text excerpt. */
function cleanExcerpt(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return text.length > 0 ? text : null;
}

/**
 * Body text: drop tags, decode the six common entities, then cap. `&amp;` is
 * decoded last so `&amp;lt;` does not become `<` (no double decoding).
 */
const BODY_TEXT = sql`
  left(
    replace(
      replace(
        replace(
          replace(
            replace(
              replace(
                regexp_replace(coalesce(pr.body, ''), '<[^>]*>', ' ', 'g'),
                '&nbsp;', ' '
              ),
              '&#39;', chr(39)
            ),
            '&quot;', chr(34)
          ),
          '&gt;', '>'
        ),
        '&lt;', '<'
      ),
      '&amp;', '&'
    ),
    ${BODY_CHAR_CAP}
  )
`;

/** Columns shared by the list and search paths. */
const PROJECTION = sql`
  p.id,
  p.title,
  p.description,
  p.status,
  p.created_at,
  p.updated_at,
  p.student_id,
  s.first_name,
  s.last_name,
  d.id as department_id,
  d.name as department_name,
  d.code as department_code,
  w.academic_session as session,
  coalesce(ap.title, '') as proposal_title,
  coalesce(ap.abstract, '') as proposal_abstract,
  coalesce(ap.body_text, '') as proposal_body
`;

const FROM_JOINS = sql`
  from projects p
  join users s on s.id = p.student_id
  left join departments d on d.id = s.department_id
  left join workflows w on w.id = p.workflow_id
  left join lateral (
    select
      pr.title,
      pr.abstract,
      ${BODY_TEXT} as body_text
    from proposals pr
    where pr.project_id = p.id
      and pr.status = 'approved'
    order by pr.version desc
    limit 1
  ) ap on true
`;

/** The list/detail corpus: no tsvector, because there is no query to rank. */
const BASE_CTE = sql`with base as (select ${PROJECTION} ${FROM_JOINS})`;

/**
 * The search corpus. `q` is threaded as a bound parameter; the same value is
 * repeated in the rank and the filter, which is harmless and keeps the SQL a
 * single composable fragment.
 */
function searchCte(q: string): SQL {
  return sql`
    with corpus as (
      select
        ${PROJECTION},
        setweight(
          to_tsvector('english', coalesce(p.title, '') || ' ' || coalesce(ap.title, '')),
          'A'
        )
        || setweight(
          to_tsvector(
            'english',
            coalesce(p.description, '') || ' ' || coalesce(ap.abstract, '')
          ),
          'B'
        )
        || setweight(to_tsvector('english', coalesce(ap.body_text, '')), 'C')
        as document
      ${FROM_JOINS}
    ),
    matched as (
      select
        c.*,
        0.6 * ts_rank_cd(c.document, websearch_to_tsquery('english', ${q}), ${RANK_NORMALISATION})
        + 0.4 * greatest(
            word_similarity(${q}, c.title),
            word_similarity(${q}, c.description),
            word_similarity(${q}, c.proposal_title),
            word_similarity(${q}, c.proposal_abstract),
            word_similarity(${q}, c.proposal_body)
          )
        as score
      from corpus c
      where c.document @@ websearch_to_tsquery('english', ${q})
        or ${q} <% c.title
        or ${q} <% c.description
        or ${q} <% c.proposal_title
        or ${q} <% c.proposal_abstract
        or ${q} <% c.proposal_body
    )
  `;
}

/** The excerpt: a headline when full-text matched, else the best trigram field. */
function excerptSql(q: string): SQL {
  return sql`
    case
      when m.document @@ websearch_to_tsquery('english', ${q}) then
        ts_headline(
          'english',
          m.title || ' ' || m.description || ' ' ||
            m.proposal_abstract || ' ' || m.proposal_body,
          websearch_to_tsquery('english', ${q}),
          'MaxWords=28, MinWords=12, StartSel="", StopSel=""'
        )
      when word_similarity(${q}, m.proposal_body)
           >= greatest(
             word_similarity(${q}, m.description),
             word_similarity(${q}, m.proposal_abstract)
           ) then
        left(m.proposal_body, 200)
      when word_similarity(${q}, m.proposal_abstract) >= word_similarity(${q}, m.description) then
        left(m.proposal_abstract, 200)
      else
        left(m.description, 200)
    end
  `;
}

/** The shared filter, applied to `base` or `matched`. */
function filterSql(filters: LibraryFilters, alias: 'b' | 'm'): SQL {
  const parts: SQL[] = [sql`true`];

  if (filters.status !== 'all') {
    parts.push(sql`${sql.raw(alias)}.status = ${filters.status}`);
  }
  if (filters.departmentId) {
    parts.push(sql`${sql.raw(alias)}.department_id = ${filters.departmentId}`);
  }
  if (filters.excludeProjectId) {
    parts.push(sql`${sql.raw(alias)}.id <> ${filters.excludeProjectId}`);
  }

  return sql.join(parts, sql` and `);
}

/** A q shorter than 2 must not scan (§6.2). */
function isShortQuery(filters: LibraryFilters): boolean {
  return filters.q !== undefined && filters.q.trim().length < 2;
}

function queryText(filters: LibraryFilters): string | null {
  const q = filters.q?.trim();
  return q && q.length >= 2 ? q : null;
}

type RawRow = Record<string, unknown>;

/** Comma-separated bound UUIDs for an explicit `in (...)` list. */
function uuidList(ids: string[]): SQL {
  return sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `,
  );
}

function mapRow(row: RawRow): LibraryRow {
  const departmentId = row.department_id as string | null;
  return {
    id: row.id as string,
    title: row.title as string,
    description: row.description as string,
    status: row.status as LibraryStatus,
    session: (row.session as string | null) ?? null,
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date,
    student: {
      id: row.student_id as string,
      firstName: row.first_name as string,
      lastName: row.last_name as string,
    },
    department:
      departmentId === null
        ? null
        : {
            id: departmentId,
            name: row.department_name as string,
            code: (row.department_code as string | null) ?? null,
          },
    supervisors: [],
    score: row.score === null || row.score === undefined ? null : Number(row.score),
    excerpt: cleanExcerpt(row.excerpt),
  };
}

/**
 * Attach supervisors: project-linked assignments first (primary, then active,
 * then oldest), falling back to the student's active assignment when the
 * project has no linked row at all. History stays visible on archived projects.
 */
async function attachSupervisors(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  rows: LibraryRow[],
): Promise<void> {
  if (rows.length === 0) return;

  const ids = rows.map((row) => row.id);
  const byProject = new Map<string, Map<string, LibraryPerson>>();

  const add = (projectId: string, person: LibraryPerson): void => {
    const people = byProject.get(projectId) ?? new Map<string, LibraryPerson>();
    if (!people.has(person.id)) people.set(person.id, person);
    byProject.set(projectId, people);
  };

  const linked = (
    await tx.execute(sql`
      select
        sa.project_id,
        u.id,
        u.first_name,
        u.last_name
      from supervisor_assignments sa
      join users u on u.id = sa.supervisor_id
      where sa.project_id in (${uuidList(ids)})
      order by
        sa.is_primary desc,
        (sa.ended_at is null) desc,
        sa.assigned_at asc
    `)
  ).rows as RawRow[];

  for (const row of linked) {
    add(row.project_id as string, {
      id: row.id as string,
      firstName: row.first_name as string,
      lastName: row.last_name as string,
    });
  }

  const missing = ids.filter((id) => !byProject.has(id));
  if (missing.length > 0) {
    const fallback = (
      await tx.execute(sql`
        select
          p.id as project_id,
          u.id,
          u.first_name,
          u.last_name
        from projects p
        join supervisor_assignments sa
          on sa.student_id = p.student_id
         and sa.ended_at is null
        join users u on u.id = sa.supervisor_id
        where p.id in (${uuidList(missing)})
        order by sa.is_primary desc, sa.assigned_at asc
      `)
    ).rows as RawRow[];

    for (const row of fallback) {
      add(row.project_id as string, {
        id: row.id as string,
        firstName: row.first_name as string,
        lastName: row.last_name as string,
      });
    }
  }

  for (const row of rows) {
    row.supervisors = [...(byProject.get(row.id)?.values() ?? [])];
  }
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** The threshold is per-transaction state, so every read sets it first. */
async function applySimilarityThreshold(tx: Tx): Promise<void> {
  await tx.execute(
    sql`select set_config('pg_trgm.word_similarity_threshold', ${WORD_SIMILARITY_THRESHOLD}, true)`,
  );
}

/** Page + total, reusing the caller's transaction. */
async function searchLibraryTx(tx: Tx, filters: LibraryFilters): Promise<LibraryPage> {
  if (isShortQuery(filters)) {
    return { rows: [], total: 0 };
  }

  const q = queryText(filters);
  const offset = (filters.page - 1) * filters.limit;

  if (!q) {
    const where = filterSql(filters, 'b');
    const rowsResult = await tx.execute(sql`
      ${BASE_CTE}
      select b.*, null::real as score, null::text as excerpt
      from base b
      where ${where}
      order by b.created_at desc, b.id desc
      limit ${filters.limit} offset ${offset}
    `);
    const totalResult = await tx.execute(sql`
      ${BASE_CTE}
      select count(*)::int as total
      from base b
      where ${where}
    `);

    const rows = (rowsResult.rows as RawRow[]).map(mapRow);
    const total = (totalResult.rows[0] as { total: number } | undefined)?.total ?? 0;
    await attachSupervisors(tx, rows);
    return { rows, total };
  }

  const cte = searchCte(q);
  const where = filterSql(filters, 'm');
  const rowsResult = await tx.execute(sql`
    ${cte}
    select m.*, ${excerptSql(q)} as excerpt
    from matched m
    where ${where}
    order by m.score desc, m.created_at desc, m.id desc
    limit ${filters.limit} offset ${offset}
  `);
  const totalResult = await tx.execute(sql`
    ${cte}
    select count(*)::int as total
    from matched m
    where ${where}
  `);

  const rows = (rowsResult.rows as RawRow[]).map(mapRow);
  const total = (totalResult.rows[0] as { total: number } | undefined)?.total ?? 0;
  await attachSupervisors(tx, rows);
  return { rows, total };
}

/**
 * Department facet for the list filter: counts across the current q/status,
 * deliberately ignoring `departmentId` so the user can switch back.
 */
async function listDepartmentFacetTx(tx: Tx, filters: LibraryFilters): Promise<DepartmentFacet[]> {
  if (isShortQuery(filters)) return [];

  const q = queryText(filters);
  const facetFilters: LibraryFilters = { ...filters, departmentId: undefined };

  const cte = q ? searchCte(q) : BASE_CTE;
  const cteName: 'base' | 'matched' = q ? 'matched' : 'base';
  const alias: 'b' | 'm' = q ? 'm' : 'b';
  const where = filterSql(facetFilters, alias);

  const result = await tx.execute(sql`
    ${cte}
    select
      ${sql.raw(alias)}.department_id as id,
      ${sql.raw(alias)}.department_name as name,
      count(*)::int as count
    from ${sql.raw(cteName)} ${sql.raw(alias)}
    where ${where}
      and ${sql.raw(alias)}.department_id is not null
    group by ${sql.raw(alias)}.department_id, ${sql.raw(alias)}.department_name
    order by ${sql.raw(alias)}.department_name
  `);

  return (result.rows as RawRow[]).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    count: row.count as number,
  }));
}

/** Page + total, in its own transaction (detail and similar queries). */
export async function searchLibrary(filters: LibraryFilters): Promise<LibraryPage> {
  return db.transaction(async (tx) => {
    await applySimilarityThreshold(tx);
    return searchLibraryTx(tx, filters);
  });
}

/**
 * One snapshot for the list screen: page, total and the department facet share
 * a transaction, so the counts cannot disagree with the rows.
 */
export async function searchLibraryWithFacets(
  filters: LibraryFilters,
): Promise<{ page: LibraryPage; departments: DepartmentFacet[] }> {
  return db.transaction(async (tx) => {
    await applySimilarityThreshold(tx);
    const page = await searchLibraryTx(tx, filters);
    const departments = await listDepartmentFacetTx(tx, filters);
    return { page, departments };
  });
}

/** One project, in the same whitelisted shape; `undefined` for unknown ids. */
export async function getLibraryRow(projectId: string): Promise<LibraryRow | undefined> {
  if (!isValidUuid(projectId)) return undefined;

  return db.transaction(async (tx) => {
    const result = await tx.execute(sql`
      ${BASE_CTE}
      select b.*, null::real as score, null::text as excerpt
      from base b
      where b.id = ${projectId}
      limit 1
    `);

    const raw = result.rows[0] as RawRow | undefined;
    if (!raw) return undefined;

    const row = mapRow(raw);
    await attachSupervisors(tx, [row]);
    return row;
  });
}
