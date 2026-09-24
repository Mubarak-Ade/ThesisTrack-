/**
 * Password rule evaluation for the strength meter (spec §4).
 *
 * Two rule sets — the mockups disagree between screens, so both exist:
 *   - `reset`    forgot/reset flows  → min 8, upper, lower, number
 *   - `activate` account activation  → min 10, upper, number, special,
 *                                      match the confirmation exactly
 *
 * Pure functions only — unit tested in password-rules.test.ts.
 */

export type PasswordVariant = 'reset' | 'activate';
export type PasswordStrengthLabel = 'Not set' | 'Weak' | 'Fair' | 'Strong';

export interface PasswordRule {
  label: string;
  passed: boolean;
}

export interface PasswordStrength {
  rules: PasswordRule[];
  /** Fraction of rules passed, 0–1. */
  score: number;
  label: PasswordStrengthLabel;
}

const HAS_UPPER = /[A-Z]/;
const HAS_LOWER = /[a-z]/;
const HAS_NUMBER = /[0-9]/;
const HAS_SPECIAL = /[^A-Za-z0-9]/;

export function evaluatePasswordRules(
  password: string,
  variant: PasswordVariant,
  confirmation?: string,
): PasswordRule[] {
  if (variant === 'reset') {
    return [
      { label: 'At least 8 characters', passed: password.length >= 8 },
      { label: 'One uppercase letter', passed: HAS_UPPER.test(password) },
      { label: 'One lowercase letter', passed: HAS_LOWER.test(password) },
      { label: 'One number', passed: HAS_NUMBER.test(password) },
    ];
  }

  return [
    { label: 'At least 10 characters', passed: password.length >= 10 },
    { label: 'One uppercase letter', passed: HAS_UPPER.test(password) },
    { label: 'One number', passed: HAS_NUMBER.test(password) },
    { label: 'One special character', passed: HAS_SPECIAL.test(password) },
    {
      label: 'Passwords match',
      // Not matching yet is not "failed" in a scary way — it just hasn't
      // passed; an empty confirmation never counts.
      passed: confirmation !== undefined && confirmation.length > 0 && password === confirmation,
    },
  ];
}

export function scorePasswordRules(rules: PasswordRule[]): number {
  if (rules.length === 0) return 0;
  return rules.filter((rule) => rule.passed).length / rules.length;
}

export function evaluatePasswordStrength(
  password: string,
  variant: PasswordVariant,
  confirmation?: string,
): PasswordStrength {
  const rules = evaluatePasswordRules(password, variant, confirmation);

  if (password.length === 0) {
    return { rules, score: 0, label: 'Not set' };
  }

  const score = scorePasswordRules(rules);
  const label: PasswordStrengthLabel =
    score >= 1 ? 'Strong' : score >= 0.5 ? 'Fair' : 'Weak';

  return { rules, score, label };
}
