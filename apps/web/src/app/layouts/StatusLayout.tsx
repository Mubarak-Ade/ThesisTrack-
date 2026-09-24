import { useState, type ReactNode } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import AuthLayout, { type AuthLayoutProps } from './AuthLayout';

interface StatusLayoutProps {
  children: ReactNode;
  /** Left-column overrides (Forbidden passes its own panel config). */
  left?: Omit<AuthLayoutProps, 'children'>;
  /** Hero image path (under public/); gradient fallback on load failure. */
  image?: string;
  imageAlt?: string;
  /** Circular badge overlapping the image's bottom-right corner. */
  badge?: 'success' | 'danger';
  /** Badge icon override (invalid-invitation uses EyeOff). */
  badgeIcon?: ReactNode;
  /** Label between the image and the heading (mockup pills / eyebrows). */
  eyebrow?: ReactNode;
  /** Serif heading — the mockups' status screens use the display face. */
  title: string;
  subcopy?: string;
}

function StatusImage({
  src,
  alt,
  badge,
  badgeIcon,
}: {
  src: string;
  alt: string;
  badge?: 'success' | 'danger';
  /** Icon override — the invalid-invitation mockup shows an eye-off badge. */
  badgeIcon?: ReactNode;
}) {
  const [failed, setFailed] = useState(false);
  const DefaultIcon = badge === 'danger' ? XCircle : CheckCircle2;
  // Root-relative pin — see AuthLayout.IllustrationCard (nested-route bug).
  const resolvedSrc = src.startsWith('/') ? src : `/${src}`;

  return (
    <div className="relative w-52 md:w-56">
      <div className="overflow-hidden rounded-xl bg-gradient-to-br from-primary/15 via-surface-alt to-primary/5 shadow-md ring-1 ring-black/5">
        {!failed ? (
          <img
            src={resolvedSrc}
            alt={alt}
            onError={() => setFailed(true)}
            className="aspect-square w-full object-cover"
          />
        ) : (
          <div className="aspect-square w-full" />
        )}
      </div>
      {badge && (
        <span
          className={cn(
            'absolute -bottom-3 -right-3 grid size-11 place-items-center rounded-full text-primary-foreground ring-4 ring-background',
            badge === 'danger' ? 'bg-danger' : 'bg-primary',
          )}
        >
          {badgeIcon ?? <DefaultIcon className="size-5" aria-hidden="true" />}
        </span>
      )}
    </div>
  );
}

/**
 * Image-hero status screen: brand panel on the left, hero image +
 * eyebrow + serif heading + actions on the right (spec §4).
 */
export default function StatusLayout({
  children,
  left,
  image,
  imageAlt = '',
  badge,
  badgeIcon,
  eyebrow,
  title,
  subcopy,
}: StatusLayoutProps) {
  return (
    <AuthLayout {...(left ?? {})}>
      <div className="flex flex-col items-center text-center">
        {image && <StatusImage src={image} alt={imageAlt} badge={badge} badgeIcon={badgeIcon} />}
        {eyebrow && <div className="mt-6">{eyebrow}</div>}

        <h2 className="mt-6 font-display text-3xl font-semibold text-foreground md:text-4xl">
          {title}
        </h2>
        {subcopy && (
          <p className="mt-3 max-w-md text-base leading-relaxed text-muted-foreground">{subcopy}</p>
        )}

        <div className="mt-8 w-full space-y-4">{children}</div>
      </div>
    </AuthLayout>
  );
}
