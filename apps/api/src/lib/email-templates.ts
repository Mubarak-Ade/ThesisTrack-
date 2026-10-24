/**
 * Pure email renderers for the two transactional account-lifecycle flows
 * (mailer design §4). No I/O, no env, no side effects — each returns exactly
 * `{ subject, text, html }` so the mailer stays transport-agnostic.
 *
 * Security: `name` and `link` are interpolated into HTML, so both are escaped.
 * The `link` carries the one-time token and is NEVER logged — only rendered.
 */

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

export interface InvitationEmail {
  name: string;
  link: string;
  expiresAt: Date;
}

export interface PasswordResetEmail {
  name: string;
  link: string;
  expiresAt: Date;
}

/** Minimal HTML escaping for user-controlled values. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Human-readable, unambiguous expiry (UTC) for both text and HTML bodies. */
function formatExpiry(date: Date): string {
  return `${date.toISOString()} (UTC)`;
}

/**
 * POST /users, POST /users/:id/invite, POST /users/import —
 * "you have been invited; set your password to activate."
 */
export function renderInvitation({ name, link, expiresAt }: InvitationEmail): RenderedEmail {
  const safeName = escapeHtml(name);
  const safeLink = escapeHtml(link);
  const expiry = formatExpiry(expiresAt);

  return {
    subject: 'You have been invited to ThesisTrack',
    text: [
      `Hello ${name},`,
      '',
      'An administrator has invited you to ThesisTrack.',
      'Open the link below to set your password and activate your account:',
      '',
      link,
      '',
      `This link expires on ${expiry}.`,
      '',
      'If you did not expect this invitation, you can safely ignore this email.',
    ].join('\n'),
    html: [
      `<p>Hello ${safeName},</p>`,
      '<p>An administrator has invited you to <strong>ThesisTrack</strong>.</p>',
      '<p>Open the link below to set your password and activate your account:</p>',
      `<p><a href="${safeLink}">${safeLink}</a></p>`,
      `<p>This link expires on ${expiry}.</p>`,
      '<p>If you did not expect this invitation, you can safely ignore this email.</p>',
    ].join('\n'),
  };
}

/** POST /auth/forgot-password — "set a new password." */
export function renderPasswordReset({ name, link, expiresAt }: PasswordResetEmail): RenderedEmail {
  const safeName = escapeHtml(name);
  const safeLink = escapeHtml(link);
  const expiry = formatExpiry(expiresAt);

  return {
    subject: 'Reset your ThesisTrack password',
    text: [
      `Hello ${name},`,
      '',
      'Someone requested a password reset for your ThesisTrack account.',
      'Open the link below to choose a new password:',
      '',
      link,
      '',
      `This link expires on ${expiry}.`,
      '',
      'If you did not request this, you can safely ignore this email — your password stays unchanged.',
    ].join('\n'),
    html: [
      `<p>Hello ${safeName},</p>`,
      '<p>Someone requested a password reset for your <strong>ThesisTrack</strong> account.</p>',
      '<p>Open the link below to choose a new password:</p>',
      `<p><a href="${safeLink}">${safeLink}</a></p>`,
      `<p>This link expires on ${expiry}.</p>`,
      '<p>If you did not request this, you can safely ignore this email — your password stays unchanged.</p>',
    ].join('\n'),
  };
}
