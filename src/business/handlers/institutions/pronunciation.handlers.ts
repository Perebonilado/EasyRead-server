import { Inject, Injectable, Logger } from '@nestjs/common';
import { spokenForm } from '../../domain/spoken';
import { LECTURE_SPEECH, LLM_GATEWAY } from '../../ports/tokens';
import type { LlmGatewayPort } from '../../ports/llm.port';
import type { SpeechPort } from '../../ports/voice.port';
import {
  DOCUMENT_PAGE_REPOSITORY,
  INSTITUTION_REPOSITORY,
  PRONUNCIATION_REPOSITORY,
} from '../../repositories/tokens';
import type { DocumentPageRepository } from '../../repositories/document-page.repository';
import type { InstitutionRepository } from '../../repositories/institution.repository';
import type {
  PronunciationRecord,
  PronunciationRepository,
  PronunciationStatus,
} from '../../repositories/pronunciation.repository';
import { NotFoundError, ValidationError } from '../../domain/errors/errors';

/** How many terms one document may propose; the densest deck has fewer. */
const MAX_TERMS = 40;

/** English words the Latin patterns would otherwise take for a genus or an epithet. */
const ENGLISH = new Set([
  'blood',
  'animal',
  'animals',
  'human',
  'humans',
  'african',
  'american',
  'european',
  'asian',
  'clinical',
  'central',
  'nervous',
  'visceral',
  'diffuse',
  'cutaneous',
  'chronic',
  'acute',
  'general',
  'special',
  'virus',
  'fungus',
  'genus',
  'status',
  'campus',
  'focus',
  'bonus',
  'census',
  'consensus',
  'minus',
  'plus',
  'versus',
  'medium',
  'maximum',
  'minimum',
  'optimum',
  'premium',
  'forum',
  'album',
  'museum',
  'stadium',
  'curriculum',
  'spectrum',
  'serum',
  'sodium',
  'calcium',
  'potassium',
  'magnesium',
  'these',
  'those',
  'whose',
  'course',
  'nurse',
  'house',
  'cause',
  'because',
  'dense',
  'sense',
  'tense',
  'immense',
  'intense',
  'expense',
  'defense',
  'offense',
  'response',
  'license',
  'suspense',
  'data',
  'strata',
  'formula',
]);

/**
 * The words a voice is likely to say wrongly, found in a document's pages
 * without a model: Latin binomials, long words with the suffixes of the
 * sciences, and eponyms. Abbreviations are not here; the spoken-form
 * rules spell those without help.
 */
export function hardTerms(pages: string[]): string[] {
  const seen = new Map<string, string>();
  const keep = (term: string) => {
    const key = term.toLowerCase();
    if (!seen.has(key)) seen.set(key, term);
  };
  const text = pages.join('\n');
  // A binomial: a capitalised genus and a lower-case Latin epithet. The
  // epithet's ending is what tells Latin from English, and a handful of
  // English words that end the same way are named so they are not asked.
  for (const m of text.matchAll(
    /\b([A-Z][a-z]{3,})\s+([a-z]{4,}(?:ae|us|um|ense|iense|ii|ei|ica|osa|ata))\b/g,
  )) {
    if (ENGLISH.has(m[1].toLowerCase()) || ENGLISH.has(m[2].toLowerCase())) {
      continue;
    }
    keep(m[1]);
    keep(m[2]);
  }
  // A word of the sciences: long, with a telling ending.
  for (const m of text.matchAll(
    /\b[A-Za-z][a-z]{7,}(?:iasis|osis|itis|emia|aemia|ium|ine|ase|ole|zole|cillin|mycin|pine|pam|lol|olol|pril|sartan|statin|azine|idine|ceptor|genic|pathy|ectomy|otomy|plasty|scopy|ology)\b/g,
  )) {
    keep(m[0]);
  }
  return [...seen.values()].slice(0, MAX_TERMS);
}

/**
 * Seeds a school's pronunciation list from a document: hard terms found
 * in its pages, respelled by the model, filed as proposals for an admin
 * to hear. Terms the school already has an entry for are not asked again.
 */
@Injectable()
export class PronunciationSeeder {
  private readonly logger = new Logger(PronunciationSeeder.name);

  constructor(
    @Inject(PRONUNCIATION_REPOSITORY)
    private readonly pronunciations: PronunciationRepository,
    @Inject(DOCUMENT_PAGE_REPOSITORY)
    private readonly pages: DocumentPageRepository,
    @Inject(INSTITUTION_REPOSITORY)
    private readonly institutions: InstitutionRepository,
    @Inject(LLM_GATEWAY) private readonly llm: LlmGatewayPort,
  ) {}

  async seed(doc: {
    id: string;
    props: { institutionId: string | null; departmentId?: string | null };
  }): Promise<void> {
    const institutionId = doc.props.institutionId;
    if (!institutionId) return;
    try {
      const pages = await this.pages.findRange(doc.id, 1, 10_000);
      const known = await this.pronunciations.list(institutionId);
      const have = new Set(known.map((entry) => entry.term));
      const terms = hardTerms(pages.map((page) => page.text)).filter(
        (term) => !have.has(term.toLowerCase()),
      );
      if (!terms.length) return;
      const subject = await this.subjectOf(
        institutionId,
        doc.props.departmentId ?? null,
      );
      const { value } = await this.llm.pronunciations({ subject, terms });
      const proposed = await this.pronunciations.propose(
        institutionId,
        doc.id,
        value.filter(
          (entry) =>
            entry.spoken.trim().split(/\s+/).length ===
            entry.term.trim().split(/\s+/).length,
        ),
      );
      this.logger.log(
        `${doc.id}: ${proposed} pronunciation${proposed === 1 ? '' : 's'} proposed`,
      );
    } catch (error) {
      // A missing proposal costs nothing the lecture needs; the admin can add by hand.
      this.logger.warn(
        `${doc.id}: pronunciations not proposed: ${(error as Error).message}`,
      );
    }
  }

  private async subjectOf(
    institutionId: string,
    departmentId: string | null,
  ): Promise<string> {
    try {
      const departments =
        await this.institutions.listDepartments(institutionId);
      const department = departments.find((d) => d.id === departmentId);
      return department?.name ?? 'the sciences';
    } catch {
      return 'the sciences';
    }
  }
}

/** The list, the admin's edits, and a hearing of one entry on the rented voice. */
@Injectable()
export class PronunciationHandlers {
  constructor(
    @Inject(PRONUNCIATION_REPOSITORY)
    private readonly pronunciations: PronunciationRepository,
    @Inject(LECTURE_SPEECH) private readonly speech: SpeechPort,
  ) {}

  list(institutionId: string): Promise<PronunciationRecord[]> {
    return this.pronunciations.list(institutionId);
  }

  add(
    institutionId: string,
    term: string,
    spoken: string,
  ): Promise<PronunciationRecord> {
    assertOneForOne(term, spoken);
    return this.pronunciations.add(institutionId, term, spoken);
  }

  async update(
    institutionId: string,
    id: string,
    patch: { spoken?: string; status?: PronunciationStatus },
  ): Promise<PronunciationRecord> {
    if (patch.spoken !== undefined) {
      const current = (await this.pronunciations.list(institutionId)).find(
        (entry) => entry.id === id,
      );
      if (!current) throw new NotFoundError('Pronunciation');
      assertOneForOne(current.term, patch.spoken);
    }
    const updated = await this.pronunciations.update(institutionId, id, patch);
    if (!updated) throw new NotFoundError('Pronunciation');
    return updated;
  }

  /** The term said alone by the same voice the lectures use, as the spoken text would carry it. */
  async hear(
    institutionId: string,
    id: string,
    spokenOverride?: string,
  ): Promise<{ audio: Buffer; mimeType: string }> {
    const entry = (await this.pronunciations.list(institutionId)).find(
      (candidate) => candidate.id === id,
    );
    if (!entry) throw new NotFoundError('Pronunciation');
    const spoken = spokenOverride?.trim() || entry.spoken;
    assertOneForOne(entry.term, spoken);
    const text = spokenForm(
      `${entry.term}.`,
      new Map([[entry.term, spoken]]),
    ).text;
    const said = await this.speech.synthesize({ text });
    return { audio: said.audio, mimeType: said.mimeType };
  }
}

/** An entry replaces a written word with as many spoken words as the term has, so the follow-along's map stays exact. */
function assertOneForOne(term: string, spoken: string): void {
  const written = term.trim().split(/\s+/).length;
  const said = spoken.trim().split(/\s+/).length;
  if (!spoken.trim()) throw new ValidationError('Say how it is pronounced');
  if (written !== said) {
    throw new ValidationError(
      `"${term}" is ${written} word${written === 1 ? '' : 's'}; its pronunciation must be too`,
    );
  }
}
