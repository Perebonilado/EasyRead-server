import { frontendOrigin } from './frontend-origin';
import type { ConfigService } from '@nestjs/config';

const configWith = (value: string | undefined) =>
  ({ get: () => value }) as unknown as ConfigService;

describe('frontendOrigin', () => {
  it('takes the FIRST origin of a comma-delimited CORS list', () => {
    expect(
      frontendOrigin(
        configWith('https://app.easiread.com,https://easiread.com'),
      ),
    ).toBe('https://app.easiread.com');
  });

  it('trims whitespace around the listed origins', () => {
    expect(
      frontendOrigin(configWith(' https://app.easiread.com , https://x.com')),
    ).toBe('https://app.easiread.com');
  });

  it('drops a trailing slash so paths concatenate cleanly', () => {
    expect(frontendOrigin(configWith('https://app.easiread.com/'))).toBe(
      'https://app.easiread.com',
    );
  });

  it('passes a single origin through untouched', () => {
    expect(frontendOrigin(configWith('https://app.easiread.com'))).toBe(
      'https://app.easiread.com',
    );
  });

  it('falls back to localhost when unset', () => {
    expect(frontendOrigin(configWith(undefined))).toBe(
      'http://localhost:3000',
    );
  });
});
