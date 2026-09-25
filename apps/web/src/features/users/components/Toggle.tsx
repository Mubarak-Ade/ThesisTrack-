import { cn } from '@/lib/utils';

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description: string;
  /** Marks UI-only switches that the API does not persist (spec §4). */
  uiOnly?: boolean;
}

/** Mockup-style switch (no Radix dependency): `role="switch"` + aria-checked. */
export default function Toggle({ checked, onChange, label, description, uiOnly }: ToggleProps) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">
          {label}
          {uiOnly && (
            <span className="ml-2 align-middle text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              UI only
            </span>
          )}
        </p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          checked ? 'bg-primary' : 'bg-muted',
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            'absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow transition-transform',
            checked && 'translate-x-5',
          )}
        />
      </button>
    </div>
  );
}
