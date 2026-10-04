import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronLeft,
  Download,
  FileText,
  RotateCcw,
  Upload,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { parseCsv } from '@/components/import/csvParser';
import FormMessage from '@/components/forms/FormMessage';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { downloadCsv } from '@/lib/csv';
import { ApiError } from '@/lib/api/http';
import { cn } from '@/lib/utils';
import { ROLES } from '../data/constants';
import type { ImportRow } from '../data/types';
import { importUsers } from '../data/usersRepo';

type TargetField = 'firstName' | 'lastName' | 'email' | 'role' | 'department' | 'program';
type Mapping = Record<TargetField, number | null>;
type Step = 1 | 2 | 3 | 4;

const REQUIRED: TargetField[] = ['firstName', 'lastName', 'email', 'role'];
/** Optional §11.0.2 column — unmapped/blank rows simply omit the key. */
const OPTIONAL: TargetField[] = ['department', 'program'];

const FIELD_LABEL: Record<TargetField, string> = {
  firstName: 'First name',
  lastName: 'Last name',
  email: 'Email',
  role: 'Role',
  department: 'Department',
  program: 'Program',
};

const STEPS: { step: Step; label: string }[] = [
  { step: 1, label: 'Upload' },
  { step: 2, label: 'Map Columns' },
  { step: 3, label: 'Validate' },
  { step: 4, label: 'Finalize' },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Auto-guess header → target field from normalized header names. */
function guessField(header: string): TargetField | '' {
  const h = header.toLowerCase().replace(/[^a-z]/g, '');
  if (h.includes('email') || h === 'mail') return 'email';
  if (h.includes('first') || h === 'givenname') return 'firstName';
  if (h.includes('last') || h.includes('surname') || h === 'familyname') return 'lastName';
  if (h.includes('role')) return 'role';
  if (h.includes('dept') || h.includes('department')) return 'department';
  if (h.includes('program')) return 'program';
  return '';
}

function autoMap(headers: string[]): Mapping {
  const mapping: Mapping = {
    firstName: null,
    lastName: null,
    email: null,
    role: null,
    department: null,
    program: null,
  };
  headers.forEach((header, index) => {
    const target = guessField(header);
    if (target && mapping[target] === null) mapping[target] = index;
  });
  return mapping;
}

interface ValidatedRow {
  index: number; // 1-based (excluding header)
  cells: string[];
  values: ImportRow | null;
  errors: string[];
}

function validateRows(rows: string[][], mapping: Mapping): ValidatedRow[] {
  return rows.map((cells, offset) => {
    const errors: string[] = [];
    const pick = (field: TargetField): string => {
      const column = mapping[field];
      return column === null ? '' : (cells[column] ?? '').trim();
    };

    const firstName = pick('firstName');
    const lastName = pick('lastName');
    const email = pick('email').toLowerCase();
    const roleRaw = pick('role').toLowerCase();
    const department = pick('department');
    // §11.0.2 delta — optional; blank cell means unaffiliated (ADR-16 fallback).
    const program = pick('program');

    if (!firstName) errors.push('First name is required');
    if (!lastName) errors.push('Last name is required');
    if (!email) errors.push('Email is required');
    else if (!EMAIL_RE.test(email)) errors.push('Invalid email address');
    if (!roleRaw) errors.push('Role is required');
    else if (!(ROLES as readonly string[]).includes(roleRaw)) {
      errors.push(`Unknown role "${pick('role')}" — expected Student, Supervisor or Administrator`);
    }
    if (program.length > 255) errors.push('Program must be 255 characters or fewer');

    const values: ImportRow = {
      firstName,
      lastName,
      email,
      role: roleRaw as ImportRow['role'],
      department,
    };
    if (program) values.program = program;

    return {
      index: offset + 1,
      cells,
      values: errors.length === 0 ? values : null,
      errors,
    };
  });
}

const TEMPLATE_HEADERS = ['firstName', 'lastName', 'email', 'role', 'department', 'program'];

function sampleRows(count: number): (string | number)[][] {
  const departments = ['Informatics', 'Computer Science', 'Software Engineering'];
  const programs = ['MSc Computer Science', 'MSc Data Science', 'BSc Software Engineering'];
  const people = [
    ['Aisha', 'Bello'],
    ['Tomas', 'Novak'],
    ['Grace', 'Okafor'],
    ['Liam', 'Fitzgerald'],
    ['Sofia', 'Marino'],
    ['Daniel', 'Kamau'],
    ['Yuki', 'Tanaka'],
    ['Fatima', 'Haddad'],
  ];
  return Array.from({ length: count }, (_, i) => {
    const [first, last] = people[i % people.length];
    return [
      first,
      last,
      `${first[0].toLowerCase()}.${last.toLowerCase()}${i > 7 ? i : ''}@sample.edu`,
      i % 3 === 0 ? 'supervisor' : 'student',
      departments[i % departments.length],
      i % 2 === 0 ? programs[i % programs.length] : '',
    ];
  });
}

/** Four-step import wizard (spec §5.5): upload → map → validate → finalize. */
export default function ImportWizard() {
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>(1);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Mapping>({
    firstName: null,
    lastName: null,
    email: null,
    role: null,
    department: null,
    program: null,
  });
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState<{ message: string; details?: unknown } | null>(null);
  const [createdCount, setCreatedCount] = useState<number | null>(null);

  const validated = useMemo(() => (step >= 3 ? validateRows(rows, mapping) : []), [step, rows, mapping]);
  const validCount = validated.filter((row) => row.values).length;
  const errorCount = validated.length - validCount;
  const allRequiredMapped = REQUIRED.every((field) => mapping[field] !== null);

  const downloadTemplate = () =>
    downloadCsv('thesistrack-import-template.csv', TEMPLATE_HEADERS, [
      ['Marcus', 'Holloway', 'm.holloway@student.edu', 'student', 'Informatics', 'MSc Computer Science'],
    ]);

  const downloadSample = () =>
    downloadCsv('thesistrack-import-sample.csv', TEMPLATE_HEADERS, sampleRows(8));

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setFileError(null);
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setFileError('Only CSV files are supported — export your spreadsheet as CSV and try again.');
      return;
    }
    try {
      const text = await file.text();
      const parsed = parseCsv(text);
      if (parsed.headers.length === 0 || parsed.rows.length === 0) {
        setFileError('This file has no data rows. Add at least one user and re-upload.');
        return;
      }
      setFileName(file.name);
      setHeaders(parsed.headers);
      setRows(parsed.rows);
      setMapping(autoMap(parsed.headers));
      setStep(2);
    } catch {
      setFileError('Unable to read this file. Make sure it is a valid CSV export.');
    }
  };

  const submit = async () => {
    const payload = validated.map((row) => row.values).filter((v): v is ImportRow => v !== null);
    if (payload.length === 0) return;
    setSubmitting(true);
    setApiError(null);
    try {
      const result = await importUsers(payload);
      setCreatedCount(result.created);
      setStep(4);
      toast.success(`Imported ${result.created} user${result.created === 1 ? '' : 's'}`);
    } catch (error) {
      setStep(4);
      if (error instanceof ApiError) {
        setApiError({ message: error.message, details: error.details });
      } else {
        setApiError({ message: 'Unable to reach ThesisTrack. Check your connection and retry.' });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const restart = () => {
    setStep(1);
    setFileName(null);
    setFileError(null);
    setHeaders([]);
    setRows([]);
    setCreatedCount(null);
    setApiError(null);
  };

  const Stepper = (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-3 sm:gap-x-3" aria-label="Import steps">
      {STEPS.map(({ step: index, label }, position) => {
        const done = step > index;
        const active = step === index;
        return (
          <li key={label} className="flex items-center gap-2 sm:gap-3">
            {position > 0 && (
              <span
                aria-hidden="true"
                className={cn('hidden h-px w-6 sm:block', done || active ? 'bg-primary' : 'bg-border')}
              />
            )}
            <span
              className={cn(
                'grid size-8 shrink-0 place-items-center rounded-full text-xs font-bold transition-colors',
                done && 'bg-primary text-primary-foreground',
                active && 'bg-primary/10 text-primary ring-2 ring-primary',
                !done && !active && 'bg-secondary text-secondary-foreground',
              )}
              aria-current={active ? 'step' : undefined}
            >
              {done ? <Check className="size-4" aria-hidden="true" /> : index}
            </span>
            <span
              className={cn(
                'text-xs font-semibold uppercase tracking-wider',
                active ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );

  return (
    <Card className="mt-6">
      <CardContent className="p-5 sm:p-6">
        {Stepper}

        {/* ── Step 1: Upload ───────────────────────────────────────── */}
        {step === 1 && (
          <div className="mt-6">
            <label
              htmlFor="import-file"
              className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border bg-surface-alt/50 px-6 py-10 text-center transition-colors hover:border-primary/50 hover:bg-surface-alt"
            >
              <span className="grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
                <Upload className="size-5" aria-hidden="true" />
              </span>
              <span>
                <span className="block text-sm font-semibold text-foreground">
                  Choose a CSV file or drag it here
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  CSV only — export your spreadsheet as CSV first
                </span>
              </span>
            </label>
            <input
              id="import-file"
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={(event) => void onFile(event.target.files?.[0])}
            />

            {fileError && (
              <div className="mt-3">
                <FormMessage>{fileError}</FormMessage>
              </div>
            )}

            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">
                Required columns: first name, last name, email, role. Department and program are
                optional.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={downloadTemplate}>
                  <Download aria-hidden="true" />
                  Download Template
                </Button>
                <Button type="button" variant="outline" onClick={downloadSample}>
                  <FileText aria-hidden="true" />
                  Download Sample
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ── Step 2: Map columns ──────────────────────────────────── */}
        {step === 2 && (
          <div className="mt-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">{fileName}</span> — {rows.length}{' '}
                data rows, {headers.length} columns detected.
              </p>
              <Button type="button" variant="ghost" size="sm" onClick={() => setStep(1)}>
                <ChevronLeft aria-hidden="true" />
                Choose another file
              </Button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {REQUIRED.concat(OPTIONAL).map((field) => (
                <div key={field} className="space-y-1.5">
                  <label
                    htmlFor={`map-${field}`}
                    className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    {FIELD_LABEL[field]}
                    {REQUIRED.includes(field) && <span className="ml-1 text-danger">*</span>}
                  </label>
                  <select
                    id={`map-${field}`}
                    value={mapping[field] === null ? '' : String(mapping[field])}
                    onChange={(event) =>
                      setMapping((current) => ({
                        ...current,
                        [field]: event.target.value === '' ? null : Number(event.target.value),
                      }))
                    }
                    className="flex h-11 w-full rounded-md border border-input bg-white px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                  >
                    <option value="">Not mapped</option>
                    {headers.map((header, index) => (
                      <option key={`${header}-${index}`} value={index}>
                        {header || `Column ${index + 1}`}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground">
                    {mapping[field] === null
                      ? REQUIRED.includes(field)
                        ? 'Required'
                        : 'Optional — skipped if unmapped'
                      : `Column ${Number(mapping[field]) + 1} · “${headers[mapping[field] ?? 0]}”`}
                  </p>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-3">
              <Button type="button" onClick={() => setStep(3)} disabled={!allRequiredMapped}>
                Validate {rows.length} rows
                <ArrowRight aria-hidden="true" />
              </Button>
              {!allRequiredMapped && (
                <p className="self-center text-xs text-danger">
                  Map every required column (*) to continue.
                </p>
              )}
            </div>
          </div>
        )}

        {/* ── Step 3: Validate ─────────────────────────────────────── */}
        {step === 3 && (
          <div className="mt-6 space-y-4">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-success-bg px-3 py-1 font-semibold text-success">
                <CheckCircle2 className="size-4" aria-hidden="true" />
                {validCount} ready
              </span>
              {errorCount > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-danger-bg px-3 py-1 font-semibold text-danger">
                  <AlertCircle className="size-4" aria-hidden="true" />
                  {errorCount} with errors
                </span>
              )}
              {errorCount > 0 && (
                <span className="text-xs text-muted-foreground">
                  The import is all-or-nothing — fix the rows below and re-upload.
                </span>
              )}
            </div>

            <div className="relative max-h-[420px] overflow-auto rounded-xl border border-border">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="sticky top-0 bg-surface-alt">
                  <tr className="border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th scope="col" className="px-3 py-2.5 font-bold">#</th>
                    <th scope="col" className="px-3 py-2.5 font-bold">Name</th>
                    <th scope="col" className="px-3 py-2.5 font-bold">Email</th>
                    <th scope="col" className="px-3 py-2.5 font-bold">Role</th>
                    <th scope="col" className="px-3 py-2.5 font-bold">Program</th>
                    <th scope="col" className="px-3 py-2.5 font-bold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {validated.map((row) => (
                    <tr
                      key={row.index}
                      className={cn(
                        'border-b border-border/70 last:border-0',
                        row.errors.length > 0 && 'bg-danger-bg/40',
                      )}
                    >
                      <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">
                        {row.index}
                      </td>
                      <td className="px-3 py-2.5 text-foreground">
                        {row.values
                          ? `${row.values.firstName} ${row.values.lastName}`
                          : row.cells.slice(0, 2).join(' ') || '—'}
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">
                        {row.values?.email ?? row.cells[mapping.email ?? -1] ?? '—'}
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">
                        {row.values?.role ?? row.cells[mapping.role ?? -1] ?? '—'}
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">
                        {row.values?.program ??
                          (mapping.program === null
                            ? '—'
                            : row.cells[mapping.program]?.trim() || '—')}
                      </td>
                      <td className="px-3 py-2.5">
                        {row.errors.length === 0 ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-success">
                            <CheckCircle2 className="size-3.5" aria-hidden="true" />
                            Ready
                          </span>
                        ) : (
                          <span className="text-xs font-medium text-danger">
                            {row.errors.join(' · ')}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button type="button" onClick={() => setStep(4)} disabled={errorCount > 0 || validCount === 0}>
                Continue
                <ArrowRight aria-hidden="true" />
              </Button>
              <Button type="button" variant="outline" onClick={() => setStep(2)}>
                <ChevronLeft aria-hidden="true" />
                Back to mapping
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 4: Finalize ─────────────────────────────────────── */}
        {step === 4 && (
          <div className="mt-6 space-y-4">
            {createdCount !== null ? (
              <div className="flex flex-col items-center gap-3 rounded-xl border border-success/30 bg-success-bg px-6 py-8 text-center">
                <span className="grid size-14 place-items-center rounded-full bg-success text-success-foreground">
                  <CheckCircle2 className="size-7" aria-hidden="true" />
                </span>
                <div>
                  <h3 className="font-display text-xl font-bold text-foreground">
                    {createdCount} user{createdCount === 1 ? '' : 's'} imported
                  </h3>
                  <p className="mt-1 max-w-md text-sm text-muted-foreground">
                    Each account was created as <strong className="font-semibold">INVITED</strong> —
                    the invited users set their own passwords during activation.
                  </p>
                </div>
                <div className="mt-2 flex flex-wrap justify-center gap-3">
                  <Button type="button" onClick={() => navigate('/users')}>
                    Go to All Users
                    <ArrowRight aria-hidden="true" />
                  </Button>
                  <Button type="button" variant="outline" onClick={restart}>
                    <RotateCcw aria-hidden="true" />
                    Import another file
                  </Button>
                </div>
              </div>
            ) : apiError ? (
              <div className="space-y-4">
                <FormMessage>{apiError.message}</FormMessage>
                {apiError.details !== undefined && apiError.details !== null && (
                  <details className="rounded-xl border border-border bg-surface-alt/60 p-4">
                    <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Row details
                    </summary>
                    <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words text-xs text-foreground">
                      {JSON.stringify(apiError.details, null, 2)}
                    </pre>
                  </details>
                )}
                <div className="flex flex-wrap gap-3">
                  <Button type="button" onClick={() => void submit()} disabled={submitting}>
                    <RotateCcw aria-hidden="true" />
                    {submitting ? 'Retrying…' : 'Retry import'}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setStep(3)}>
                    <ChevronLeft aria-hidden="true" />
                    Back to validation
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-xl border border-border bg-surface-alt/60 p-5">
                  <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    Summary
                  </p>
                  <p className="mt-2 font-display text-3xl font-bold text-foreground">
                    {validCount}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    accounts ready to import from <span className="font-medium">{fileName}</span>
                  </p>
                  <p className="mt-3 text-sm text-muted-foreground">
                    All rows are valid. The API imports them in one batch — if any row is rejected,
                    nothing is created.
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button type="button" onClick={() => void submit()} disabled={submitting}>
                    <Upload aria-hidden="true" />
                    {submitting ? 'Importing…' : `Import ${validCount} user${validCount === 1 ? '' : 's'}`}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setStep(3)} disabled={submitting}>
                    <ChevronLeft aria-hidden="true" />
                    Back to validation
                  </Button>
                </div>
              </div>
            )}

            {createdCount === null && (
              <p className="text-xs text-muted-foreground">
                Changed your mind?{' '}
                <Link to="/users" className="font-medium text-primary hover:underline">
                  Back to All Users
                </Link>
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
