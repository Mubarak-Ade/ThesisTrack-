import type { ReactNode } from 'react';
import {
  ArrowRight,
  ClipboardCheck,
  Database,
  FileText,
  Mail,
  MessageCircle,
  Settings,
  UserRound,
  Users,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import BrandMark from '@/components/navigation/BrandMark';
import { Button } from '@/components/ui/button';

/**
 * §10.3 `/` — the public landing page (was a 6-line redirect to the stub
 * dashboard). Copy follows the LOCKED framing: the §1.1 definition, the
 * §1.3 value-proposition flow, the §1.4 fragmentation problem and the §4
 * responsibility model. No public sign-up exists (§4.3), so the only action
 * is Sign in.
 */

const SCATTERED = [
  'WhatsApp threads',
  'Email chains',
  'Physical documents',
  'Face-to-face meetings',
  'Personal files',
];

const LIFECYCLE = [
  'Provisioning',
  'Supervision assignment',
  'Proposal',
  'Approval',
  'Project',
  'Milestones',
  'Submissions',
  'Reviews',
  'Feedback',
  'Progress',
  'Archive',
];

const RESPONSIBILITY: { step: string; title: string; body: string; icon: ReactNode }[] = [
  {
    step: '01',
    title: 'Coordinator defines the process',
    body: 'Configures the department workflow, provisions accounts and assigns supervisors — administration only, never an academic approval.',
    icon: <Settings className="size-5" aria-hidden="true" />,
  },
  {
    step: '02',
    title: 'Student performs the work',
    body: 'Writes the proposal, works through milestones and submits versions — one tracked path from welcome to archive.',
    icon: <UserRound className="size-5" aria-hidden="true" />,
  },
  {
    step: '03',
    title: 'Supervisor evaluates the work',
    body: 'Reviews proposals and submissions, requests revisions and leaves feedback — every decision recorded against the record.',
    icon: <ClipboardCheck className="size-5" aria-hidden="true" />,
  },
  {
    step: '04',
    title: 'ThesisTrack records and monitors',
    body: 'Stages, deadlines, notifications and an activity trail — the whole department can see where every project stands.',
    icon: <Database className="size-5" aria-hidden="true" />,
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <BrandMark />
          <nav aria-label="Primary" className="flex items-center gap-3">
            <Button type="button" asChild>
              <Link to="/login">Sign in</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main>
        {/* ── Hero: the §1.1 definition + §1.3 flow ─────────────────── */}
        <section aria-labelledby="hero-heading" className="relative overflow-hidden">
          <div
            className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent"
            aria-hidden="true"
          />
          <div className="relative mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:py-24">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-primary">
                Final-year project supervision, centralised
              </p>
              <h1
                id="hero-heading"
                className="mt-4 font-display text-4xl font-semibold leading-tight text-foreground sm:text-5xl"
              >
                Scattered project activities,
                <span className="block text-primary">one centralised lifecycle.</span>
              </h1>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                ThesisTrack is a web-based final-year project supervision and management
                platform that centralises project proposals, supervision, progress tracking,
                submissions, reviews, feedback, deadlines and departmental oversight for a
                whole department.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button type="button" size="lg" asChild>
                  <Link to="/login">
                    Sign in to ThesisTrack <ArrowRight aria-hidden="true" />
                  </Link>
                </Button>
                <p className="text-sm text-muted-foreground">
                  Accounts are created by your department administrator — there is no public
                  sign-up.
                </p>
              </div>
            </div>

            {/* The supervised lifecycle, as the records flow it replaces
                fragmentation with (§1.3 / §2.1). */}
            <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                The supervised lifecycle
              </p>
              <ol className="mt-4 grid gap-2" aria-label="Supervised project lifecycle">
                {LIFECYCLE.map((step, index) => (
                  <li
                    key={step}
                    className="flex items-center gap-3 rounded-lg bg-surface-alt px-3 py-2 text-sm"
                  >
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
                      {index + 1}
                    </span>
                    <span className="font-medium text-foreground">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        {/* ── §1.3 value-proposition flow: scattered → ThesisTrack → centralised ── */}
        <section aria-labelledby="flow-heading" className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <h2 id="flow-heading" className="sr-only">
            From fragmentation to a centralised lifecycle
          </h2>
          <div className="grid items-stretch gap-4 md:grid-cols-[1fr_auto_0.7fr_auto_1fr]">
            <div className="rounded-2xl border border-border bg-danger-bg/50 p-5">
              <p className="flex items-center gap-2 text-sm font-semibold text-danger">
                <MessageCircle className="size-4" aria-hidden="true" /> Scattered academic
                project activities
              </p>
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {SCATTERED.map((item) => (
                  <li
                    key={item}
                    className="rounded-full border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="hidden items-center md:flex" aria-hidden="true">
              <ArrowRight className="size-5 text-muted-foreground" />
            </div>

            <div className="grid place-items-center rounded-2xl bg-primary p-5 text-center text-primary-foreground">
              <BrandMark className="[&_span:last-child]:text-primary-foreground" />
            </div>

            <div className="hidden items-center md:flex" aria-hidden="true">
              <ArrowRight className="size-5 text-muted-foreground" />
            </div>

            <div className="rounded-2xl border border-border bg-success-bg p-5">
              <p className="flex items-center gap-2 text-sm font-semibold text-success">
                <FileText className="size-4" aria-hidden="true" /> Centralised project
                lifecycle
              </p>
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {['Proposals', 'Supervision', 'Milestones', 'Submissions', 'Reviews', 'Feedback', 'Deadlines'].map(
                  (item) => (
                    <li
                      key={item}
                      className="rounded-full border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground"
                    >
                      {item}
                    </li>
                  ),
                )}
              </ul>
            </div>
          </div>

          <p className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
            <Mail className="size-4 shrink-0" aria-hidden="true" />
            Delayed feedback, missed deadlines and manual paperwork — the problems this
            department raised in elicitation — are tracked the moment a record moves.
          </p>
        </section>

        {/* ── §4 responsibility model ──────────────────────────────────── */}
        <section
          aria-labelledby="responsibility-heading"
          className="border-y border-border bg-surface"
        >
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
            <p className="text-xs font-bold uppercase tracking-widest text-primary">
              Who does what
            </p>
            <h2
              id="responsibility-heading"
              className="mt-3 font-display text-3xl font-semibold text-foreground"
            >
              Four responsibilities, one record
            </h2>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {RESPONSIBILITY.map((item) => (
                <article key={item.step} className="rounded-2xl border border-border bg-background p-5">
                  <div className="flex items-center justify-between">
                    <span className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary">
                      {item.icon}
                    </span>
                    <span className="font-display text-sm font-semibold text-muted-foreground">
                      {item.step}
                    </span>
                  </div>
                  <h3 className="mt-4 text-sm font-semibold text-foreground">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ── Closing CTA ──────────────────────────────────────────────── */}
        <section aria-labelledby="cta-heading" className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <div className="rounded-3xl bg-primary px-6 py-10 text-center sm:px-10">
            <h2
              id="cta-heading"
              className="font-display text-3xl font-semibold text-primary-foreground"
            >
              Ready to centralise your department's project lifecycle?
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-primary-foreground/80">
              Sign in with the credentials your coordinator provisioned. Students land on
              their state and next action; supervisors on what needs review; administrators
              on the department's health.
            </p>
            <div className="mt-6 flex justify-center">
              <Button
                type="button"
                size="lg"
                variant="secondary"
                className="bg-background text-primary hover:bg-background/90"
                asChild
              >
                <Link to="/login">
                  Sign in <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row sm:px-6">
          <BrandMark />
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Users className="size-3.5" aria-hidden="true" />
            Department of Informatics · Final-year project supervision and management
          </p>
        </div>
      </footer>
    </div>
  );
}
