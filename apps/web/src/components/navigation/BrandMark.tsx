import { cn } from '@/lib/utils';

interface BrandMarkProps {
  className?: string;
}

/** Green rounded-square book glyph + wordmark (redrawn from the mockups). */
export default function BrandMark({ className }: BrandMarkProps) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <span className="grid size-9 place-items-center rounded-[10px] bg-primary">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-5 text-primary-foreground"
          aria-hidden="true"
        >
          <path d="M12 7v13" />
          <path d="M12 7C10.2 5.6 7.8 5 5 5v13c2.8 0 5.2.6 7 2" />
          <path d="M12 7c1.8-1.4 4.2-2 7-2v13c-2.8 0-5.2.6-7 2" />
        </svg>
      </span>
      <span className="text-lg font-bold tracking-tight text-foreground">ThesisTrack</span>
    </span>
  );
}
