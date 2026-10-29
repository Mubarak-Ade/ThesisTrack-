/**
 * Registration-number rules (design 2026-10-28) — shared by the write schemas
 * and the service so the shape check has exactly one definition.
 *
 * Students: `FAC/YY/DEPT/NNNNN`, e.g. `CST/22/SWE/00825`, stored trimmed and
 * upper-case. Supervisors and administrators may carry any 1–32 character
 * number (staff numbers have no fixed shape). Uniqueness and the department
 * cross-check are service rules, because they need database reads.
 */

/** `FAC/YY/DEPT/NNNNN` — two to four letters, two digits, two to four letters, five digits. */
export const STUDENT_REGISTRATION_PATTERN = /^[A-Z]{2,4}\/\d{2}\/[A-Z]{2,4}\/\d{5}$/;

export const STUDENT_REGISTRATION_HINT =
  'Registration number must look like CST/22/SWE/00825';

/** Trimmed and upper-cased — the stored form and the form uniqueness compares. */
export function normalizeRegistrationNumber(value: string): string {
  return value.trim().toUpperCase();
}

/** The `DEPT` segment (`SWE`), or null when the value is not a well-formed number. */
export function registrationNumberDeptSegment(value: string): string | null {
  const segments = value.split('/');
  return segments.length === 4 && STUDENT_REGISTRATION_PATTERN.test(value)
    ? (segments[2] ?? null)
    : null;
}
