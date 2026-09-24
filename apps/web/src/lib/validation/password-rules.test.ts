import { describe, expect, it } from 'vitest';
import {
  evaluatePasswordRules,
  evaluatePasswordStrength,
  scorePasswordRules,
} from './password-rules';

describe('evaluatePasswordRules — reset variant', () => {
  it('has the four mockup rules', () => {
    const labels = evaluatePasswordRules('', 'reset').map((r) => r.label);
    expect(labels).toEqual([
      'At least 8 characters',
      'One uppercase letter',
      'One lowercase letter',
      'One number',
    ]);
  });

  it('enforces the 8-character boundary', () => {
    expect(evaluatePasswordRules('Ab3aaaa', 'reset')[0].passed).toBe(false); // 7
    expect(evaluatePasswordRules('Ab3aaaaa', 'reset')[0].passed).toBe(true); // 8
  });

  it('checks case and number classes', () => {
    const rules = evaluatePasswordRules('abcdefgh', 'reset');
    expect(rules.map((r) => r.passed)).toEqual([true, false, true, false]);

    const upper = evaluatePasswordRules('ABCDEFGH', 'reset');
    expect(upper.map((r) => r.passed)).toEqual([true, true, false, false]);

    const strong = evaluatePasswordRules('Abcdefg1', 'reset');
    expect(strong.every((r) => r.passed)).toBe(true);
  });
});

describe('evaluatePasswordRules — activate variant', () => {
  it('has the five mockup rules', () => {
    const labels = evaluatePasswordRules('', 'activate').map((r) => r.label);
    expect(labels).toEqual([
      'At least 10 characters',
      'One uppercase letter',
      'One number',
      'One special character',
      'Passwords match',
    ]);
  });

  it('enforces the 10-character boundary', () => {
    expect(evaluatePasswordRules('Abcdefgh1', 'activate')[0].passed).toBe(false); // 9
    expect(evaluatePasswordRules('Abcdefgh12', 'activate')[0].passed).toBe(true); // 10
  });

  it('accepts any non-alphanumeric as the special character', () => {
    expect(evaluatePasswordRules('Abcdefgh1!', 'activate')[3].passed).toBe(true);
    expect(evaluatePasswordRules('Abcdefgh1@', 'activate')[3].passed).toBe(true);
    expect(evaluatePasswordRules('Abcdefgh12', 'activate')[3].passed).toBe(false);
  });

  it('match rule requires a non-empty confirmation', () => {
    expect(evaluatePasswordRules('Abcdefgh1!', 'activate')[4].passed).toBe(false);
    expect(evaluatePasswordRules('Abcdefgh1!', 'activate', '')[4].passed).toBe(false);
    expect(evaluatePasswordRules('Abcdefgh1!', 'activate', 'other')[4].passed).toBe(false);
    expect(evaluatePasswordRules('Abcdefgh1!', 'activate', 'Abcdefgh1!')[4].passed).toBe(true);
  });
});

describe('evaluatePasswordStrength', () => {
  it('empty password → "Not set" with score 0', () => {
    const result = evaluatePasswordStrength('', 'reset');
    expect(result.label).toBe('Not set');
    expect(result.score).toBe(0);
  });

  it('score is the passed fraction', () => {
    expect(scorePasswordRules(evaluatePasswordRules('Abcdefg1', 'reset'))).toBe(1);
    expect(
      scorePasswordRules([
        { label: 'a', passed: true },
        { label: 'b', passed: false },
        { label: 'c', passed: true },
        { label: 'd', passed: false },
      ]),
    ).toBe(0.5);
  });

  it('thresholds: <50% Weak, 50–99% Fair, 100% Strong', () => {
    expect(evaluatePasswordStrength('a', 'reset').label).toBe('Weak'); // 1/4
    expect(evaluatePasswordStrength('abcdefg1', 'reset').label).toBe('Fair'); // 3/4
    expect(evaluatePasswordStrength('Abcdefg1', 'reset').label).toBe('Strong'); // 4/4
  });

  it('activate variant counts the match rule in the score', () => {
    const unmatched = evaluatePasswordStrength('Abcdefgh1!', 'activate', 'nope');
    expect(unmatched.label).toBe('Fair'); // 4/5

    const matched = evaluatePasswordStrength('Abcdefgh1!', 'activate', 'Abcdefgh1!');
    expect(matched.label).toBe('Strong'); // 5/5
  });
});
