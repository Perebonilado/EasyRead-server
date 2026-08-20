import { passwordResetEmail, verificationEmail } from './email-templates';

const URL = 'https://easyread.app/verify?token=abc123';

describe('email templates', () => {
  it('the verification email carries the link, the name, and the 24 hour window', () => {
    const email = verificationEmail({ name: 'Ada Lovelace', url: URL });
    expect(email.subject).toBe('Confirm your email address');
    expect(email.html).toContain(URL);
    expect(email.html).toContain('Ada');
    expect(email.html).toContain('24 hours');
    expect(email.text).toContain(URL);
    expect(email.text).toContain('24 hours');
  });

  it('the reset email carries the link and the 1 hour window', () => {
    const email = passwordResetEmail({ name: 'Bola', url: URL });
    expect(email.subject).toBe('Reset your password');
    expect(email.html).toContain(URL);
    expect(email.html).toContain('1 hour');
    expect(email.text).toContain('ignore this email');
  });

  it('never ships an em dash, in html or text', () => {
    for (const email of [
      verificationEmail({ name: 'A', url: URL }),
      passwordResetEmail({ name: 'A', url: URL }),
    ]) {
      expect(email.html).not.toContain('—');
      expect(email.text).not.toContain('—');
      expect(email.subject).not.toContain('—');
    }
  });

  it('escapes a hostile display name instead of rendering it', () => {
    const email = verificationEmail({
      name: '<img src=x onerror=alert(1)>',
      url: URL,
    });
    expect(email.html).not.toContain('<img src=x');
    expect(email.html).toContain('&lt;img');
  });

  it('greets by first name only, and survives an empty name', () => {
    expect(
      verificationEmail({ name: 'Ada Lovelace', url: URL }).html,
    ).toContain('Welcome, Ada.');
    expect(verificationEmail({ name: '  ', url: URL }).html).toContain(
      'Welcome, there.',
    );
  });
});
