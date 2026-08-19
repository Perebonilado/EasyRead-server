/**
 * Seeds a new account's library with the starter document (onboarding).
 *
 * The starter is a canonical, already-simplified walkthrough document named
 * by STARTER_DOCUMENT_ID. Copying is a pure snapshot: rows and stored files
 * are duplicated under new ids, so a reader deleting their copy (and the
 * purge job that later removes its files) can never touch the canonical
 * document or anyone else's copy.
 */
export interface StarterLibraryPort {
  /** No-op when STARTER_DOCUMENT_ID is unset or the document is missing. */
  copyToUser(userId: string): Promise<void>;
}
