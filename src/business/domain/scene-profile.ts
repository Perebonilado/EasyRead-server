/**
 * What a document is, for teaching it as videos: its subject, what kind
 * of book it is, its tone, and the ways its pages may be taught besides
 * the explainer every page can have. Made once a document, from its title,
 * its chapters and a sample of its pages, and kept beside its videos.
 */
import { SCENE_FORMATS, type SceneFormat } from './scene-script';

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
}

/** What the model answers: the formats besides the explainer. */
export interface DocumentProfileDraft {
  subject: string;
  kind: ProfileKind;
  tone: ProfileTone;
  formats: ('maths' | 'reading')[];
}

/** A document nothing is known about yet: the explainer, as every page has had. */
export const DEFAULT_PROFILE: DocumentProfile = {
  subject: '',
  kind: 'other',
  tone: 'neutral',
  formats: ['explainer'],
};

/** A draft made sound: known values only, and the explainer always first. */
export function profileOf(
  draft: Partial<DocumentProfileDraft> | null | undefined,
): DocumentProfile {
  if (!draft) return DEFAULT_PROFILE;
  const formats = new Set<SceneFormat>(['explainer']);
  for (const format of draft.formats ?? [])
    if (SCENE_FORMATS.includes(format)) formats.add(format);
  return {
    subject: (draft.subject ?? '').replace(/\s+/g, ' ').trim().slice(0, 80),
    kind: PROFILE_KINDS.includes(draft.kind as ProfileKind)
      ? (draft.kind as ProfileKind)
      : 'other',
    tone: PROFILE_TONES.includes(draft.tone as ProfileTone)
      ? (draft.tone as ProfileTone)
      : 'neutral',
    formats: SCENE_FORMATS.filter((format) => formats.has(format)),
  };
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
  return `${book ? `This book: ${book}. ` : ''}Formats you may use on its pages: ${profile.formats.join(', ')}.`;
}

/** Where a document's profile is kept: beside its videos, one for each content version. */
export const profileKey = (documentId: string, contentVersion: number) =>
  `documents/${documentId}/visuals/v${contentVersion}/profile.json`;
