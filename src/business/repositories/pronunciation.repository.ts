import type { Pronunciations } from '../domain/spoken';

export type PronunciationStatus = 'proposed' | 'kept' | 'dropped';

export interface PronunciationRecord {
  id: string;
  institutionId: string;
  documentId: string | null;
  term: string;
  spoken: string;
  status: PronunciationStatus;
  source: 'seeded' | 'admin';
  updatedAt: Date;
}

/**
 * A school's pronunciations. The kept ones are what the voice is handed;
 * the proposed ones wait for an admin to hear them.
 */
export interface PronunciationRepository {
  list(institutionId: string): Promise<PronunciationRecord[]>;
  /** The kept entries as the spoken-form rules read them: written word, lower-cased, to spoken. */
  kept(institutionId: string): Promise<Pronunciations>;
  /** Proposals for terms the school has no entry for yet; known terms are left as they are. */
  propose(
    institutionId: string,
    documentId: string,
    proposals: { term: string; spoken: string }[],
  ): Promise<number>;
  /** An entry typed by an admin, kept at once; replaces any entry for the term. */
  add(
    institutionId: string,
    term: string,
    spoken: string,
  ): Promise<PronunciationRecord>;
  update(
    institutionId: string,
    id: string,
    patch: { spoken?: string; status?: PronunciationStatus },
  ): Promise<PronunciationRecord | null>;
}
