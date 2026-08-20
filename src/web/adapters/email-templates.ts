/**
 * The two emails EasyRead sends, drawn in the app's own hand.
 *
 * Email HTML is a hostile place: styles must be inline, layout leans on
 * tables, and webfonts rarely load. So the design carries the app through
 * what survives everywhere: the ink and violet palette, the rounded white
 * card on a soft grey page, one loud button, quiet small print. Every
 * template ships a plain-text twin for clients that prefer it.
 */

const INK = '#0b0b0c';
const BODY = '#33333b';
const SUBTLE = '#5c5c65';
const ACCENT = '#6d28d9';
const TINT = '#f5f2ff';
const LINE = '#ececef';
const PAGE = '#fafafa';
const FONT =
  "'Plus Jakarta Sans', -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/** The shared shell: wordmark, card, footer. Content goes inside the card. */
function layout(opts: {
  preheader: string;
  content: string;
  footer: string;
}): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
</head>
<body style="margin:0;padding:0;background:${PAGE};">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${opts.preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAGE};">
  <tr><td align="center" style="padding:40px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
      <tr><td style="padding:0 8px 18px;font-family:${FONT};font-size:20px;font-weight:800;letter-spacing:-0.02em;color:${INK};">
        Easy<span style="color:${ACCENT};">Read</span>
      </td></tr>
      <tr><td style="background:#ffffff;border:1px solid ${LINE};border-radius:16px;padding:36px 32px;font-family:${FONT};">
        ${opts.content}
      </td></tr>
      <tr><td style="padding:18px 8px 0;font-family:${FONT};font-size:12.5px;line-height:1.6;color:${SUBTLE};">
        ${opts.footer}
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

/** A button that renders as a button everywhere, Outlook included. */
function button(url: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0 8px;">
  <tr><td style="border-radius:999px;background:${ACCENT};">
    <a href="${url}" style="display:inline-block;padding:14px 30px;font-family:${FONT};font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:999px;">${label}</a>
  </td></tr>
</table>`;
}

/** The link spelled out, for clients where buttons misbehave. */
function fallbackLink(url: string): string {
  return `<p style="margin:16px 0 0;font-size:12.5px;line-height:1.6;color:${SUBTLE};word-break:break-all;">
    If the button does not work, copy this link into your browser:<br>
    <a href="${url}" style="color:${ACCENT};text-decoration:underline;">${url}</a>
  </p>`;
}

const heading = (text: string) =>
  `<h1 style="margin:0;font-size:23px;line-height:1.25;font-weight:800;letter-spacing:-0.02em;color:${INK};">${text}</h1>`;

const paragraph = (text: string) =>
  `<p style="margin:14px 0 0;font-size:15px;line-height:1.65;color:${BODY};">${text}</p>`;

const quietNote = (text: string) =>
  `<div style="margin-top:24px;padding:14px 16px;background:${TINT};border-radius:12px;font-size:13px;line-height:1.6;color:${SUBTLE};">${text}</div>`;

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const firstNameOf = (name: string) => name.trim().split(/\s+/)[0] || 'there';

export function verificationEmail(input: {
  name: string;
  url: string;
}): RenderedEmail {
  const name = escapeHtml(firstNameOf(input.name));
  const subject = 'Confirm your email address';
  const preheader = 'One tap and your EasyRead account is settled.';

  const content = [
    heading(`Welcome, ${name}.`),
    paragraph(
      'You are one tap away. Confirm that this address is yours, and your EasyRead account is settled.',
    ),
    button(input.url, 'Confirm my email'),
    fallbackLink(input.url),
    quietNote(
      'This link works for 24 hours. If you did not create an EasyRead account, you can ignore this email and nothing will happen.',
    ),
  ].join('\n');

  const text = [
    `Welcome, ${firstNameOf(input.name)}.`,
    '',
    'You are one tap away. Confirm that this address is yours, and your EasyRead account is settled:',
    '',
    input.url,
    '',
    'This link works for 24 hours. If you did not create an EasyRead account, you can ignore this email and nothing will happen.',
  ].join('\n');

  return {
    subject,
    html: layout({
      preheader,
      content,
      footer:
        'You are getting this because this address was used to create an EasyRead account.',
    }),
    text,
  };
}

export function passwordResetEmail(input: {
  name: string;
  url: string;
}): RenderedEmail {
  const name = escapeHtml(firstNameOf(input.name));
  const subject = 'Reset your password';
  const preheader = 'Choose a new password for your EasyRead account.';

  const content = [
    heading(`Hi ${name},`),
    paragraph(
      'Someone asked to reset the password for your EasyRead account. If that was you, choose a new one below.',
    ),
    button(input.url, 'Choose a new password'),
    fallbackLink(input.url),
    quietNote(
      'This link works for 1 hour. If you did not ask for this, you can ignore this email; your password stays exactly as it is.',
    ),
  ].join('\n');

  const text = [
    `Hi ${firstNameOf(input.name)},`,
    '',
    'Someone asked to reset the password for your EasyRead account. If that was you, choose a new one here:',
    '',
    input.url,
    '',
    'This link works for 1 hour. If you did not ask for this, you can ignore this email; your password stays exactly as it is.',
  ].join('\n');

  return {
    subject,
    html: layout({
      preheader,
      content,
      footer:
        'You are getting this because a password reset was requested for an EasyRead account with this address.',
    }),
    text,
  };
}
