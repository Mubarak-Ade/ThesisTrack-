import { useState, type ReactNode } from 'react';
import { ShieldAlert, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import AuthFooter from './AuthFooter';
import AuthHeader from './AuthHeader';

export interface AuthLayoutProps {
  children: ReactNode;
  /**
   * Left column style:
   * - 'illustration' (default): image card + headline + subcopy
   * - 'plain': headline + subcopy only (status screens hide the image card)
   */
  variant?: 'illustration' | 'plain';
  /** Override the left image (Forbidden passes the mint gradient). */
  image?: string;
  imageAlt?: string;
  /** Circular badge overlapping the top-right corner of the left image. */
  imageBadge?: 'success' | 'danger';
  /** Overrides the default brand headline (Forbidden: "Restricted Area"). */
  headline?: string;
  subcopy?: string;
  /**
   * Content floating above the left column (create-password's 3D thumbs-up
   * card overlaps the illustration in the mockup).
   */
  overlay?: ReactNode;
}

function IllustrationCard({
  src,
  alt,
  badge,
}: {
  src: string;
  alt: string;
  badge?: 'success' | 'danger';
}) {
  const [failed, setFailed] = useState(false);
  const BadgeIcon = badge === 'danger' ? ShieldAlert : ShieldCheck;
  // Pages pass root-relative "images/…" paths; nested routes would resolve
  // them against the current URL (/forgot-password/images/…), so pin to root.
  const resolvedSrc = src.startsWith('/') ? src : `/${src}`;

  return (
    <div className="relative">
      <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-primary/15 via-surface-alt to-primary/5 shadow-lg ring-1 ring-black/5">
        {!failed ? (
          <img
            src={resolvedSrc}
            alt={alt}
            onError={() => setFailed(true)}
            className="aspect-[4/3] w-full object-cover"
          />
        ) : (
          <div className="aspect-[4/3] w-full" />
        )}
      </div>
      {badge && (
        <span
          className={cn(
            'absolute -top-3 -right-3 grid size-11 place-items-center rounded-full text-primary-foreground ring-4 ring-background',
            badge === 'danger' ? 'bg-danger' : 'bg-primary',
          )}
        >
          <BadgeIcon className="size-5" aria-hidden="true" />
        </span>
      )}
    </div>
  );
}

export default function AuthLayout({
  children,
  variant = 'illustration',
  image = 'images/library.jpg',
  imageAlt = 'Students browsing the shelves of a university library',
  imageBadge,
  headline = 'Simplify Your Research Journey',
  subcopy = 'ThesisTrack provides the structure and tools you need to manage final-year research projects efficiently from start to finish.',
  overlay,
}: AuthLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AuthHeader />

      <div className="mx-auto grid w-full max-w-[1400px] flex-1 grid-cols-1 md:grid-cols-2">
        {/* Left: brand panel */}
        <section className="relative flex items-center justify-center px-6 py-10 md:border-r md:border-border md:px-10 md:py-16">
          <div className="w-full max-w-xl text-center">
            {variant === 'illustration' && (
              <IllustrationCard src={image} alt={imageAlt} badge={imageBadge} />
            )}
            <h1 className="mt-8 text-3xl font-bold tracking-tight text-foreground md:text-4xl">
              {headline}
            </h1>
            <p className="mx-auto mt-4 max-w-lg text-base leading-relaxed text-muted-foreground md:text-lg">
              {subcopy}
            </p>
          </div>
          {overlay && <div className="absolute inset-0 grid place-items-center">{overlay}</div>}
        </section>

        {/* Right: screen content */}
        <section className="flex items-center justify-center px-6 py-10 md:px-10 md:py-16">
          <div className="w-full max-w-md">{children}</div>
        </section>
      </div>

      <AuthFooter />
    </div>
  );
}
