import { ArrowLeft, Compass, Home, SearchX } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import Callout from '@/components/feedback/Callout';
import StatusLayout from '@/app/layouts/StatusLayout';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

/**
 * §16.1 global chrome — the shared *Not found* state, as the wildcard route
 * (§10.3): unknown URLs render this screen instead of silently redirecting
 * to `/`. Public: no session needed to be told a page doesn't exist.
 */
function NotFound() {
  const navigate = useNavigate();

  return (
    <StatusLayout
      image="images/library.jpg"
      imageAlt="Library shelves stacked with books"
      eyebrow={
        <span className="inline-flex items-center gap-1.5 rounded-full border border-danger/30 bg-danger-bg px-3 py-1 text-xs font-semibold uppercase tracking-wider text-danger">
          <SearchX className="size-3.5" aria-hidden="true" /> Error 404
        </span>
      }
      title="Page not found"
      subcopy="The page you're looking for doesn't exist, may have been moved, or the address contains a typo. ThesisTrack's console routes all start at your dashboard."
    >
      <Callout
        variant="neutral"
        title="Check the address"
        icon={<Compass className="size-4 text-muted-foreground" aria-hidden="true" />}
      >
        Project and student URLs are built from real records — if you followed a
        link from an email or notification, it may reference a record your
        account can no longer reach.
      </Callout>

      <Button className="w-full" asChild>
        <Link to="/">
          <Home aria-hidden="true" /> Back to home
        </Link>
      </Button>

      <Button variant="outline" className="w-full" onClick={() => navigate(-1)}>
        <ArrowLeft aria-hidden="true" /> Go back
      </Button>

      <div>
        <Separator />
        <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
          <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
          ThesisTrack · 404 · Not found
        </p>
      </div>
    </StatusLayout>
  );
}

export default NotFound;
