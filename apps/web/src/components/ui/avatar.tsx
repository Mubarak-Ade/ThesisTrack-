import { User } from 'lucide-react';

type AvatarSize = 'sm' | 'md' | 'lg' | 'xl';

const BOX: Record<AvatarSize, string> = {
  sm: 'h-7 w-7',
  md: 'h-9 w-9',
  lg: 'h-12 w-12',
  xl: 'h-20 w-20',
};

const ICON: Record<AvatarSize, string> = {
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
  lg: 'h-6 w-6',
  xl: 'h-11 w-11',
};

/**
 * Gray silhouette avatar (mockup parity — spec §4). No photo sources exist in
 * the data, so rows, profile headers, and the sidebar persona all render this
 * same person glyph, exactly like the mockups' placeholder avatars.
 */
export function Avatar({ size = 'md', className = '' }: { size?: AvatarSize; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground ${BOX[size]} ${className}`}
    >
      <User className={ICON[size]} strokeWidth={1.75} />
    </span>
  );
}
