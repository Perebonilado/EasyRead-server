import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drive_v3, google } from 'googleapis';

/**
 * Shared Drive client.
 *
 * Auth note carried over from AI Examiner: a bare service account has no Drive
 * storage quota of its own, so uploads either fail or land nowhere useful. The
 * fix is domain-wide delegation — a JWT that impersonates a real Workspace user
 * (`GOOGLE_WORKSPACE_SUBJECT`), whose quota the files count against.
 *
 * When no subject is configured we fall back to plain service-account auth,
 * which is fine for reading and for Shared Drives but will hit quota errors on
 * upload to My Drive. The error is surfaced rather than swallowed so the cause
 * is obvious.
 */
@Injectable()
export class GoogleDriveClient {
  private readonly logger = new Logger(GoogleDriveClient.name);
  private cached: drive_v3.Drive | null = null;

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(this.config.get<string>('GOOGLE_SERVICE_ACCOUNT_JSON'));
  }

  drive(): drive_v3.Drive {
    if (this.cached) return this.cached;

    const encoded = this.config.getOrThrow<string>(
      'GOOGLE_SERVICE_ACCOUNT_JSON',
    );
    // Accept either base64 or raw JSON — base64 survives .env files intact.
    const raw = encoded.trim().startsWith('{')
      ? encoded
      : Buffer.from(encoded, 'base64').toString('utf-8');
    const credentials = JSON.parse(raw) as {
      client_email: string;
      private_key: string;
    };

    const subject = this.config.get<string>('GOOGLE_WORKSPACE_SUBJECT');
    const scopes = ['https://www.googleapis.com/auth/drive'];

    const auth = subject
      ? new google.auth.JWT({
          email: credentials.client_email,
          key: credentials.private_key,
          scopes,
          subject,
        })
      : new google.auth.GoogleAuth({ credentials, scopes });

    if (!subject) {
      this.logger.warn(
        'GOOGLE_WORKSPACE_SUBJECT is unset — uploads may fail with a storage quota error. ' +
          'Set it to a Workspace user with domain-wide delegation granted.',
      );
    }

    this.cached = google.drive({ version: 'v3', auth: auth });
    return this.cached;
  }

  /** Optional folder to keep uploads out of the impersonated user's root. */
  folderId(): string | undefined {
    return this.config.get<string>('GOOGLE_DRIVE_FOLDER_ID') || undefined;
  }
}
