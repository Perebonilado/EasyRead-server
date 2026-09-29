/**
 * Story development (studio-story-plan §1.1–1.4, S2): a writers' room in
 * steps before any scene is written. A premise (what it is about, who
 * wants what and what stands in the way); the characters with personality
 * (a want, a need, a flaw, a fear, specific traits, a way of speaking,
 * habits, relationships, an arc); a beat sheet shaped by the film's
 * length, each beat with who wants what, what stops them, what changes,
 * and a planned intensity from 0 to 10; and a scene plan, each scene's
 * purpose, conflict, turn, emotional shift and the moment people will
 * remember. The outline is built from the scene plan by code, in the
 * shape it always had, so everything after it works unchanged.
 *
 * Everything is made sound from whatever a model sent, and code checks
 * each step: the structure for the length, the shape of the tension
 * curve, a turn in every scene, setups that pay off and payoffs that were
 * set up, and personality that is specific rather than stock.
 */
import {
  STUDIO_ENDINGS,
  STUDIO_GENRES,
  SCENE_SECONDS,
  text,
  type OutlineScene,
  type StudioBible,
  type StudioBrief,
  type StudioCharacter,
  type StudioEnding,
  type StudioGenre,
  type StudioOutline,
} from './studio';

// ── The premise ───────────────────────────────────────────────────────────

/** Tools the writer is asked to use to build tension (§1.3). */
export const TENSION_TOOLS = [
  'ticking clock',
  'rising stakes',
  'dramatic irony',
  'false victory',
  'cliffhanger',
  'it gets worse',
] as const;

export interface Premise {
  /** A few words. */
  title: string;
  /** Who, what they want, what stands in the way, and the stakes. */
  logline: string;
  /** What it is really about, one line, never said as a moral unless asked. */
  theme: string;
  /** The first ten seconds. */
  hook: string;
  genre: StudioGenre;
  ending: StudioEnding;
  /** What is at risk. */
  stakes: string;
  /** The tension tools it uses, in its own words. */
  tools: string[];
  /** A comedy's running gag; a mystery's clues. Absent, none. */
  gag?: string;
  clues?: string[];
}

const oneOf =
  <T extends string>(list: readonly T[]) =>
  (value: unknown): T | null =>
    typeof value === 'string' && list.includes(value as T)
      ? (value as T)
      : null;

const words = (value: unknown, most: number, each = 160): string[] =>
  (Array.isArray(value) ? value : [])
    .map((one) => text(one, each))
    .filter(Boolean)
    .slice(0, most);

/** A premise made sound; the brief's genre and ending where the writer's are none. */
export function premiseOf(
  raw: unknown,
  brief: Pick<StudioBrief, 'genre' | 'ending'> = {},
): Premise {
  const said =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const gag = text(said.gag, 200);
  const clues = words(said.clues, 5);
  return {
    title: text(said.title, 80) || 'Untitled',
    logline: text(said.logline, 300),
    theme: text(said.theme, 200),
    hook: text(said.hook, 300),
    genre: brief.genre ?? oneOf(STUDIO_GENRES)(said.genre) ?? 'comedy',
    ending: brief.ending ?? oneOf(STUDIO_ENDINGS)(said.ending) ?? 'happy',
    stakes: text(said.stakes, 200),
    tools: words(said.tools, 6, 120),
    ...(gag ? { gag } : {}),
    ...(clues.length ? { clues } : {}),
  };
}

/** What a premise lacks, each a problem for the writer. */
export function checkPremise(premise: Premise): string[] {
  const out: string[] = [];
  if (premise.logline.split(/\s+/).length < 8)
    out.push(
      'Give a logline: who, what they want, what stands in the way, and what is at stake.',
    );
  if (!premise.stakes) out.push('Say what is at stake.');
  if (!premise.hook)
    out.push('Say the hook: what grabs us in the first ten seconds.');
  if (!premise.tools.length)
    out.push(
      'Name the tension tools it uses (a ticking clock, rising stakes, dramatic irony, a false victory, a cliffhanger, "it gets worse").',
    );
  if (premise.genre === 'comedy' && !premise.gag)
    out.push('A comedy has a running gag: say it.');
  if (premise.genre === 'mystery' && !premise.clues?.length)
    out.push('A mystery has a clue plan: list its clues.');
  return out;
}

// ── The characters ────────────────────────────────────────────────────────

/** Who someone is to another, and the tension between them. */
export interface Relationship {
  /** The other's id. */
  with: string;
  /** What they are to each other: rivals, best friends, bossy big sister. */
  is: string;
  /** What pulls between them. */
  tension: string;
}

/**
 * A character's personality (§1.2), kept in the bible so every episode
 * keeps it: what they want and need, their flaw and fear, three to five
 * specific traits, how they speak, what they do with their body, whom
 * they are what to, and where they start and end.
 */
export interface Persona {
  want: string;
  need: string;
  flaw: string;
  fear: string;
  personality: string[];
  /** How they talk: sentence length, pet phrases, words they would never say, humour. */
  voice: string;
  /** What their body does: fidgets with a cap, bounces when excited. */
  habits: string[];
  relationships: Relationship[];
  /** Where they start and where they end. */
  arc: { from: string; to: string };
}

/** A persona made sound; null for one with nothing in it. */
export function personaOf(raw: unknown): Persona | null {
  if (!raw || typeof raw !== 'object') return null;
  const said = raw as Record<string, unknown>;
  const arc =
    said.arc && typeof said.arc === 'object'
      ? (said.arc as Record<string, unknown>)
      : {};
  const persona: Persona = {
    want: text(said.want, 160),
    need: text(said.need, 160),
    flaw: text(said.flaw, 160),
    fear: text(said.fear, 160),
    personality: words(said.personality, 5, 60),
    voice: text(said.voice, 240),
    habits: words(said.habits, 4, 80),
    relationships: (Array.isArray(said.relationships) ? said.relationships : [])
      .flatMap((one: unknown): Relationship[] => {
        if (!one || typeof one !== 'object') return [];
        const r = one as Record<string, unknown>;
        const withId = text(r.with, 40).toLowerCase();
        return withId
          ? [
              {
                with: withId,
                is: text(r.is, 80),
                tension: text(r.tension, 160),
              },
            ]
          : [];
      })
      .slice(0, 6),
    arc: { from: text(arc.from, 160), to: text(arc.to, 160) },
  };
  const any =
    persona.want ||
    persona.need ||
    persona.flaw ||
    persona.personality.length ||
    persona.voice;
  return any ? persona : null;
}

/** Each character's persona as the writer sent them, by id. */
export function personasOf(
  raw: unknown,
  bible: Pick<StudioBible, 'characters'>,
): Map<string, Persona> {
  const said =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const out = new Map<string, Persona>();
  for (const one of Array.isArray(said.characters) ? said.characters : []) {
    if (!one || typeof one !== 'object') continue;
    const c = one as Record<string, unknown>;
    const id = text(c.id, 40).toLowerCase();
    const known = bible.characters.find(
      (x) => x.id === id || x.name.toLowerCase() === id,
    );
    const persona = personaOf(c);
    if (known && persona) out.set(known.id, persona);
  }
  return out;
}

/**
 * The bible with each character's persona, their looks and everything
 * else kept as they were; a relationship only with someone of the cast.
 */
export function withPersonas(
  bible: StudioBible,
  personas: ReadonlyMap<string, Persona>,
): StudioBible {
  const ids = new Set(bible.characters.map((c) => c.id));
  return {
    ...bible,
    characters: bible.characters.map((c): StudioCharacter => {
      const persona = personas.get(c.id);
      if (!persona) return c;
      return {
        ...c,
        persona: {
          ...persona,
          relationships: persona.relationships.filter(
            (r) => ids.has(r.with) && r.with !== c.id,
          ),
        },
      };
    }),
  };
}

/**
 * Who everyone was, kept: a cast written or changed again (a new look, a
 * new character) keeps each one's persona where the change gave none.
 */
export function keptPersonas(
  bible: StudioBible,
  before: StudioBible | null,
): StudioBible {
  if (!before) return bible;
  const had = new Map(
    before.characters.flatMap((c) =>
      c.persona ? [[c.id, c.persona] as const] : [],
    ),
  );
  if (!had.size) return bible;
  return {
    ...bible,
    characters: bible.characters.map((c) =>
      c.persona || !had.has(c.id) ? c : { ...c, persona: had.get(c.id)! },
    ),
  };
}

/** Traits any character could have: said instead of something specific. */
const GENERIC =
  /^(?:(?:very|really|so|quite) )?(?:kind|brave|nice|good|funny|happy|sad|smart|clever|curious|friendly|caring|loving|cute|cool|fun|sweet|gentle|strong|helpful|shy|silly|naughty|bad|mean|lazy|quiet|loud|bold|wise|honest|loyal|playful|cheerful|creative|adventurous|energetic)$/iu;

/** Whether a trait is stock: "kind", "brave". */
export const isGenericTrait = (trait: string): boolean =>
  GENERIC.test(trait.trim().replace(/[.!]+$/u, ''));

/** What the characters' sheets lack, each a problem for the writer. */
export function checkPersonas(
  bible: Pick<StudioBible, 'characters'>,
  personas: ReadonlyMap<string, Persona>,
): string[] {
  const out: string[] = [];
  for (const c of bible.characters) {
    if (c.role === 'minor') continue;
    const p = personas.get(c.id);
    if (!p) {
      out.push(
        `Give ${c.name} a full sheet: want, need, flaw, fear, personality, voice, habits, relationships, arc.`,
      );
      continue;
    }
    const generic = p.personality.filter(isGenericTrait);
    if (generic.length)
      out.push(
        `${c.name}'s traits ${generic.map((t) => `"${t}"`).join(', ')} are stock: say something specific to them ("counts everything", "hums when nervous").`,
      );
    if (c.role === 'main' && (!p.want || !p.flaw))
      out.push(
        `${c.name} is a main character: say what they want and their flaw.`,
      );
    if (p.personality.length < 2)
      out.push(`Give ${c.name} three to five specific traits.`);
    if (!p.voice) out.push(`Say how ${c.name} talks.`);
  }
  return out;
}

// ── The beat sheet ────────────────────────────────────────────────────────

/** What a beat does in the story's shape. */
export const BEAT_ROLES = [
  'setup',
  'inciting',
  'problem',
  'attempt',
  'relief',
  'turn',
  'low',
  'climax',
  'twist',
  'resolution',
  'payoff',
  'button',
] as const;
export type BeatRole = (typeof BEAT_ROLES)[number];

/** The structure a film's length gets (§1.3). */
export type StoryTemplate = 'short' | 'medium' | 'long';

/** The template for a length in minutes: a minute or less, one to two, two to five. */
export const templateFor = (minutes: number | null): StoryTemplate =>
  (minutes ?? 1) <= 1 ? 'short' : (minutes ?? 1) <= 2 ? 'medium' : 'long';

/** Each template's beats, as the writer is asked for them, and how many it may have. */
export const TEMPLATES: Record<
  StoryTemplate,
  { beats: string; least: number; most: number }
> = {
  short: {
    beats:
      'setup, problem, attempt, twist, payoff: five beats (one scene or two)',
    least: 4,
    most: 6,
  },
  medium: {
    beats:
      'setup and inciting incident, the first try fails (attempt), it gets worse (attempt), a relief beat between them, the turn (a choice), the climax, the resolution and a button (a last laugh or warm beat)',
    least: 6,
    most: 9,
  },
  long: {
    beats:
      "setup, inciting incident, rising action with two or three escalating attempts and a relief beat between, a midpoint turn, the low point, the climax decided by the hero's own choice, the resolution and a button",
    least: 8,
    most: 13,
  },
};

export interface StoryBeat {
  role: BeatRole;
  /** What happens, in a sentence. */
  what: string;
  /** Who wants what here. */
  wants: string;
  /** What stops them. */
  stops: string;
  /** What changes by its end. */
  changes: string;
  /** The planned tension, 0 to 10. */
  intensity: number;
  /** What is planted here, to pay off later, each with an id its payoff names. */
  plants: Plant[];
  /** What pays off here, planted before: the plants' ids. */
  pays: string[];
}

/** A thing planted to pay off later: a slippery banana, a secret, a skill. */
export interface Plant {
  /** Short and stable: "spare-key". What pays it off names it. */
  id: string;
  /** In a few words. */
  what: string;
}

/** An id from words: "Bea's magnifier" is "bea-s-magnifier". */
export const slugOf = (said: string): string =>
  said
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 40);

/** A beat's plants made sound: each with an id, from its words where none was given; older ones were words only. */
function plantsOf(raw: unknown): Plant[] {
  const out: Plant[] = [];
  for (const one of (Array.isArray(raw) ? raw : []).slice(0, 4)) {
    const said =
      typeof one === 'string'
        ? { what: one }
        : one && typeof one === 'object'
          ? (one as Record<string, unknown>)
          : null;
    if (!said) continue;
    const what = text(said.what, 60) || text(said.id, 60);
    const id = slugOf(text(said.id, 40) || what);
    if (id && !out.some((p) => p.id === id)) out.push({ id, what: what || id });
  }
  return out;
}

export interface BeatSheet {
  template: StoryTemplate;
  beats: StoryBeat[];
}

/** A beat sheet made sound, for its template. */
export function beatSheetOf(raw: unknown, template: StoryTemplate): BeatSheet {
  const said =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const beats = (Array.isArray(said.beats) ? said.beats : [])
    .slice(0, 16)
    .flatMap((one: unknown): StoryBeat[] => {
      if (!one || typeof one !== 'object') return [];
      const b = one as Record<string, unknown>;
      const what = text(b.what, 300);
      if (!what) return [];
      const n = Number(b.intensity);
      return [
        {
          role: oneOf(BEAT_ROLES)(b.role) ?? 'attempt',
          what,
          wants: text(b.wants, 200),
          stops: text(b.stops, 200),
          changes: text(b.changes, 200),
          intensity: Number.isFinite(n)
            ? Math.max(0, Math.min(10, Math.round(n)))
            : 5,
          plants: plantsOf(b.plants),
          pays: words(b.pays, 4, 60),
        },
      ];
    });
  return { template, beats };
}

const firstOf = (beats: readonly StoryBeat[], ...roles: BeatRole[]) =>
  beats.findIndex((b) => roles.includes(b.role));
const lastOf = (beats: readonly StoryBeat[], ...roles: BeatRole[]) => {
  for (let k = beats.length - 1; k >= 0; k -= 1)
    if (roles.includes(beats[k].role)) return k;
  return -1;
};

/**
 * Where the story peaks: its climax; a short film with none peaks at its
 * twist or its payoff, whichever is higher (in a minute, the payoff is
 * often the biggest moment, and the twist just before it).
 */
export function peakOf(sheet: BeatSheet): number {
  const climax = lastOf(sheet.beats, 'climax');
  if (climax >= 0) return climax;
  if (sheet.template !== 'short') return -1;
  let best = -1;
  sheet.beats.forEach((b, k) => {
    if (
      (b.role === 'twist' || b.role === 'payoff') &&
      (best < 0 || b.intensity > sheet.beats[best].intensity)
    )
      best = k;
  });
  return best;
}

/** The beat sheet's structure against its template: the beats it must have, in order. */
export function checkStructure(sheet: BeatSheet): string[] {
  const out: string[] = [];
  const { beats, template } = sheet;
  const shape = TEMPLATES[template];
  if (beats.length < shape.least || beats.length > shape.most)
    out.push(
      `A film this long has ${shape.least} to ${shape.most} beats (${shape.beats}); this has ${beats.length}.`,
    );
  if (!beats.length) return out;
  if (beats[0].role !== 'setup')
    out.push('Open with a setup beat: who, where, what they want.');
  const attempts = beats.filter((b) => b.role === 'attempt').length;
  const has = (...roles: BeatRole[]) => firstOf(beats, ...roles) >= 0;
  if (template === 'short') {
    if (!has('problem', 'inciting')) out.push('Give it a problem beat.');
    if (!attempts) out.push('Give it an attempt beat.');
    if (!has('twist', 'turn', 'climax')) out.push('Give it a twist.');
    if (
      !['payoff', 'resolution', 'button'].includes(beats[beats.length - 1].role)
    )
      out.push('End on the payoff.');
  } else {
    if (!has('inciting', 'problem')) out.push('Give it an inciting incident.');
    const least = template === 'long' ? 2 : 1;
    if (attempts < least)
      out.push(
        `Give it ${least === 2 ? 'two or three escalating attempts' : 'an attempt that fails'} before the climax.`,
      );
    if (!has('turn'))
      out.push('Give it a turn: a choice that changes the direction.');
    if (template === 'long' && !has('low'))
      out.push('Give it a low point before the climax.');
    if (!has('climax'))
      out.push("Give it a climax, decided by the hero's own choice.");
    if (!has('resolution', 'payoff')) out.push('Give it a resolution.');
    const climax = lastOf(beats, 'climax');
    const turn = firstOf(beats, 'turn');
    const low = lastOf(beats, 'low');
    if (climax >= 0 && turn > climax)
      out.push('The turn comes before the climax.');
    if (climax >= 0 && low > climax)
      out.push('The low point comes before the climax.');
  }
  return out;
}

/**
 * The tension curve's shape (§1.3): it starts lower and rises; with room
 * for it, a dip for relief between the rising beats; the low point
 * before the climax; the climax its peak, nothing before it as high and
 * nothing after it higher; and after it, it falls into the resolution. A
 * flat curve, or one that peaks too early or too late, goes back, each
 * message naming the beats it is about.
 */
export function checkCurve(sheet: BeatSheet): string[] {
  const out: string[] = [];
  const { beats } = sheet;
  if (beats.length < 3) return out;
  const at = beats.map((b) => b.intensity);
  const curve = at.join(', ');
  const peak = peakOf(sheet);
  const top = Math.max(...at);
  if (top - Math.min(...at) < 4)
    out.push(
      `The tension is flat (${curve}): start lower, rise with each attempt, peak at the climax.`,
    );
  if (peak < 0) return out;
  const named = (k: number) => `beat ${k + 1} (${beats[k].role}, ${at[k]})`;
  const it = beats[peak].role;
  const early = at.slice(0, peak).findIndex((n) => n >= at[peak]);
  if (early >= 0)
    out.push(
      `The tension peaks too early (${curve}): ${named(early)} is as high as the ${it}, ${named(peak)}. Keep every beat before the ${it} lower than it.`,
    );
  const late = at.findIndex((n, k) => k > peak && n > at[peak]);
  if (late >= 0)
    out.push(
      `The tension peaks after the ${it} (${curve}): ${named(late)} is higher than the ${it}, ${named(peak)}. The ${it} is the highest; after it, it falls.`,
    );
  if (at[0] >= at[peak] - 3)
    out.push(
      `The tension starts too high (${curve}): begin calmer, so it has somewhere to go.`,
    );
  if (sheet.template !== 'short') {
    // Between the inciting incident and the climax: a dip for relief.
    const from = Math.max(0, firstOf(beats, 'inciting', 'problem'));
    const rising = at.slice(from, peak);
    const dips = rising.some((n, k) => k > 0 && n < rising[k - 1]);
    if (!dips)
      out.push(
        `Put a relief beat (a joke, a warm moment) between the rising beats (${curve}): a dip in the tension before it climbs again.`,
      );
    // It rises: the stretch before the climax higher than the start.
    const half = Math.ceil(rising.length / 2);
    const first = rising.slice(0, half);
    const second = rising.slice(half);
    if (
      second.length &&
      Math.max(...second) <= Math.max(...first) &&
      rising.length >= 3
    )
      out.push(
        `The tension does not rise before the ${it} (${curve}): each attempt harder, or costing more.`,
      );
    // The low point before the climax: the moment it cannot get worse.
    const low = lastOf(beats, 'low', 'turn');
    if (low < 0 || low > peak)
      out.push('Put the low point (or the turn) just before the climax.');
  }
  // After the peak, it falls.
  const after = at.slice(peak + 1);
  if (late < 0 && after.length && after[after.length - 1] > at[peak] - 3)
    out.push(
      `After the ${it}, let the tension fall into the resolution (${curve}): end at ${Math.max(0, at[peak] - 3)} or lower.`,
    );
  return out;
}

/** A thing planted or paid off, as compared. */
const thingKey = (thing: string) =>
  thing
    .toLowerCase()
    .replace(/^(?:the|a|an|his|her|their)\s+/u, '')
    .replace(/[^\p{L}\p{N} ]+/gu, '')
    .trim();

// ── Words alike ───────────────────────────────────────────────────────────

/** Words that say nothing of what a thing is. */
const STOP = new Set(
  (
    'a an the and or but of to in on at for with by from into onto over under up out off ' +
    'his her their its our my your they them he she we you i me him us it this that these those ' +
    'is are was were be been being has have had do does did not no so as than then very just ' +
    'all some one any who what when where how which there here now again too also only still ' +
    'about after before'
  ).split(' '),
);

/**
 * A word's stem, lightly, for comparing: "counting", "counts" and
 * "counted" are "count"; "hummed" is "hum"; "whispers" is "whisper".
 */
export function stemOf(word: string): string {
  let w = word.toLowerCase().replace(/['’]s$/u, '');
  const cut = (end: string, keep = '') => {
    if (w.length > end.length + 2 && w.endsWith(end)) {
      w = w.slice(0, -end.length) + keep;
      return true;
    }
    return false;
  };
  if (
    cut('ies', 'y') ||
    (/(?:x|ch|sh|ss)es$/u.test(w) && cut('es')) ||
    cut('ing') ||
    cut('ed') ||
    cut('ly') ||
    (!w.endsWith('ss') && cut('s'))
  ) {
    // "runn" is "run", "humm" is "hum"; "roll" and "miss" stay.
    if (/([b-df-hj-np-tv-z])\1$/u.test(w) && !/(?:ll|ss|zz|ff)$/u.test(w))
      w = w.slice(0, -1);
  }
  return w;
}

/** A text's words that say what it is about, stemmed: never its little words, nor the names given. */
export function stemsOf(
  said: string,
  names: ReadonlySet<string> = new Set(),
): string[] {
  return [
    ...new Set(
      said
        .toLowerCase()
        .replace(/['’]s\b/gu, '')
        .split(/[^\p{L}\p{N}]+/u)
        .filter((w) => w.length > 1 && !STOP.has(w))
        .map(stemOf)
        .filter((w) => w && !names.has(w)),
    ),
  ];
}

/** Two stems alike: the same, or one the start of the other ("team", "teamwork"). */
const alike = (a: string, b: string) =>
  a === b ||
  (Math.min(a.length, b.length) >= 4 && (a.startsWith(b) || b.startsWith(a)));

/** How much of `a` is in `b`: the share of its stems found there, 0 to 1. */
export function covered(a: readonly string[], b: readonly string[]): number {
  if (!a.length) return 0;
  return a.filter((x) => b.some((y) => alike(x, y))).length / a.length;
}

// ── Setups and payoffs ────────────────────────────────────────────────────

/**
 * What the story already carries through every beat: the characters'
 * habits, traits and ways of speaking, and a comedy's running gag. These
 * run; they need no payoff. And the characters' names, which say nothing
 * of what a thing is ("Pip's soft please" is a soft please).
 */
export interface StoryContext {
  traits?: readonly string[];
  names?: readonly string[];
}

/** The context of a cast and a premise: everyone's traits, habits and voice, the running gag, and their names. */
export function contextOf(
  bible: Pick<StudioBible, 'characters'>,
  premise?: Pick<Premise, 'gag'> | null,
): StoryContext {
  return {
    traits: [
      ...bible.characters.flatMap((c) => [
        ...c.traits,
        ...(c.persona
          ? [...c.persona.personality, ...c.persona.habits, c.persona.voice]
          : []),
      ]),
      ...(premise?.gag ? [premise.gag] : []),
    ],
    names: bible.characters.flatMap((c) => [c.id, c.name]),
  };
}

/** How alike a thing's words are to another's, either way round, 0 to 1. */
const likeness = (a: readonly string[], b: readonly string[]) =>
  Math.max(covered(a, b), covered(b, a));

/** A plant as tracked through the beats: where it is planted, where it pays off, and whether it simply runs. */
export interface TrackedPlant {
  plant: Plant;
  /** The beat it is planted in, from 0. */
  at: number;
  /** Its words, stemmed, names left out. */
  stems: string[];
  /** Its id's words alone, stemmed: the short name the writers use for it ("bell" for Momo's red collar bell). */
  idStems: string[];
  /** The beats that name it in their pays, from 0. */
  paid: number[];
  /** The later beats whose own words carry it out, though their pays do not name it. */
  shown: number[];
  /** A character's habit or the running gag: carried through, needing no payoff. */
  running: boolean;
}

/**
 * Setups and payoffs, tracked (§1.3). A payoff names its plant's id; one
 * that names none (an older sheet, or a slip) is matched by its words,
 * stems and all, so "pips soft please" is paid by "whispers please help".
 * A plant a later beat's own words carry out is shown there; a payoff an
 * earlier beat's words set up was planted. A character's habit or a
 * running gag is carried through the story, never a plant to pay off.
 */
export function trackSetups(
  sheet: BeatSheet,
  context: StoryContext = {},
): {
  plants: TrackedPlant[];
  /** Payoffs of what was never planted, by what they said and their beat. */
  unplanted: { said: string; at: number }[];
} {
  const names = new Set((context.names ?? []).flatMap((n) => stemsOf(n)));
  const stems = (said: string) => stemsOf(said, names);
  const traits = (context.traits ?? []).map(stems);
  /** A habit or a gag, carried through: it needs no payoff. */
  const running = (said: string) => {
    const s = stems(said);
    // All of a short one's words, two of three of a longer one's: a
    // "wind-up star" is not the habit of tucking a star under a scarf.
    return s.length > 0 && traits.some((t) => covered(s, t) >= 0.66);
  };
  const beatWords = sheet.beats.map((b) => stems(`${b.what} ${b.changes}`));
  const plants: TrackedPlant[] = [];
  sheet.beats.forEach((beat, k) => {
    for (const plant of beat.plants)
      if (!plants.some((p) => p.plant.id === plant.id)) {
        const s = stems(`${plant.what} ${plant.id.replace(/-/gu, ' ')}`);
        plants.push({
          plant,
          at: k,
          stems: s,
          idStems: stems(plant.id.replace(/-/gu, ' ')),
          paid: [],
          shown: s.length
            ? beatWords
                .map((w, j) => (j > k && covered(s, w) >= 0.5 ? j : -1))
                .filter((j) => j >= 0)
            : [],
          running: running(plant.what),
        });
      }
  });
  const unplanted: { said: string; at: number }[] = [];
  sheet.beats.forEach((beat, k) => {
    for (const said of beat.pays) {
      const found = plantNamed(said, plants, stems);
      if (found) {
        found.paid.push(k);
        continue;
      }
      if (running(said)) continue;
      // Set up in an earlier beat's own words, though not listed as a plant.
      const s = stems(said);
      if (s.length && beatWords.slice(0, k).some((w) => covered(s, w) >= 0.5))
        continue;
      unplanted.push({ said, at: k });
    }
  });
  return { plants, unplanted };
}

/** The plant a payoff names: by its id, else the most like it in words (half its words at least). */
function plantNamed(
  said: string,
  plants: TrackedPlant[],
  stems: (said: string) => string[],
): TrackedPlant | null {
  const id = slugOf(said);
  const exact = plants.find((p) => p.plant.id === id);
  if (exact) return exact;
  const s = stems(said);
  let best: TrackedPlant | null = null;
  let score = 0;
  for (const p of plants) {
    const like = likeness(s, p.stems);
    if (like >= 0.5 && like > score) {
      best = p;
      score = like;
    }
  }
  return best;
}

/** Setups and payoffs (§1.3): everything planted pays off later; everything paid off was planted before. */
export function checkSetups(
  sheet: BeatSheet,
  context: StoryContext = {},
): string[] {
  const out: string[] = [];
  const { plants, unplanted } = trackSetups(sheet, context);
  for (const { said, at } of unplanted)
    out.push(
      `"${said}" pays off in beat ${at + 1} but was never planted: plant it in an earlier beat (with an id its payoff names), or pay off something that was.`,
    );
  const real = plants.filter((p) => !p.running);
  for (const { plant, at, paid, shown } of real) {
    if (paid.some((k) => k > at) || shown.length) continue;
    out.push(
      paid.length
        ? `"${plant.what}" (${plant.id}) pays off in beat ${paid[0] + 1}, no later than it is planted (beat ${at + 1}): pay it off in a later beat.`
        : `"${plant.what}" (${plant.id}) is planted in beat ${at + 1} but never pays off: pay it off in a later beat, naming "${plant.id}" in its pays, or leave it out.`,
    );
  }
  if (sheet.template !== 'short' && !real.length)
    out.push(
      'Plant something early (a skill, a secret, a thing) that pays off later.',
    );
  return out;
}

/** Everything code sees wrong in a beat sheet. */
export const checkBeats = (
  sheet: BeatSheet,
  context: StoryContext = {},
): string[] => [
  ...checkStructure(sheet),
  ...checkCurve(sheet),
  ...checkSetups(sheet, context),
];

// ── The scene plan ────────────────────────────────────────────────────────

export interface PlannedScene {
  title: string;
  /** Which beats it serves, from 0. */
  beats: number[];
  /** What it is for in the story. */
  purpose: string;
  /** Who wants what against whom or what. */
  conflict: string;
  /** How the situation is different at its end. */
  turn: string;
  /** Hope to fear, calm to panic. */
  shift: string;
  /** The one image or line people will remember. */
  moment: string;
  /** Where, who, how long: as the outline has them. */
  set: string | null;
  cast: string[];
  seconds: number;
  /** What happens, in a sentence or two, naming who does what. */
  summary: string;
}

export interface ScenePlan {
  scenes: PlannedScene[];
}

/** A scene plan made sound. */
export function scenePlanOf(raw: unknown): ScenePlan {
  const said =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    scenes: (Array.isArray(said.scenes) ? said.scenes : [])
      .slice(0, 12)
      .flatMap((one: unknown): PlannedScene[] => {
        if (!one || typeof one !== 'object') return [];
        const s = one as Record<string, unknown>;
        const summary = text(s.summary, 500);
        const title = text(s.title, 80);
        if (!summary && !title) return [];
        const seconds = Number(s.seconds);
        return [
          {
            title: title || summary.split(/[.!?]/)[0].slice(0, 60),
            beats: (Array.isArray(s.beats) ? s.beats : [])
              .map((n) => Math.round(Number(n)))
              .filter((n) => Number.isFinite(n) && n >= 0)
              .slice(0, 6),
            purpose: text(s.purpose, 200),
            conflict: text(s.conflict, 200),
            turn: text(s.turn, 200),
            shift: text(s.shift, 120),
            moment: text(s.moment, 200),
            set: text(s.set, 40) || null,
            cast: words(s.cast, 6, 40),
            seconds: Number.isFinite(seconds)
              ? Math.round(
                  Math.min(
                    SCENE_SECONDS[1],
                    Math.max(SCENE_SECONDS[0], seconds),
                  ),
                )
              : 30,
            summary,
          },
        ];
      }),
  };
}

/** A turn that is no turn: nothing, or the same words as its conflict. */
const noTurn = (scene: PlannedScene) =>
  !scene.turn ||
  /^(?:none|nothing|n\/a|no change|same)\.?$/iu.test(scene.turn) ||
  thingKey(scene.turn) === thingKey(scene.conflict);

/** What the scene plan lacks: a turn in every scene, every beat served, a purpose and a conflict. */
export function checkPlan(plan: ScenePlan, sheet: BeatSheet): string[] {
  const out: string[] = [];
  plan.scenes.forEach((scene, k) => {
    if (noTurn(scene))
      out.push(
        `Scene ${k + 1} ("${scene.title}") has no turn: say how things are different at its end, or merge it with another.`,
      );
    if (!scene.conflict)
      out.push(
        `Scene ${k + 1} has no conflict: who wants what, against whom or what?`,
      );
    if (!scene.moment)
      out.push(`Scene ${k + 1}: name the moment people will remember.`);
  });
  const served = new Set(plan.scenes.flatMap((s) => s.beats));
  const missed = sheet.beats.map((_, k) => k).filter((k) => !served.has(k));
  if (missed.length && plan.scenes.length)
    out.push(
      `Beats ${missed.map((k) => k + 1).join(', ')} are in no scene: every beat is served by a scene.`,
    );
  return out;
}

/** The outline, built by code from the scene plan: the shape every step after it reads. */
export function outlineFromPlan(
  plan: ScenePlan,
  premise: Premise,
): StudioOutline {
  return {
    title: premise.title,
    logline: premise.logline,
    scenes: plan.scenes.map((scene): OutlineScene => ({
      title: scene.title,
      summary: scene.summary || `${scene.purpose} ${scene.turn}`.trim(),
      set: scene.set,
      cast: scene.cast,
      seconds: scene.seconds,
      teach: null,
      points: [],
    })),
  };
}

// ── The story, kept ───────────────────────────────────────────────────────

/** An episode's story as developed: kept inside its outline, so nothing new is stored apart. */
export interface StudioStory {
  premise: Premise;
  beats: BeatSheet;
  plan: ScenePlan;
}

/** A story as kept, made sound; null for none. */
export function storyOf(raw: unknown): StudioStory | null {
  if (!raw || typeof raw !== 'object') return null;
  const said = raw as Record<string, unknown>;
  const beats =
    said.beats && typeof said.beats === 'object'
      ? (said.beats as Record<string, unknown>)
      : {};
  const template =
    beats.template === 'short' || beats.template === 'long'
      ? beats.template
      : 'medium';
  const premise = premiseOf(said.premise);
  const sheet = beatSheetOf(beats, template);
  const plan = scenePlanOf(said.plan);
  if (!premise.logline && !sheet.beats.length && !plan.scenes.length)
    return null;
  return { premise, beats: sheet, plan };
}

// ── A change asked of the story ───────────────────────────────────────────

/** Words that ask for a change to the story itself, not to the scenes alone. */
const STORY_WORDS =
  /\b(?:story|plot|twist|ending|stakes|tension|suspense|villain|rival|hero|heroine|funnier|jokes?|gag|heart|sadder|happier|scarier|moral|lesson|theme|personality|motivation|arc|secret|flaw|fear|conflict|climax|genre|relationship|mystery|clue)\b/iu;
/** Words that ask only for the scenes: how many, their order, their length. */
const SCENE_WORDS =
  /\b(?:(?:add|cut|remove|drop|merge|split|move|swap|shorten|lengthen)\b[^.!?]*\bscenes?\b|scenes?\b[^.!?]*\b(?:shorter|longer|order|fewer|more)\b|(?:fewer|more) scenes)/iu;

/**
 * Whether a change asked of the outline is a change to the story itself
 * (the plot, who someone is, the ending), for when the producer did not
 * say: then the story is developed again with it, not the outline alone.
 */
export function isStoryChange(request: string | null | undefined): boolean {
  if (!request) return false;
  return STORY_WORDS.test(request) && !SCENE_WORDS.test(request);
}

// ── In words, for the writers ─────────────────────────────────────────────

/** A character's sheet in a few lines, for the writers. */
export function describePersona(
  c: Pick<StudioCharacter, 'name' | 'persona'>,
  names: ReadonlyMap<string, string> = new Map(),
): string {
  const p = c.persona;
  if (!p) return '';
  return [
    p.want ? `wants ${p.want}` : '',
    p.need ? `needs ${p.need}` : '',
    p.flaw ? `flaw: ${p.flaw}` : '',
    p.fear ? `fears ${p.fear}` : '',
    p.personality.length ? `is ${p.personality.join('; ')}` : '',
    p.voice ? `talks: ${p.voice}` : '',
    p.habits.length ? `habits: ${p.habits.join('; ')}` : '',
    ...p.relationships.map(
      (r) =>
        `to ${names.get(r.with) ?? r.with}: ${r.is}${r.tension ? ` (${r.tension})` : ''}`,
    ),
    p.arc.from || p.arc.to ? `arc: ${p.arc.from} → ${p.arc.to}` : '',
  ]
    .filter(Boolean)
    .join('. ');
}

/** The premise in words. */
export function describePremise(premise: Premise): string {
  return [
    `Title: ${premise.title}`,
    `Logline: ${premise.logline}`,
    premise.theme
      ? `Theme (never said as a moral unless asked): ${premise.theme}`
      : '',
    premise.hook ? `Hook: ${premise.hook}` : '',
    `Genre: ${premise.genre}. Ending: ${premise.ending}.`,
    premise.stakes ? `Stakes: ${premise.stakes}` : '',
    premise.tools.length ? `Tension tools: ${premise.tools.join('; ')}` : '',
    premise.gag ? `Running gag: ${premise.gag}` : '',
    premise.clues?.length ? `Clues: ${premise.clues.join('; ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/** The beat sheet in words: each beat's role, what happens, who wants what, and its intensity. */
export function describeBeats(sheet: BeatSheet): string {
  return sheet.beats
    .map(
      (b, k) =>
        `${k}. [${b.role}, intensity ${b.intensity}] ${b.what}${b.wants ? ` Wants: ${b.wants}.` : ''}${b.stops ? ` Stopped by: ${b.stops}.` : ''}${b.changes ? ` Changes: ${b.changes}.` : ''}${b.plants.length ? ` Plants: ${b.plants.map((p) => `${p.what} [${p.id}]`).join(', ')}.` : ''}${b.pays.length ? ` Pays off: ${b.pays.join(', ')}.` : ''}`,
    )
    .join('\n');
}

/** One scene's plan in words, for its writer (the start of S3). */
export function describePlannedScene(scene: PlannedScene): string {
  return [
    scene.purpose ? `Its purpose: ${scene.purpose}` : '',
    scene.conflict ? `Its conflict: ${scene.conflict}` : '',
    scene.turn
      ? `Its turn (how things are different at its end): ${scene.turn}`
      : '',
    scene.shift ? `Its feeling shifts: ${scene.shift}` : '',
    scene.moment ? `The moment to land: ${scene.moment}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * The beats one scene plays, for its writer (S3): what happens in each,
 * how tense it is, and what it plants and pays off, each payoff with
 * where it was planted; and the running gag, to come back.
 */
export function describeSceneBeats(
  story: StudioStory,
  scene: PlannedScene,
): string {
  const beats = scene.beats.filter(
    (k) => k >= 0 && k < story.beats.beats.length,
  );
  if (!beats.length)
    return story.premise.gag ? `The running gag: ${story.premise.gag}` : '';
  const planted = new Map<string, Plant>();
  for (const b of story.beats.beats)
    for (const p of b.plants) planted.set(p.id, p);
  const lines = beats.map((k) => {
    const b = story.beats.beats[k];
    const pays = b.pays.map((id) => planted.get(id)?.what ?? id);
    return `- ${b.role}, tension ${b.intensity} of 10: ${b.what}${b.plants.length ? ` Plant here, so it is seen or heard: ${b.plants.map((p) => p.what).join('; ')}.` : ''}${pays.length ? ` Pay off here, planted before: ${pays.join('; ')}.` : ''}`;
  });
  return [
    'The beats it plays:',
    ...lines,
    story.premise.gag
      ? `The running gag (bring it back where it fits): ${story.premise.gag}`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/** The whole story in words: what later steps and the outline's writer build on. */
export function describeStory(story: StudioStory): string {
  return [
    `The story, as developed:\n${describePremise(story.premise)}`,
    `The beats:\n${describeBeats(story.beats)}`,
  ].join('\n\n');
}
