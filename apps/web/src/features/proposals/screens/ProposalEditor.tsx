import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Save, Send } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import ConfirmDialog from '@/components/feedback/ConfirmDialog';
import EmptyState from '@/components/feedback/EmptyState';
import ErrorState from '@/components/feedback/ErrorState';
import LoadingState from '@/components/feedback/LoadingState';
import UnsavedChangesDialog from '@/components/feedback/UnsavedChangesDialog';
import { ApiError } from '@/lib/api/http';
import { downloadAttachment } from '../data/proposalsRepo';
import AttachmentDropzone from '@/components/upload/AttachmentDropzone';
import AttachmentList from '../components/AttachmentList';
import DocumentEditor from '../components/DocumentEditor';
import ProposalStatusBadge from '../components/ProposalStatusBadge';
import { isProposalEditable } from '../data/types';
import {
  useCreateProposal,
  usePatchProposal,
  useProposal,
  useRemoveAttachment,
  useSubmitProposal,
  useUploadAttachment,
} from '../hooks/useProposals';

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return error instanceof Error ? error.message : 'Something went wrong.';
}

/**
 * §16.3 "Proposal creation" + plan 11.2 "edit-in-place".
 *
 * The §11.3 document rule renders literally: `abstract` (always) + an editor
 * control for `body` + drag-or-click upload listing size and remove buttons.
 * Remove stays visible but disabled and explained while the proposal is
 * frozen (I14). The whole editor control disappears once the proposal is
 * read-only — that content lives on the detail screen instead.
 */
export default function ProposalEditor() {
  const { proposalId } = useParams<{ proposalId: string }>();
  const navigate = useNavigate();
  const isCreate = !proposalId;

  const detail = useProposal(proposalId);
  const create = useCreateProposal();
  const patch = usePatchProposal(proposalId ?? '');
  const submit = useSubmitProposal(proposalId ?? '');
  const upload = useUploadAttachment(proposalId ?? '');
  const remove = useRemoveAttachment();

  const [title, setTitle] = useState('');
  const [abstract, setAbstract] = useState('');
  const [body, setBody] = useState('');
  const [hydrated, setHydrated] = useState(isCreate);
  const [dirty, setDirty] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  // Hydrate the form once the detail arrives (edit mode only).
  useEffect(() => {
    if (isCreate || hydrated || !detail.data?.proposal) return;
    setTitle(detail.data.proposal.title);
    setAbstract(detail.data.proposal.abstract);
    setBody(detail.data.proposal.body ?? '');
    setHydrated(true);
  }, [isCreate, hydrated, detail.data]);

  // Unsaved-changes guard (§16.1): intercept in-app link clicks while dirty,
  // and the browser's own unload for refresh/close.
  useEffect(() => {
    if (!dirty) return undefined;
    const onClick = (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement | null)?.closest?.('a[href]') as
        | HTMLAnchorElement
        | null;
      const href = anchor?.getAttribute('href');
      if (!href?.startsWith('/') || href.startsWith('//')) return;
      event.preventDefault();
      event.stopPropagation();
      setPendingHref(href);
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    document.addEventListener('click', onClick, true);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [dirty]);

  if (!isCreate && detail.isPending && !detail.data) {
    return (
      <div className="mx-auto w-full max-w-[900px] px-4 py-6 sm:px-6 sm:py-8">
        <LoadingState label="Loading proposal…" />
      </div>
    );
  }

  if (!isCreate && detail.isError && !detail.data) {
    return (
      <div className="mx-auto w-full max-w-[900px] px-4 py-6 sm:px-6 sm:py-8">
        <ErrorState
          message={errorMessage(detail.error)}
          onRetry={() => void detail.refetch()}
          action={
            <Button asChild variant="outline">
              <Link to="/proposals">Back to proposals</Link>
            </Button>
          }
        />
      </div>
    );
  }

  if (!isCreate && detail.data === null) {
    return (
      <div className="mx-auto w-full max-w-[900px] px-4 py-6 sm:px-6 sm:py-8">
        <EmptyState
          eyebrow="Not found"
          title="That proposal doesn’t exist"
          description="It may have been removed, or the link is wrong."
          action={
            <Button asChild variant="outline">
              <Link to="/proposals">Back to proposals</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const proposal = detail.data?.proposal;
  const editable = proposal ? isProposalEditable(proposal.status) : true;
  const attachments = detail.data?.attachments ?? [];

  // Edit mode on a frozen proposal: the editor control is hidden entirely
  // (plan 11.2) — the read-only rendering lives on the detail screen.
  if (!isCreate && proposal && !editable) {
    return (
      <div className="mx-auto w-full max-w-[900px] px-4 py-6 sm:px-6 sm:py-8">
        <EmptyState
          icon={<CheckCircle2 className="size-5" />}
          eyebrow="Locked"
          title="This proposal can’t be edited right now"
          description={
            <>
              Status:{' '}
              <span className="font-medium text-foreground">
                <ProposalStatusBadge status={proposal.status} />
              </span>{' '}
              — the document set your supervisor is reviewing is frozen (I14). You can edit again
              as soon as a revision is requested.
            </>
          }
          action={
            <>
              <Button asChild>
                <Link to={`/proposals/${proposal.id}`}>View Proposal</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/proposals">All proposals</Link>
              </Button>
            </>
          }
        />
      </div>
    );
  }

  function validate(): boolean {
    if (!title.trim()) {
      setFieldError('A title is required.');
      return false;
    }
    if (!abstract.trim()) {
      setFieldError('An abstract is required.');
      return false;
    }
    setFieldError(null);
    return true;
  }

  async function runSave(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!validate()) return;
    try {
      if (isCreate) {
        const created = await create.mutateAsync({
          title: title.trim(),
          abstract: abstract.trim(),
          ...(body ? { body } : {}),
        });
        toast.success('Draft created — attach your documents, then submit.');
        setDirty(false);
        navigate(`/proposals/${created.id}/edit`, { replace: true });
      } else {
        await patch.mutateAsync({
          title: title.trim(),
          abstract: abstract.trim(),
          body,
        });
        toast.success('Changes saved.');
        setDirty(false);
      }
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  function runSubmit(): void {
    if (!proposalId) return;
    setConfirmSubmit(false);
    submit.mutate(undefined, {
      onSuccess: () => {
        toast.success('Proposal submitted for review.');
        setDirty(false);
        navigate(`/proposals/${proposalId}`, { replace: true });
      },
      onError: (error) => toast.error(errorMessage(error)),
    });
  }

  const saving = create.isPending || patch.isPending;

  return (
    <div className="mx-auto w-full max-w-[900px] px-4 py-6 sm:px-6 sm:py-8">
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
      >
        <Link to="/proposals" className="hover:text-foreground">
          Proposals
        </Link>
        <span aria-hidden="true">›</span>
        <span className="text-foreground">{isCreate ? 'New proposal' : 'Edit'}</span>
      </nav>

      <header className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground sm:text-3xl">
            {isCreate ? 'New proposal' : 'Edit proposal'}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isCreate
              ? 'Title and abstract are required; the document body and files can follow.'
              : 'Edit in place while your proposal is a draft or under revision (§11.3).'}
          </p>
        </div>
        {proposal && <ProposalStatusBadge status={proposal.status} />}
      </header>

      <form className="mt-6 flex flex-col gap-5" onSubmit={runSave} noValidate>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Proposal details</CardTitle>
            <CardDescription>The §11.3 document rule: abstract always, body optional.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="proposal-title">Title</Label>
              <Input
                id="proposal-title"
                value={title}
                maxLength={500}
                placeholder="e.g. Distributed ledger for campus records"
                onChange={(event) => {
                  setTitle(event.target.value);
                  setDirty(true);
                }}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="proposal-abstract">Abstract</Label>
              <Textarea
                id="proposal-abstract"
                value={abstract}
                placeholder="One paragraph: the problem, the approach, the expected outcome."
                onChange={(event) => {
                  setAbstract(event.target.value);
                  setDirty(true);
                }}
              />
            </div>

            {fieldError && (
              <p role="alert" className="text-sm text-danger">
                {fieldError}
              </p>
            )}
          </CardContent>
        </Card>

        {/* The editor control — hidden entirely when the proposal is read-only. */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Document body</CardTitle>
            <CardDescription>
              Rich text, sanitized by the server on save (ADR-14). Optional when you upload a
              document instead.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DocumentEditor
              value={body}
              onChange={(html) => {
                setBody(html);
                setDirty(true);
              }}
            />
          </CardContent>
        </Card>

        {/* Attachments exist only once the proposal does (create ships first). */}
        {!isCreate && proposal && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Documents</CardTitle>
              <CardDescription>
                PDF or Word files, tagged with the version they belong to (I14).
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <AttachmentDropzone
                disabled={upload.isPending}
                progress={upload.isPending ? (uploadProgress ?? 0) : null}
                error={uploadError}
                onFile={(file) => {
                  setUploadError(null);
                  upload.mutate(
                    { file, onProgress: (percent) => setUploadProgress(percent) },
                    {
                      onSuccess: () => {
                        setUploadProgress(null);
                        toast.success(`${file.name} uploaded.`);
                      },
                      onError: (error) => {
                        setUploadProgress(null);
                        setUploadError(errorMessage(error));
                      },
                    },
                  );
                }}
              />
              <AttachmentList
                attachments={attachments}
                editable={editable}
                removingId={remove.isPending ? (remove.variables ?? null) : null}
                onDownload={(attachment) =>
                  downloadAttachment(attachment).catch((error) =>
                    toast.error(errorMessage(error)),
                  )
                }
                onRemove={(attachment) =>
                  remove.mutate(attachment.id, {
                    onError: (error) => toast.error(errorMessage(error)),
                  })
                }
              />
            </CardContent>
          </Card>
        )}

        {!isCreate && (
          <p className="text-xs text-muted-foreground">
            Save your edits, then submit for review — submitting freezes the document set until a
            revision is requested (I14).
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={saving}>
            <Save aria-hidden="true" /> {saving ? 'Saving…' : isCreate ? 'Create draft' : 'Save changes'}
          </Button>
          {!isCreate && editable && (
            <Button
              type="button"
              variant="secondary"
              disabled={submit.isPending}
              onClick={() => setConfirmSubmit(true)}
            >
              <Send aria-hidden="true" /> Submit for review
            </Button>
          )}
          <Button asChild type="button" variant="ghost">
            <Link to="/proposals">
              <ArrowLeft aria-hidden="true" /> Back
            </Link>
          </Button>
        </div>
      </form>

      <ConfirmDialog
        open={confirmSubmit}
        title="Submit this proposal?"
        description="Your supervisor will be notified and the document set will be locked until a revision is requested (I14)."
        confirmLabel="Submit for review"
        loading={submit.isPending}
        onConfirm={runSubmit}
        onCancel={() => setConfirmSubmit(false)}
      />

      <UnsavedChangesDialog
        open={pendingHref !== null}
        onStay={() => setPendingHref(null)}
        onDiscard={() => {
          const href = pendingHref;
          setDirty(false);
          setPendingHref(null);
          if (href) navigate(href);
        }}
      />
    </div>
  );
}
