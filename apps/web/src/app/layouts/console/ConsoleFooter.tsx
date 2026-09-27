import { useLocation } from 'react-router-dom';

/**
 * Per-page footer variants (spec §3) — each mockup carries its own © line and
 * link trio. The variant is derived from the pathname inside the shell, so
 * no screen has to thread props through the layout. `/users/import` keeps the
 * console's original footer (its design is frozen, spec §5.7).
 */
interface FooterVariant {
  left: string;
  /** Exact-case link labels from the mockup; rendered as decorative spans. */
  links?: string[];
  /** Alternative to links: a single right-side line (import variant). */
  right?: string;
}

const DASHBOARD: FooterVariant = {
  left: '© 2024 ThesisTrack University Management System. All rights reserved.',
  links: ['Support Portal', 'Institution Policy', 'Privacy Center'],
};

const ALL_USERS: FooterVariant = {
  left: '© 2024 ThesisTrack University Management System • Institutional Access Level: ADMIN',
  links: ['PRIVACY CENTER', 'AUDIT LOGS', 'SYSTEM SUPPORT'],
};

const CREATE: FooterVariant = {
  left: '© 2024 THESISTRACK UNIVERSITY MANAGEMENT SYSTEM • ADMINISTRATIVE CONSOLE',
  links: ['Documentation', 'Privacy Center', 'System Support'],
};

const PROFILE: FooterVariant = {
  left: '© 2024 ThesisTrack University Management System • Administrative Console',
  links: ['PRIVACY POLICY', 'SECURITY AUDIT', 'HELP DESK'],
};

const FACULTY: FooterVariant = {
  left: '© 2024 THESISTRACK UNIVERSITY MANAGEMENT SYSTEM • INSTITUTIONAL ADMINISTRATIVE EDITION',
  links: ['PRIVACY CENTER', 'FACULTY HANDBOOK', 'SUPPORT'],
};

const STUDENTS: FooterVariant = {
  left: '© 2024 THESISTRACK INSTITUTIONAL EDITION • ADMINISTRATIVE CONTROL CENTER',
  links: ['PRIVACY SHIELD', 'SYSTEM HEALTH', 'IT SERVICE DESK'],
};

const IMPORT: FooterVariant = {
  left: 'ThesisTrack · Department of Informatics & AI',
  right: 'Coordinator Console · © 2026',
};

function variantFor(path: string): FooterVariant {
  if (path === '/users/import') return IMPORT;
  if (path === '/users/new') return CREATE;
  if (path === '/users') return ALL_USERS;
  if (path.startsWith('/users/')) return PROFILE;
  if (path === '/faculty') return FACULTY;
  if (path === '/students') return STUDENTS;
  return DASHBOARD;
}

export default function ConsoleFooter() {
  const { pathname } = useLocation();
  const variant = variantFor(pathname);

  return (
    <footer className="border-t border-border px-4 py-4 sm:px-6">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>{variant.left}</p>
        {variant.right ? (
          <p>{variant.right}</p>
        ) : (
          <p className="flex flex-wrap gap-x-5 gap-y-1">
            {variant.links?.map((link) => (
              <span key={link}>{link}</span>
            ))}
          </p>
        )}
      </div>
    </footer>
  );
}
