import type { ConfigService } from '@nestjs/config';

/**
 * The app's canonical origin for links sent in emails.
 *
 * FRONTEND_URL is a comma-delimited list of origins because CORS needs all
 * of them — but an email link needs exactly ONE. Interpolating the raw
 * value produced verification links like
 * `https://app.example.com,https://example.com/verify?...`, which is how
 * this helper earned its existence. First origin wins, trailing slash
 * dropped.
 */
export function frontendOrigin(config: ConfigService): string {
  return (config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000')
    .split(',')[0]
    .trim()
    .replace(/\/$/, '');
}
