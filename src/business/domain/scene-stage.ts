/**
 * Whom a document is for, and how its pages are taught to them. The stage
 * is read from the document itself, once, with its profile: the level it
 * names, the exams it prepares for, how it is written and how deep its
 * subject goes. Each stage has a recipe, owned here rather than left to a
 * model's imagination: how long a sentence and a page are, how many new
 * terms a page brings, how it explains, what goes on the stage, and how
 * fast the voice goes.
 *
 * Simple at every stage: plain words first, then the exact term, one idea
 * at a time, a picture for every idea. What changes is depth and density,
 * never clarity, and nothing an exam or a practice needs is dropped.
 */

export const LEARNING_STAGES = [
  'early',
  'middle',
  'higher',
  'professional',
] as const;
export type LearningStage = (typeof LEARNING_STAGES)[number];

/** How sure the reader of a document is of its stage. */
export const STAGE_SURENESS = ['sure', 'likely', 'unsure'] as const;
export type StageSureness = (typeof STAGE_SURENESS)[number];

/** A stage as a learner or a teacher would say it. */
export const STAGE_NAMES: Record<LearningStage, string> = {
  early: 'primary school',
  middle: 'secondary school',
  higher: 'college and university',
  professional: 'professional practice',
};

export interface StageRecipe {
  /** Who the learner is, as the writer is told. */
  reader: string;
  /** Words a sentence: fewest and most. */
  sentence: [number, number];
  /** Spoken words a page: fewest and most. */
  spoken: [number, number];
  /** New terms a page, at most. */
  terms: number;
  /** Labels on one drawing, at most. */
  labels: number;
  /** The voice's pace against its usual, and its pauses against theirs. */
  pace: number;
  pause: number;
  /** How to explain. */
  explain: string;
  /** How to check understanding along the way. */
  checks: string;
  /** What goes on the stage. */
  pictures: string;
  /** The page's feeling and how lively it moves. */
  tone: string;
}

export const STAGE_RECIPES: Record<LearningStage, StageRecipe> = {
  early: {
    reader:
      'The learner is a child at primary school, six to eleven, who finds reading hard.',
    sentence: [4, 12],
    spoken: [80, 150],
    terms: 2,
    labels: 2,
    pace: 0.9,
    pause: 1.3,
    explain:
      'Tell it as a little story or an everyday scene a child knows (home, school, play, food, animals), with a friendly guide character when it helps. One idea at a time, said simply, then said again another way. Name a new word only with a picture of it.',
    checks:
      'Once or twice, ask the child a simple question and leave a long pause for them to answer ("Can you spot the leaf?").',
    pictures:
      'Characters and big, simple drawings of things a child can recognise, with at most two labels on a drawing. Bright, warm and playful. A sum the page works goes on the stage as working ("math"), one operation a line: code draws its numbers under it as blocks, bars, rows of dots or a shaded bar, so draw no counters of your own for it.',
    tone: 'playful and bright, lively motion',
  },
  middle: {
    reader:
      'The learner is at secondary school, eleven to eighteen, and finds reading hard.',
    sentence: [6, 16],
    spoken: [150, 250],
    terms: 3,
    labels: 3,
    pace: 0.95,
    pause: 1.1,
    explain:
      'Start from an everyday example the learner knows, then give the idea, then the proper term with what it means. Show why it happens, step by step. Keep the words the exam uses.',
    checks:
      'Once, invite the learner to think before the answer comes ("Think: what would happen if…?").',
    pictures:
      'Characters where people are part of the idea, and clear diagrams, with at most three labels on a drawing.',
    tone: 'lively and clear',
  },
  higher: {
    reader:
      'The learner is at college or university and finds reading hard: they need the full idea, made easy to follow.',
    sentence: [8, 20],
    spoken: [180, 300],
    terms: 5,
    labels: 5,
    pace: 1,
    pause: 1,
    explain:
      'Plain words first, then the precise term and its exact meaning, then the mechanism or the reasoning, then why it matters. Keep every term, number and distinction the course and its exams use; never water down the content, only the way it is said.',
    checks: 'End with a one-line recap of the key term or result.',
    pictures:
      'Diagrams, charts, working, graphs and timelines; people only where people are part of the idea. At most five labels on a drawing.',
    tone: 'calm and focused',
  },
  professional: {
    reader:
      'The learner is a professional or a trainee in practice, who finds dense reading hard: they need the rule and how it is applied.',
    sentence: [8, 20],
    spoken: [180, 300],
    terms: 5,
    labels: 5,
    pace: 1,
    pause: 1,
    explain:
      'State the rule or principle plainly, then its exact terms, then walk through a worked case or a step in practice. Keep the precise words of the law, standard or procedure.',
    checks: 'End with one practical tip or the point to remember.',
    pictures:
      'Process flows, documents and forms, and the people involved shown as their roles. At most five labels on a drawing.',
    tone: 'calm and plain',
  },
};

/** What the writer is told of the learner and how to teach them: nothing, when the stage is not known. */
export function describeStage(stage: LearningStage | null): string {
  if (!stage) return '';
  const r = STAGE_RECIPES[stage];
  return [
    `Who the learner is: ${r.reader}`,
    `Sentences of ${r.sentence[0]} to ${r.sentence[1]} words; ${r.spoken[0]} to ${r.spoken[1]} spoken words in all, fewer for a short page.`,
    `At most ${r.terms} new terms on the page.`,
    `How to explain: ${r.explain}`,
    `Checks: ${r.checks}`,
    `On the stage: ${r.pictures}`,
    `Mood: ${r.tone}.`,
  ].join(' ');
}

/** A level named in so many words: a class, a year, a university level, a practice note. One is enough. */
const NAMED: [RegExp, LearningStage][] = [
  [/\b(?:primary|basic)\s*(?:one|two|three|four|five|six|[1-6])\b/i, 'early'],
  [/\b(?:nursery|kindergarten|reception class)\b/i, 'early'],
  [/\b(?:key stage|KS)\s*[12]\b/i, 'early'],
  [/\bcommon entrance\b/i, 'early'],
  [/\bJ\.?\s?S\.?\s?S\.?\s*(?:one|two|three|[1-3])\b/i, 'middle'],
  [/\bS\.?\s?S\.?\s?S?\.?\s*(?:one|two|three|[1-3])\b/, 'middle'],
  [/\b(?:junior|senior) secondary\b/i, 'middle'],
  [/\bbasic\s*(?:seven|eight|nine|[7-9])\b/i, 'middle'],
  [/\b(?:key stage|KS)\s*[34]\b/i, 'middle'],
  [/\b[1-7]00\s*level\b/i, 'higher'],
  [/\bcourse code\b/i, 'higher'],
  [/\bcredit units?\b/i, 'higher'],
  [/\b(?:under|post)graduate\b/i, 'higher'],
  [/\bpractice (?:note|direction|guide)s?\b/i, 'professional'],
  [/\bcontinuing professional development\b/i, 'professional'],
  [
    /\b(?:Nigerian Law School|Bar Part [IV]+|Bar finals?|call to (?:the )?bar)\b/i,
    'professional',
  ],
];

/**
 * Signs of a level that need company: an exam, a kind of school, a
 * course's words, a grade or a year (a tumour has grades too). Two are
 * enough.
 */
const HINTED: [RegExp, LearningStage][] = [
  [/\bgrade\s*[1-5]\b/i, 'early'],
  [/\b(?:grade|class)\s*(?:[6-9]|1[0-2])\b/i, 'middle'],
  [/\byear\s*(?:[7-9]|1[0-3])\b/i, 'middle'],
  [/\bCPD\b/, 'professional'],
  [/\b(?:secondary school|high school|middle school)\b/i, 'middle'],
  [
    /\b(?:WAEC|WASSCE|NECO|SSCE|BECE|GCSEs?|IGCSE|A-?levels?|KCSE|JAMB|UTME)\b/,
    'middle',
  ],
  [/\bprimary school\b/i, 'early'],
  [/\blecture notes?\b/i, 'higher'],
  [/\blecturer\b/i, 'higher'],
  [/\bfaculty of\b/i, 'higher'],
  [/\bdepartment of\b/i, 'higher'],
  [/\bsemester\b/i, 'higher'],
  [/\b(?:university|polytechnic|college of education)\b/i, 'higher'],
  [/\b(?:ICAN|ACCA|CIMA|CFA|CIBN|ICSAN)\b/, 'professional'],
  [/\bprofessional (?:exam|examination|practice)\b/i, 'professional'],
  [/\bpractitioners?\b/i, 'professional'],
];

/**
 * The level a document names in its own words, if it names one clearly: a
 * class or a year ("Primary 4", "JSS 2", "SS 3", "Year 9"), a university
 * level ("100 Level"), a practice note; or two signs of the same stage (an
 * exam and the kind of school, "lecture notes" and "semester"). The words
 * that told it, for the record. Null when it names none, or several
 * stages as strongly.
 */
export function levelIn(
  text: string,
): { stage: LearningStage; words: string[] } | null {
  const score = new Map<LearningStage, { n: number; words: Set<string> }>();
  const count = (list: [RegExp, LearningStage][], weight: number) => {
    for (const [pattern, stage] of list) {
      const m = pattern.exec(text);
      if (!m) continue;
      const one = score.get(stage) ?? { n: 0, words: new Set<string>() };
      one.n += weight;
      one.words.add(m[0].trim());
      score.set(stage, one);
    }
  };
  count(NAMED, 2);
  count(HINTED, 1);
  const ranked = [...score.entries()]
    .filter(([, one]) => one.n >= 2)
    .sort((a, b) => b[1].n - a[1].n);
  if (!ranked.length) return null;
  if (ranked[1] && ranked[1][1].n === ranked[0][1].n) return null;
  return { stage: ranked[0][0], words: [...ranked[0][1].words] };
}

/**
 * A document's stage: the level its own words name wins over a reader who
 * says otherwise; else the reader's, when it is at least likely; else
 * none, and the page is taught as it always has been.
 */
export function settleStage(
  read: { stage: LearningStage | null; sure: StageSureness; why: string },
  named: { stage: LearningStage; words: string[] } | null,
): { stage: LearningStage | null; why: string } {
  if (named && named.stage !== read.stage)
    return {
      stage: named.stage,
      why: `it says ${named.words.map((w) => `"${w}"`).join(', ')}`,
    };
  if (read.stage && read.sure !== 'unsure')
    return { stage: read.stage, why: read.why };
  if (named)
    return {
      stage: named.stage,
      why: `it says ${named.words.map((w) => `"${w}"`).join(', ')}`,
    };
  return { stage: null, why: read.why };
}
