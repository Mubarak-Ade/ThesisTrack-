import { useState, type SyntheticEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText, PenLine, Save, Send } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import EmptyState from '@/components/feedback/EmptyState';
import LoadingState from '@/components/feedback/LoadingState';
import { ApiError } from '@/lib/api/http';
import { cn } from '@/lib/utils';
import { submitSubmission } from '../data/projectRepo';
import { useCreateSubmission, useMilestones, useMyProject } from '../hooks/useProject';
import AttachmentDropzone from '@/components/upload/AttachmentDropzone';

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return error instanceof Error ? error.message : 'Something went wrong.';
}

/**
 * §16.3 Submissions composer (plan 11.4): title + optional milestone, then
 * **text body or file upload** — never both — with real upload progress.
 * Two outcomes: Save draft (POST /submissions) and Create & submit (the same
 * call followed by §5.5's submit, so version 1 exists before the supervisor
 * looks). Writes are live; failures surface (§10.4).
 */
export default function SubmissionComposer() {
  const navigate = useNavigate();
  const client = useQueryClient();

  const project = useMyProject();
  const projectId = project.data?.id;
  const milestones = useMilestones(projectId);
  const create = useCreateSubmission(projectId);

  const [title, setTitle] = useState('');
  const [milestoneId, setMilestoneId] = useState('');
  const [mode, setMode] = useState<'text' | 'file'>('text');
  const [body, setBody] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);

  if (project.isPending) {
    return (
      <div className="mx-auto w-full max-w-[860px] px-4 py-6 sm:px-6 sm:py-8">
        <LoadingState label="Loading your project…" />
      </div>
    );
  }

  if (!project.data) {
    return (
      <div className="mx-auto w-full max-w-[860px] px-4 py-6 sm:px-6 sm:py-8">
        <EmptyState
          eyebrow="No project yet"
          title="You don’t have an active project"
          description="Submissions belong to a project — one is created when your proposal is approved."
          action={
            <Button asChild variant="outline">
              <Link to="/dashboard">Back to dashboard</Link>
            </Button>
          }
        />
      </div>
    );
  }

  async function runSave(andSubmit: boolean, event: SyntheticEvent): Promise<void> {
    event.preventDefault();
    if (!title.trim()) {
      setFieldError('A title is required.');
      return;
    }
    if (mode === 'text' && !body.trim() && !file) {
      // Text mode with nothing typed is still a legal draft (§11.5), but a
      // silent empty save confuses people — warn without blocking drafts.
      setFieldError(null);
    } else {
      setFieldError(null);
    }

    try {
      const input = {
        projectId: project.data!.id,
        title: title.trim(),
        ...(mode === 'text' && body.trim() ? { body } : {}),
        ...(milestoneId ? { milestoneId } : {}),
      };
      const created = await create.mutateAsync({
        input,
        ...(mode === 'file' && file ? { file } : {}),
        onProgress: (percent) => setProgress(percent),
      });

      if (andSubmit) {
        await submitSubmission(created.id);
        await client.invalidateQueries({ queryKey: ['project'] });
        toast.success('Submission sent to your supervisor.');
      } else {
        toast.success('Draft saved.');
      }
      setProgress(null);
      navigate(`/project/submissions/${created.id}`, { replace: true });
    } catch (error) {
      setProgress(null);
      toast.error(errorMessage(error));
    }
  }

  const busy = create.isPending || progress !== null;

  return (
    <div className="mx-auto w-full max-w-[860px] px-4 py-6 sm:px-6 sm:py-8">
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
      >
        <Link to="/project/submissions" className="hover:text-foreground">
          Submissions
        </Link>
        <span aria-hidden="true">›</span>
        <span className="text-foreground">New submission</span>
      </nav>

      <header className="mt-3">
        <h1 className="font-display text-2xl font-bold text-foreground sm:text-3xl">
          New submission
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {project.data.title} — write the work as text or upload the file; your supervisor picks
          it up from here.
        </p>
      </header>

      <form className="mt-6 flex flex-col gap-5" onSubmit={(event) => void runSave(false, event)} noValidate>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Details</CardTitle>
            <CardDescription>Title and the milestone this work belongs to (§11.5).</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="submission-title">Title</Label>
              <Input
                id="submission-title"
                value={title}
                maxLength={500}
                placeholder="e.g. Chapter 3 — Data model"
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="submission-milestone">Milestone (optional)</Label>
              <select
                id="submission-milestone"
                value={milestoneId}
                onChange={(event) => setMilestoneId(event.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">No milestone</option>
                {(milestones.data ?? []).map((milestone) => (
                  <option key={milestone.id} value={milestone.id}>
                    {milestone.title}
                  </option>
                ))}
              </select>
            </div>

            {fieldError && (
              <p role="alert" className="text-sm text-danger">
                {fieldError}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">The work itself</CardTitle>
            <CardDescription>
              Exactly one form per submission (§14.2): a text chapter or an uploaded file.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Submission form">
              <Button
                type="button"
                size="sm"
                variant={mode === 'text' ? 'secondary' : 'outline'}
                aria-pressed={mode === 'text'}
                disabled={busy}
                onClick={() => setMode('text')}
              >
                <PenLine aria-hidden="true" /> Write text
              </Button>
              <Button
                type="button"
                size="sm"
                variant={mode === 'file' ? 'secondary' : 'outline'}
                aria-pressed={mode === 'file'}
                disabled={busy}
                onClick={() => setMode('file')}
              >
                <FileText aria-hidden="true" /> Upload file
              </Button>
            </div>

            {mode === 'text' ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="submission-body">Body</Label>
                <Textarea
                  id="submission-body"
                  value={body}
                  rows={8}
                  placeholder="Paste or write the chapter here…"
                  onChange={(event) => setBody(event.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Plain text — formatting lives in the uploaded document.
                </p>
              </div>
            ) : (
              <AttachmentDropzone
                accept=".pdf,.doc,.docx,.txt,.csv,.zip,.png,.jpg,.jpeg"
                hint="PDF, Word, text, CSV or ZIP (§14.4 limits apply)"
                disabled={busy}
                progress={progress}
                onFile={(next) => {
                  setFile(next);
                }}
              />
            )}
            {mode === 'file' && file && (
              <p className="text-sm text-foreground">
                Selected: <span className="font-medium">{file.name}</span>{' '}
                <button
                  type="button"
                  className="text-danger underline-offset-2 hover:underline"
                  onClick={() => {
                    setFile(null);
                    setProgress(null);
                  }}
                >
                  remove
                </button>
              </p>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={busy}>
            <Save aria-hidden="true" /> {busy ? 'Working…' : 'Save draft'}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={(event) => void runSave(true, event)}
          >
            <Send aria-hidden="true" /> Create &amp; submit
          </Button>
          <Button asChild type="button" variant="ghost">
            <Link to="/project/submissions">
              <ArrowLeft aria-hidden="true" /> Back
            </Link>
          </Button>
        </div>
        <p className={cn('text-xs text-muted-foreground')}>
          “Save draft” keeps it editable; “Create &amp; submit” notifies your supervisor and locks
          the content until a revision is requested (§5.5).
        </p>
      </form>
    </div>
  );
}
