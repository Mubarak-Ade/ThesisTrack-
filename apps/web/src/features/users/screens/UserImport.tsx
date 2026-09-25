import { Link } from 'react-router-dom';

import ImportWizard from '../components/ImportWizard';

/**
 * Import Users (spec §5.5): CSV upload → column mapping → validation →
 * batch finalize. The parser, validator and stepper live in ImportWizard;
 * this screen owns the page chrome.
 */
export default function UserImport() {
  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Link to="/" className="transition-colors hover:text-primary">
          Home
        </Link>
        <span aria-hidden="true">/</span>
        <Link to="/users" className="transition-colors hover:text-primary">
          Users
        </Link>
        <span aria-hidden="true">/</span>
        <span className="font-medium text-foreground">Import</span>
      </nav>

      <div className="mt-2">
        <p className="text-xs font-bold uppercase tracking-widest text-primary">Bulk Operations</p>
        <h1 className="mt-1 font-display text-2xl font-bold text-foreground sm:text-3xl">
          Import Users
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Provision students and supervisors in bulk from a CSV export. Every row is validated
          before anything reaches the API.
        </p>
      </div>

      <ImportWizard />
    </div>
  );
}
