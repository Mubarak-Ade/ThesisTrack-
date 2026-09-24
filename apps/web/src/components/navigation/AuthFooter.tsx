import { FileText, Mail, ShieldCheck } from 'lucide-react';

const links = [
  { label: 'Contact IT Help', icon: Mail },
  { label: 'Privacy Policy', icon: ShieldCheck },
  { label: 'Terms of Service', icon: FileText },
] as const;

/** Footer shared by AuthLayout and StatusLayout (mockup wording). */
export default function AuthFooter() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto flex w-full max-w-[1400px] flex-col items-center justify-between gap-3 px-6 py-4 text-sm text-muted-foreground md:flex-row md:px-10">
        <p>© 2026 ThesisTrack. All rights reserved.</p>
        <nav aria-label="Footer" className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
          {links.map(({ label, icon: Icon }) => (
            <a
              key={label}
              href="#"
              className="flex items-center gap-1.5 transition-colors hover:text-foreground"
            >
              <Icon className="size-4" aria-hidden="true" />
              {label}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  );
}
