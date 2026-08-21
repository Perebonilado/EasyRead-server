/** What Google attests about the person who just pressed the button. */
export interface GoogleProfile {
  /** Google's stable subject id — the durable key, emails can change. */
  googleId: string;
  email: string;
  /** Google's own word that it delivered mail to this address. */
  emailVerified: boolean;
  name: string;
}

/**
 * Verifies a Google ID token (the `credential` the Sign in with Google
 * button hands the browser) and returns the identity inside it. Throws
 * for anything not signed by Google for THIS app.
 */
export interface GoogleIdentityPort {
  verify(credential: string): Promise<GoogleProfile>;
}
