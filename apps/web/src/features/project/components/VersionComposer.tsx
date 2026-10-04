import { useState, type SyntheticEvent } from 'react';
import { FilePlus2, PenLine, Send } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import AttachmentDropzone from '@/components/upload/AttachmentDropzone';
import { ApiError } from '@/lib/api/http';
import type { UploadProgress } from '@/lib/api/files';

interface VersionComposerProps {
  /** One new version (§5.5): text body or file, never both (§14.2). */
  onAppend: (payload: { body?: string; file?: File }, onProgress: UploadProgress) => Promise<void>;
  busy?: boolean;
}

/**
 * §11.5 "New version" — the revision_required path. The prior versions stay
 * immutable (I7); this posts the *next* number in the sequence, either as a
 * text body or as an uploaded file with real progress.
 */
export default function VersionComposer({ onAppend, busy = false }: VersionComposerProps) {
  const [mode, setMode] = useState<'text' | 'file'>('text');
  const [body, setBody] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const working = busy || progress !== null;

  async function send(event: SyntheticEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    try {
      if (mode === 'text') {
        if (!body.trim()) {
          setError('Write the revised text first.');
          return;
        }
        await onAppend({ body: body.trim() }, () => {});
      } else {
        if (!file) {
          setError('Choose a file first.');
          return;
        }
        setProgress(0);
        await onAppend({ file }, (percent) => setProgress(percent));
      }
      setBody('');
      setFile(null);
      setProgress(null);
      toast.success('New version added.');
    } catch (cause) {
      setProgress(null);
      setError(
        cause instanceof ApiError
          ? cause.message
          : cause instanceof Error
            ? cause.message
            : 'The version could not be saved.',
      );
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FilePlus2 className="size-4 text-primary" aria-hidden="true" /> New version
        </CardTitle>
        <CardDescription>
          Versions are immutable (I7) — this becomes the next number in the history, the earlier
          ones stay exactly as they were.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-4" onSubmit={(event) => void send(event)} noValidate>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Version form">
            <Button
              type="button"
              size="sm"
              variant={mode === 'text' ? 'secondary' : 'outline'}
              aria-pressed={mode === 'text'}
              disabled={working}
              onClick={() => setMode('text')}
            >
              <PenLine aria-hidden="true" /> Write text
            </Button>
            <Button
              type="button"
              size="sm"
              variant={mode === 'file' ? 'secondary' : 'outline'}
              aria-pressed={mode === 'file'}
              disabled={working}
              onClick={() => setMode('file')}
            >
              <Send aria-hidden="true" /> Upload file
            </Button>
          </div>

          {mode === 'text' ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="version-body">Revised text</Label>
              <Textarea
                id="version-body"
                value={body}
                rows={6}
                placeholder="Paste the revised chapter…"
                onChange={(event) => setBody(event.target.value)}
              />
            </div>
          ) : (
            <AttachmentDropzone
              accept=".pdf,.doc,.docx,.txt,.csv,.zip,.png,.jpg,.jpeg"
              hint="PDF, Word, text, CSV or ZIP (§14.4 limits apply)"
              disabled={working}
              progress={progress}
              onFile={(next) => {
                setFile(next);
              }}
            />
          )}

          {file && mode === 'file' && (
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

          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}

          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={working}>
              {working ? 'Saving…' : 'Post new version'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
