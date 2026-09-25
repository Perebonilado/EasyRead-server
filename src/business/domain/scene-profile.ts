/**
 * What a document is, for teaching it as videos: its subject, what kind
 * of book it is, its tone, and the ways its pages may be taught besides
 * the explainer every page can have. Made once a document, from its title,
 * its chapters and a sample of its pages, and kept beside its videos.
 */
import { SCENE_FORMATS, type SceneFormat } from './scene-script';
import {
  LEARNING_STAGES,
  STAGE_NAMES,
  STAGE_SURENESS,
  type LearningStage,
  type StageSureness,
} from './scene-stage';

export const PROFILE_KINDS = [
  'textbook',
  'fiction',
  'poetry',
  'drama',
  'nonfiction',
  'reference',
  'other',
] as const;
export type ProfileKind = (typeof PROFILE_KINDS)[number];

export const PROFILE_TONES = ['light', 'neutral', 'serious'] as const;
export type ProfileTone = (typeof PROFILE_TONES)[number];

export interface DocumentProfile {
  /** A few words: "biology", "algebra", "English literature: poetry". */
  subject: string;
  kind: ProfileKind;
  tone: ProfileTone;
  /** The explainer always, and whichever others suit the book. */
  formats: SceneFormat[];
  /** Whether it tells a story whose characters come back page after page. */
  story: boolean;
  /**
   * Whom it is for: read from the document itself. Null when it could not
   * be told, and its pages are taught as they always were; absent on a
   * profile made before stages, which is read once more.
   */
  stage?: LearningStage | null;
  /** The words that told its stage, for the record. */
  stageWhy?: string;
}

/** What the model answers: the formats besides the explainer. */
export interface DocumentProfileDraft {
  subject: string;
  kind: ProfileKind;
  tone: ProfileTone;
  formats: ('maths' | 'reading')[];
  story?: boolean;
  stage?: LearningStage | null;
  stageSure?: StageSureness;
  stageWhy?: string;
}

/** A document nothing is known about yet: the explainer, as every page has had. */
export const DEFAULT_PROFILE: DocumentProfile = {
  subject: '',
  kind: 'other',
  tone: 'neutral',
  formats: ['explainer'],
  story: false,
};

/** A draft made sound: known values only, and the explainer always first. */
export function profileOf(
  draft: Partial<DocumentProfileDraft> | null | undefined,
): DocumentProfile {
  if (!draft) return DEFAULT_PROFILE;
  const formats = new Set<SceneFormat>(['explainer']);
  for (const format of draft.formats ?? [])
    if (SCENE_FORMATS.includes(format)) formats.add(format);
  const kind = PROFILE_KINDS.includes(draft.kind as ProfileKind)
    ? (draft.kind as ProfileKind)
    : 'other';
  return {
    subject: (draft.subject ?? '').replace(/\s+/g, ' ').trim().slice(0, 80),
    kind,
    tone: PROFILE_TONES.includes(draft.tone as ProfileTone)
      ? (draft.tone as ProfileTone)
      : 'neutral',
    formats: SCENE_FORMATS.filter((format) => formats.has(format)),
    // A profile kept before stories were asked about: a novel or a play is one.
    story:
      typeof draft.story === 'boolean'
        ? draft.story
        : kind === 'fiction' || kind === 'drama',
    // A stage the reader was unsure of is no stage; one kept before stages
    // were asked about stays absent, so it is asked.
    ...('stage' in draft
      ? {
          stage:
            LEARNING_STAGES.includes(draft.stage as LearningStage) &&
            draft.stageSure !== 'unsure'
              ? draft.stage
              : null,
          stageWhy: (draft.stageWhy ?? '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 200),
        }
      : {}),
  };
}

/** How sure the reader said it was, made sound: an unknown answer is unsure. */
export function surenessOf(value: unknown): StageSureness {
  return STAGE_SURENESS.includes(value as StageSureness)
    ? (value as StageSureness)
    : 'unsure';
}

/** The profile as the writer is told it: one line. */
export function describeProfile(profile: DocumentProfile): string {
  const book = [
    profile.subject,
    profile.kind !== 'other' ? profile.kind : null,
    profile.tone !== 'neutral' ? `${profile.tone} in tone` : null,
  ]
    .filter(Boolean)
    .join(', ');
  const reader = profile.stage
    ? ` It is for ${STAGE_NAMES[profile.stage]}.`
    : '';
  return `${book ? `This book: ${book}.` : ''}${reader} Formats you may use on its pages: ${profile.formats.join(', ')}${profile.formats.includes('maths') ? '' : ', and working ("math") on a page that works a calculation'}.`.trim();
}

/** Where a document's profile is kept: beside its videos, one for each content version. */
export const profileKey = (documentId: string, contentVersion: number) =>
  `documents/${documentId}/visuals/v${contentVersion}/profile.json`;
