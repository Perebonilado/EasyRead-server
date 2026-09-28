/**
 * The face a line is said with, read from its own words when the writer
 * gave none: "one of you will betray me" is said sadly, "Surely not I?"
 * with fear, "Rejoice!" gladly, a plain question thoughtfully. A face
 * that fits what is said, changing as the feeling does, so no one says a
 * grave thing smiling or a glad thing blank.
 */
import type { FigureFace } from './scene-figure';

/** Words that say how a line is said, most telling first. */
const FEELINGS: { face: FigureFace; words: RegExp }[] = [
  {
    face: 'afraid',
    words:
      /\b(?:afraid|fear(?:ful)?|scared|terrified|help me|save (?:me|us)|surely not|have mercy|run|hide)\b/iu,
  },
  {
    face: 'angry',
    words:
      /\b(?:how dare|shame on|hypocrites?|get (?:away|out|behind)|enough|you fools?|brood of vipers|woe to you)\b/iu,
  },
  {
    face: 'sad',
    words:
      /\b(?:betray(?:s|ed)?|woe|die|dies|died|death|dead|grieve[ds]?|grief|sorrow(?:ful)?|weep(?:ing)?|cry(?:ing)?|lost|blood|poured out|strike|scattered|fall away|deny|denied|sorry|alone|goodbye|farewell|forsaken)\b/iu,
  },
  {
    face: 'happy',
    words:
      /\b(?:rejoice|joy(?:ful)?|glad|love|wonderful|thank(?:s| you)?|welcome|good news|well done|hooray|yes!|blessed are|delight(?:ed)?|happy)\b/iu,
  },
  {
    face: 'surprised',
    words:
      /\b(?:what\?|really\?|how can (?:this|it) be|who is this|look!|oh!|wow)/iu,
  },
];

/** The face a line's words are said with; null when they do not tell. */
export function faceOfLine(say: string): FigureFace | null {
  for (const { face, words } of FEELINGS) if (words.test(say)) return face;
  // A question that tells no feeling is asked thinking.
  if (/\?\s*$/u.test(say.trim())) return 'thinking';
  return null;
}

/** The kit's own face for a feeling the writer names in other words: "serious" is sad, "worried" afraid. */
const NEAREST: Record<string, FigureFace> = {
  serious: 'sad',
  solemn: 'sad',
  grave: 'sad',
  sorrowful: 'sad',
  upset: 'sad',
  hurt: 'pain',
  worried: 'afraid',
  anxious: 'afraid',
  nervous: 'afraid',
  scared: 'afraid',
  fearful: 'afraid',
  shocked: 'surprised',
  amazed: 'surprised',
  astonished: 'surprised',
  joyful: 'happy',
  pleased: 'happy',
  glad: 'happy',
  warm: 'happy',
  kind: 'happy',
  gentle: 'happy',
  furious: 'angry',
  annoyed: 'angry',
  stern: 'angry',
  curious: 'thinking',
  puzzled: 'thinking',
  confused: 'thinking',
  doubtful: 'thinking',
  calm: 'neutral',
  // Still, the eyes shut and calm: never gory.
  'eyes closed': 'eyes closed',
  'closed eyes': 'eyes closed',
  'eyes shut': 'eyes closed',
  unconscious: 'eyes closed',
  'knocked out': 'eyes closed',
  fainted: 'eyes closed',
  resting: 'eyes closed',
  praying: 'eyes closed',
};

/** A feeling the writer named, as one of the kit's faces; null when it is none. */
export function faceNamed(state: string | null | undefined): FigureFace | null {
  const word = (state ?? '').trim().toLowerCase();
  return NEAREST[word] ?? null;
}

/**
 * Words that say someone's eyes are shut and calm, as the face "eyes
 * closed" shows them: knocked out, fainted, out cold, lying still,
 * pretending to sleep, felled. Never Zs: asleep is the sign "sleeping".
 */
const EYES_CLOSED_WORDS =
  /\b(?:eyes? (?:(?:are|is|were|was|now|still|tightly|gently) )*(?:closed|shut)|(?:clos|shut)(?:es|ed|ing|s)? (?:his|her|their|its|my|your|both) eyes|closed eyes|knocked (?:out|senseless|unconscious)|unconscious|faint(?:s|ed|ing)|(?:passes|passed|passing) out|out cold|(?:lies|lay|laid|lying) (?:quite |very |perfectly )?still|pretend(?:s|ed|ing)? to (?:sleep|be asleep|be dead)|play(?:s|ed|ing)? dead|(?:falls?|fell|lies|lay|lying|drops?|dropped) (?:down )?dead|(?:as if|like) (?:he|she|they|it) (?:is|was|were) dead|lifeless)\b/iu;

/** Whether words say someone's eyes are shut and calm: the face "eyes closed". */
export function eyesClosedIn(say: string): boolean {
  return EYES_CLOSED_WORDS.test(say);
}
