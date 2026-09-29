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
  namesOf,
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
  /**
   * The parts a first-time viewer must get (studio-screenwriting P2–P8):
   * whose story it is, what they want, what is in the way and by when;
   * the hero's ordinary day, why the story starts today, and why we are
   * on their side; the one impossible thing and its rule; and the story
   * spine. Empty (or null) in a story developed before them.
   */
  /** The hero, by id: a main character. */
  hero: string;
  /** What the hero wants: a thing we will see them get or lose, never a feeling. */
  want: string;
  /** What is in the way. */
  obstacle: string;
  /** By when, and why that time; empty for no deadline. */
  clock: string;
  /** What an ordinary day is for the hero, before this one. */
  normalDay: string;
  /** Why the story starts today and not yesterday. */
  whyToday: string;
  /** Why the viewer is on the hero's side from the first moment. */
  whyCare: string;
  /** The one thing that could not happen in the real world, and its rule; null for none. */
  oddity: Oddity | null;
  /** The story in sentences: "Once upon a time", "Every day", "Until one day", "Because of that", "Until finally", "Ever since then". */
  spine: string[];
}

/** The one impossible thing in a story's world, and what it does and does not do. */
export interface Oddity {
  what: string;
  rule: string;
}

/** The story spine's openers, in order (Kenn Adams; Pixar rule 4): "Because of that" may come more than once. */
export const SPINE_OPENERS = [
  'Once upon a time',
  'Every day',
  'Until one day',
  'Because of that',
  'Until finally',
  'Ever since then',
] as const;

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
  const odd =
    said.oddity && typeof said.oddity === 'object'
      ? (said.oddity as Record<string, unknown>)
      : null;
  const oddWhat = odd ? text(odd.what, 200) : '';
  const clock = text(said.clock, 200);
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
    hero: text(said.hero, 40).toLowerCase(),
    want: text(said.want, 200),
    obstacle: text(said.obstacle, 200),
    clock: /^(?:none|null|no|n\/a|no deadline|no clock)\.?$/iu.test(clock)
      ? ''
      : clock,
    normalDay: text(said.normalDay, 200),
    whyToday: text(said.whyToday, 200),
    whyCare: text(said.whyCare, 200),
    oddity:
      oddWhat && !/^(?:none|null|nothing)\.?$/iu.test(oddWhat)
        ? { what: oddWhat, rule: text(odd?.rule, 200) }
        : null,
    spine: words(said.spine, 9, 240),
  };
}

/** Wants that are feelings, not things we can see got or lost (P3). */
const ABSTRACT = new Set(
  (
    'happiness happy respect love loved acceptance accepted accept success successful ' +
    'freedom free peace belonging belong confidence confident friendship friend friends ' +
    'approval recognition recognised recognized validation worth self esteem joy purpose meaning'
  )
    .split(' ')
    .map((w) => stemOf(w)),
);
/** Words around a feeling that say nothing of a thing: "to feel", "to finally be". */
const HOLLOW = new Set(
  'feel find get gain earn be become more true real finally some own sense'
    .split(' ')
    .map((w) => stemOf(w)),
);

/** Whether a want is only a feeling ("to be accepted", "respect"), never a thing we could see got or lost. */
export function isAbstractWant(want: string): boolean {
  const stems = stemsOf(want).filter((w) => !HOLLOW.has(w));
  return stems.length > 0 && stems.every((w) => ABSTRACT.has(w));
}

/** The spine's sentences against the openers, in order; what is wrong in words, or null. */
export function spineFault(spine: readonly string[]): string | null {
  if (!spine.length) return 'no spine';
  const opener = (line: string): number => {
    const l = line.trim().toLowerCase();
    if (/^once upon a time\b/u.test(l)) return 0;
    if (/^every ?day\b/u.test(l)) return 1;
    if (/^until one day\b/u.test(l)) return 2;
    if (/^because of (?:that|this)\b/u.test(l)) return 3;
    if (/^until finally\b/u.test(l)) return 4;
    if (/^ever since(?: then)?\b/u.test(l)) return 5;
    return -1;
  };
  const at = spine.map(opener);
  const bad = at.findIndex((n) => n < 0);
  if (bad >= 0)
    return `sentence ${bad + 1} ("${spine[bad]}") starts with none of the openers`;
  // Each opener once and in order; "Because of that" as often as needed.
  const want = [0, 1, 2, 3, 4, 5];
  const seen = at.filter((n, k) => !(n === 3 && at[k - 1] === 3));
  if (seen.length !== want.length || seen.some((n, k) => n !== want[k]))
    return `its openers run ${at.map((n) => `"${SPINE_OPENERS[n]}"`).join(', ')}, not in the order they go`;
  return null;
}

/** A logline with who must do what before or despite what (P1). */
const MUST =
  /\b(?:must|has to|have to|needs? to|wants? to|tries to|sets out to|scrambles to|races to)\b/iu;
const AGAINST =
  /\b(?:before|but|despite|while|until|or|unless|though|when)\b/iu;

/**
 * What a premise lacks, each a problem for the writer. With the cast,
 * the premise's own parts too (studio-screenwriting P1–P8): the hero a
 * main character named in the logline, a want we can see, what is in
 * the way, the ordinary day and why today, why we care, the oddity's
 * rule, and the spine.
 */
export function checkPremise(
  premise: Premise,
  bible?: Pick<StudioBible, 'characters'> | null,
): string[] {
  const out: string[] = [];
  if (bible) out.push(...checkPremiseParts(premise, bible));
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

/** The premise's own parts (P1–P8), against the cast. */
function checkPremiseParts(
  premise: Premise,
  bible: Pick<StudioBible, 'characters'>,
): string[] {
  const out: string[] = [];
  const hero = bible.characters.find((c) => c.id === premise.hero);
  const mains = bible.characters.filter((c) => c.role === 'main');
  if (!premise.hero)
    out.push(
      `Say whose story it is: hero, the id of a main character (${mains.map((c) => `"${c.id}"`).join(', ') || 'one of the cast'}).`,
    );
  else if (!hero || hero.role !== 'main')
    out.push(
      `hero "${premise.hero}" is not a main character of the cast: give the id of the one whose story it is (${mains.map((c) => `"${c.id}"`).join(', ') || 'a main character'}).`,
    );
  // P1: the logline's shape.
  const count = premise.logline.split(/\s+/).filter(Boolean).length;
  if (premise.logline && hero) {
    const named = namesOf(hero).some((name) =>
      new RegExp(
        `\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
        'iu',
      ).test(premise.logline),
    );
    if (
      !named ||
      !MUST.test(premise.logline) ||
      !AGAINST.test(premise.logline) ||
      count > 40
    )
      out.push(
        `Write the logline as one sentence of 8 to 40 words: ${hero.name} must [a goal we can see achieved] before or despite [one obstacle], or [what they lose].`,
      );
  }
  // P2, P3: the want we can see, and what is in the way.
  if (!premise.want)
    out.push(
      'Say the want: a thing we will see the hero get or lose in one picture (the keys in hand, the kite in the air).',
    );
  else if (isAbstractWant(premise.want))
    out.push(
      `The want "${premise.want}" is a feeling: make it a thing we will see them get or lose in one picture (the keys in hand, the kite in the air), never a feeling (respect, happiness, to be accepted).`,
    );
  if (!premise.obstacle) out.push('Say the obstacle: what is in the way.');
  // P4: the ordinary day, and why today.
  if (!premise.normalDay)
    out.push(
      'Say normalDay: what an ordinary day is for the hero before this one, in one line.',
    );
  if (!premise.whyToday)
    out.push('Say whyToday: why the story starts today and not yesterday.');
  else if (
    premise.normalDay &&
    covered(stemsOf(premise.whyToday), stemsOf(premise.normalDay)) > 0.5
  )
    out.push(
      `whyToday ("${premise.whyToday}") only says the ordinary day again: say what is different today.`,
    );
  // P5: one impossible thing, with its rule.
  if (premise.oddity && !premise.oddity.rule)
    out.push(
      `Give the oddity ("${premise.oddity.what}") its rule: what it does and does not do, in one line.`,
    );
  // P6: the spine.
  const spine = spineFault(premise.spine);
  if (spine)
    out.push(
      `Write the spine as six sentences starting "Once upon a time", "Every day", "Until one day", "Because of that" (more than once if needed), "Until finally", "Ever since then": ${spine}.`,
    );
  // P8: why we care.
  if (!premise.whyCare)
    out.push(
      "Say whyCare: in one line, why the viewer is on the hero's side from the first moment (something they do, a small kindness, a small unfairness done to them).",
    );
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

/**
 * The cast against the premise (C1, C2): the hero's want on their sheet is
 * the premise's want; and when what is in the way is one of the cast,
 * they want something too, and are something to the hero.
 */
export function checkCastForPremise(
  premise: Pick<Premise, 'hero' | 'want' | 'obstacle'>,
  bible: Pick<StudioBible, 'characters'>,
  personas: ReadonlyMap<string, Persona>,
): string[] {
  const out: string[] = [];
  const hero = bible.characters.find((c) => c.id === premise.hero);
  if (!hero || !premise.want) return out;
  const names = new Set(
    bible.characters.flatMap((c) => [c.id, ...stemsOf(c.name)]),
  );
  const mine = personas.get(hero.id);
  if (
    mine?.want &&
    Math.max(
      covered(stemsOf(mine.want, names), stemsOf(premise.want, names)),
      covered(stemsOf(premise.want, names), stemsOf(mine.want, names)),
    ) < 0.3
  )
    out.push(
      `${hero.name}'s want ("${mine.want}") is not the premise's want ("${premise.want}"): make it the same thing, in this story's words.`,
    );
  for (const c of bible.characters) {
    if (c.id === hero.id) continue;
    const named = namesOf(c).some((name) =>
      new RegExp(
        `\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
        'iu',
      ).test(premise.obstacle),
    );
    if (!named) continue;
    const p = personas.get(c.id);
    if (!p?.want)
      out.push(
        `${c.name} is what stands in ${hero.name}'s way: say what ${c.name} wants, so it clashes with ${hero.name}'s want.`,
      );
    if (!p?.relationships.some((r) => r.with === hero.id))
      out.push(
        `${c.name} is what stands in ${hero.name}'s way: say what they are to ${hero.name} (relationships), and the tension between them.`,
      );
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
  /** How it follows the beat before (B1): because of it, or against it; null for the first, and for a beat that only follows ("and then"). */
  link: StoryLink | null;
}

/** How a beat or a scene follows the one before: "therefore" (because of it) or "but" (something goes against it); never "and then". */
export const STORY_LINKS = ['therefore', 'but'] as const;
export type StoryLink = (typeof STORY_LINKS)[number];
/** A link as a writer said it: "Therefore", "but…" are theirs; "and then" is none. */
export const linkOf = (value: unknown): StoryLink | null => {
  const said =
    typeof value === 'string'
      ? value
          .trim()
          .toLowerCase()
          .replace(/[^a-z ]/gu, '')
      : '';
  return said === 'therefore' || said === 'so'
    ? 'therefore'
    : said === 'but'
      ? 'but'
      : null;
};

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
          link: linkOf(b.link),
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

/**
 * Therefore or but (B1, Parker and Stone): every beat after the first
 * follows the one before because of it, or against it. At least one
 * "but" before the climax, and no more than three "therefore" in a row.
 */
export function checkLinks(sheet: BeatSheet): string[] {
  const out: string[] = [];
  const { beats } = sheet;
  const none = beats
    .map((b, k) => (k > 0 && !b.link ? k : -1))
    .filter((k) => k > 0);
  if (none.length)
    out.push(
      `Beat${none.length > 1 ? 's' : ''} ${none.map((k) => k + 1).join(', ')} ${none.length > 1 ? 'have' : 'has'} no link: for every beat after the first, link is "therefore" (it happens because of the beat before) or "but" (something goes against it). Never "and then": if only "and then" fits, the beat is in the wrong place or not needed.`,
    );
  if (beats.length < 3 || none.length) return out;
  const peak = peakOf(sheet);
  const upTo = peak >= 0 ? peak : beats.length;
  if (!beats.slice(1, upTo + 1).some((b) => b.link === 'but'))
    out.push(
      'Every link before the climax is "therefore": put a "but" in, something that goes against the hero before the climax.',
    );
  let run = 0;
  for (let k = 1; k < beats.length; k += 1) {
    run = beats[k].link === 'therefore' ? run + 1 : 0;
    if (run === 4) {
      out.push(
        `Beats ${k - 2} to ${k + 1} are "therefore" four times in a row: let something go against the hero in one of them ("but").`,
      );
      break;
    }
  }
  return out;
}

/** Luck that gets the hero out of trouble (B4, Pixar rule 19). */
const LUCK =
  /\b(?:luckily|by (?:pure )?chance|suddenly|just then|happens? to|out of nowhere|a passer-?by|by luck|fortunately|coincidentally)\b/iu;

/**
 * The catalyst early (B2): the problem comes by the second beat (the
 * third in a long film); and no lucky escapes (B4): from the turn or the
 * low point on, nothing saves the hero by chance.
 */
export function checkCatalyst(sheet: BeatSheet): string[] {
  const out: string[] = [];
  const { beats } = sheet;
  if (!beats.length) return out;
  const first = firstOf(beats, 'inciting', 'problem');
  const most = sheet.template === 'long' ? 2 : 1;
  if (first > most)
    out.push(
      `The problem comes too late (beat ${first + 1}): in a short film the inciting incident comes at once, by beat ${most + 1}.`,
    );
  // What gets them out: the climax and after (a twist may get them in).
  beats.forEach((b, k) => {
    if (!['climax', 'resolution', 'payoff'].includes(b.role)) return;
    const m = LUCK.exec(`${b.what} ${b.changes}`);
    if (m)
      out.push(
        `Beat ${k + 1} (${b.role}) is saved by luck ("${m[0]}"): coincidences may get the hero into trouble, never out of it. Let what the hero does decide it.`,
      );
  });
  return out;
}

/**
 * Heighten the one game (B7): a comedy's running gag comes back in two
 * beats or more, pushed further each time.
 */
export function checkHeighten(
  sheet: BeatSheet,
  premise: Pick<Premise, 'genre' | 'gag'> | null,
  context: StoryContext = {},
): string[] {
  if (!premise?.gag) return [];
  if (premise.genre !== 'comedy' && premise.genre !== 'dark-comedy') return [];
  const names = new Set((context.names ?? []).flatMap((n) => stemsOf(n)));
  const gag = stemsOf(premise.gag, names);
  if (gag.length < 2) return [];
  const hits = sheet.beats.filter(
    (b) => covered(gag, stemsOf(`${b.what} ${b.changes}`, names)) >= 0.3,
  ).length;
  return hits >= 2
    ? []
    : [
        `The running gag ("${premise.gag}") shows in ${hits ? 'only one beat' : 'no beat'}: bring it back in at least two, pushed further each time (if this is true, what else is true?). No new absurd ideas.`,
      ];
}

/** Everything code sees wrong in a beat sheet. */
export const checkBeats = (
  sheet: BeatSheet,
  context: StoryContext = {},
  premise: Pick<Premise, 'genre' | 'gag'> | null = null,
): string[] => [
  ...checkStructure(sheet),
  ...checkCurve(sheet),
  ...checkSetups(sheet, context),
  ...checkLinks(sheet),
  ...checkCatalyst(sheet),
  ...checkHeighten(sheet, premise, context),
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
  /** Scene 1 (S1): how each part of the setup reaches the viewer, never by the narrator; empty elsewhere. */
  setup: SetupPiece[];
  /** What is at stake in it and its charge at the start and at the end (S2): it flips. Null in a plan made before. */
  value: SceneValue | null;
  /** Its first moment, already inside the trouble (S6); empty in a plan made before. */
  start: string;
  /** How it follows the scene before (S7): "therefore" or "but"; null for the first. */
  link: StoryLink | null;
}

/** The parts of the setup a first-time viewer must get in scene 1. */
export const SETUP_PARTS = [
  'want',
  'obstacle',
  'stakes',
  'clock',
  'oddity',
] as const;
export type SetupPart = (typeof SETUP_PARTS)[number];

/** How a part of the setup reaches the viewer: said (who to whom), done, or a thing on screen; "narration" is what it never is. */
export const SETUP_HOWS = ['line', 'action', 'thing'] as const;
export type SetupHow = (typeof SETUP_HOWS)[number] | 'narration';

/** One part of scene 1's setup and how the viewer learns it. */
export interface SetupPiece {
  part: SetupPart;
  how: SetupHow;
  /** Who says or does it, by id; empty for a thing. */
  by: string;
  /** Whom a line is said to, by id; empty otherwise. */
  to: string;
  /** The line's words, the action, or the thing on screen. */
  what: string;
}

/** What a scene turns on (McKee): "safe", "trusted", "home", positive or negative at its start and at its end. */
export interface SceneValue {
  name: string;
  from: '+' | '-';
  to: '+' | '-';
}

const chargeOf = (value: unknown): '+' | '-' | null => {
  const said = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (['+', 'positive', 'plus', 'up'].includes(said)) return '+';
  if (['-', '−', 'negative', 'minus', 'down'].includes(said)) return '-';
  return null;
};

/** A scene's setup as a writer sent it, made sound: each part once. */
function setupOf(raw: unknown): SetupPiece[] {
  const out: SetupPiece[] = [];
  for (const one of Array.isArray(raw) ? raw.slice(0, 8) : []) {
    if (!one || typeof one !== 'object') continue;
    const r = one as Record<string, unknown>;
    const part = oneOf(SETUP_PARTS)(
      typeof r.part === 'string' ? r.part.trim().toLowerCase() : r.part,
    );
    if (!part || out.some((p) => p.part === part)) continue;
    const said = typeof r.how === 'string' ? r.how.trim().toLowerCase() : '';
    const how: SetupHow = /narrat|voice-?over/u.test(said)
      ? 'narration'
      : (oneOf(SETUP_HOWS)(said) ?? 'line');
    out.push({
      part,
      how,
      by: text(r.by, 40).toLowerCase(),
      to: text(r.to, 40).toLowerCase(),
      what: text(r.what, 240),
    });
  }
  return out;
}

/** A scene's value made sound; null where it has no name or no charges. */
function valueOf(raw: unknown): SceneValue | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const name = text(r.name, 60);
  const from = chargeOf(r.from);
  const to = chargeOf(r.to);
  return name && from && to ? { name, from, to } : null;
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
            setup: setupOf(s.setup),
            value: valueOf(s.value),
            start: text(s.start, 240),
            link: linkOf(s.link),
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

/** A start that is an arrival or a hello, not the trouble (S6). */
const ARRIVING =
  /^(?:\p{L}+(?: and \p{L}+)? )?(?:arrives?|comes? in|walks? in|enters?|wakes?(?: up)?|says? hello|greets?|meets?|gets? home|comes? home)\b/iu;

/**
 * What the scene plan lacks: a turn in every scene, every beat served, a
 * purpose and a conflict. With the premise and the film's length, the
 * screenwriting rules too: scene 1 carries the setup, each part by a
 * line, an action or a thing, never the narrator (S1); every scene's
 * value flips (S2); scene 1 is long enough and not crowded (S3); no more
 * than two newcomers a scene (S4); every scene starts inside the trouble
 * (S6); and every scene after the first follows by "therefore" or "but" (S7).
 */
export function checkPlan(
  plan: ScenePlan,
  sheet: BeatSheet,
  opts: {
    premise?: Premise | null;
    minutes?: number | null;
    bible?: Pick<StudioBible, 'characters'> | null;
  } = {},
): string[] {
  const out: string[] = [];
  if (opts.premise) out.push(...checkPlanCraft(plan, opts.premise, opts));
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

/** The screenwriting rules of a scene plan (S1–S7), for a premise with its parts. */
function checkPlanCraft(
  plan: ScenePlan,
  premise: Premise,
  opts: {
    minutes?: number | null;
    bible?: Pick<StudioBible, 'characters'> | null;
  },
): string[] {
  const out: string[] = [];
  const first = plan.scenes[0];
  if (!first) return out;
  // S1: scene 1 carries the setup, each part by a means, never narrated.
  const needed: SetupPart[] = [
    ...(premise.want ? (['want'] as const) : []),
    ...(premise.obstacle ? (['obstacle'] as const) : []),
    ...(premise.stakes ? (['stakes'] as const) : []),
    ...(premise.clock ? (['clock'] as const) : []),
    ...(premise.oddity ? (['oddity'] as const) : []),
  ];
  const missing = needed.filter(
    (part) => !first.setup.some((p) => p.part === part),
  );
  if (missing.length)
    out.push(
      `Scene 1's setup has no entry for ${missing.join(', ')}: for each, say how the viewer learns it in scene 1: "line" (who says it to whom, and why they would say it now), "action" (what someone does) or "thing" (a thing on screen: a notice, a clock, an envelope). Never the narrator.`,
    );
  const narrated = first.setup.filter((p) => p.how === 'narration');
  if (narrated.length)
    out.push(
      `Scene 1's setup gives ${narrated.map((p) => p.part).join(', ')} to the narrator: let someone say it to someone, or do it, or show it as a thing on screen.`,
    );
  const cast = new Set(first.cast);
  for (const p of first.setup) {
    if (p.how === 'line' && (!p.by || !p.to))
      out.push(
        `Scene 1's ${p.part} is a line: say who says it (by) and to whom (to), both in the scene.`,
      );
    else if (p.how === 'line' && (!cast.has(p.by) || !cast.has(p.to)))
      out.push(
        `Scene 1's ${p.part} is a line said by "${p.by}" to "${p.to}": both are in scene 1's cast (${first.cast.join(', ')}).`,
      );
    if (!p.what)
      out.push(`Scene 1's ${p.part}: say what is said, done or seen (what).`);
  }
  // S3: long enough to set it up, and few enough faces.
  const least = (opts.minutes ?? 1) >= 2 ? 25 : 20;
  if (first.seconds < least)
    out.push(
      `Scene 1 is ${first.seconds} seconds: it carries the whole setup, so give it ${least} seconds or more.`,
    );
  if (first.cast.length > 3)
    out.push(
      `Scene 1 has ${first.cast.length} people (${first.cast.join(', ')}): three at most, so the viewer can learn who is who.`,
    );
  // S4: newcomers one or two at a time.
  const met = new Set(first.cast);
  plan.scenes.forEach((scene, k) => {
    if (k === 0) return;
    const fresh = scene.cast.filter((id) => !met.has(id));
    if (fresh.length > 2)
      out.push(
        `Scene ${k + 1} brings in ${fresh.length} people we have not met (${fresh.join(', ')}): two at most in one scene.`,
      );
    for (const id of scene.cast) met.add(id);
  });
  plan.scenes.forEach((scene, k) => {
    // S2: the value flips.
    if (!scene.value)
      out.push(
        `Scene ${k + 1} ("${scene.title}"): say its value, what is at stake in it (safe, trusted, winning, home), and its charge at the start and the end, "+" or "-".`,
      );
    else if (scene.value.from === scene.value.to)
      out.push(
        `Scene ${k + 1} ("${scene.title}") starts and ends "${scene.value.from}" on ${scene.value.name}: nothing flips, so it is a non-event. Turn it from + to - or back, or merge it with another.`,
      );
    // S6: enter late.
    if (!scene.start)
      out.push(
        `Scene ${k + 1}: say its start, the first moment, already inside the trouble.`,
      );
    else if (ARRIVING.test(scene.start.trim()))
      out.push(
        `Scene ${k + 1} starts with an arrival or a hello ("${scene.start}"): start inside the trouble, and cut the hellos and the arrivals.`,
      );
    // S7: scenes link.
    if (k > 0 && !scene.link)
      out.push(
        `Scene ${k + 1} has no link: "therefore" (it happens because of the scene before) or "but" (something goes against it), never "and then".`,
      );
  });
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
    premise.hero ? `Hero: ${premise.hero}` : '',
    premise.want ? `Want: ${premise.want}` : '',
    premise.obstacle ? `Obstacle: ${premise.obstacle}` : '',
    premise.clock ? `Clock: ${premise.clock}` : '',
    premise.normalDay ? `An ordinary day: ${premise.normalDay}` : '',
    premise.whyToday ? `Why today: ${premise.whyToday}` : '',
    premise.whyCare ? `Why we care: ${premise.whyCare}` : '',
    premise.oddity
      ? `The one impossible thing: ${premise.oddity.what}. Its rule: ${premise.oddity.rule}`
      : '',
    premise.spine.length
      ? `Spine:\n${premise.spine.map((l) => `  ${l}`).join('\n')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/** The beat sheet in words: each beat's role, what happens, who wants what, and its intensity. */
export function describeBeats(sheet: BeatSheet): string {
  return sheet.beats
    .map(
      (b, k) =>
        `${k}. [${b.role}, intensity ${b.intensity}${b.link ? `, ${b.link}` : ''}] ${b.what}${b.wants ? ` Wants: ${b.wants}.` : ''}${b.stops ? ` Stopped by: ${b.stops}.` : ''}${b.changes ? ` Changes: ${b.changes}.` : ''}${b.plants.length ? ` Plants: ${b.plants.map((p) => `${p.what} [${p.id}]`).join(', ')}.` : ''}${b.pays.length ? ` Pays off: ${b.pays.join(', ')}.` : ''}`,
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
    scene.value
      ? `Its value: ${scene.value.name}, ${scene.value.from} at the start and ${scene.value.to} at the end`
      : '',
    scene.link
      ? `It follows the scene before: ${scene.link === 'but' ? 'but (something goes against it)' : 'therefore (because of it)'}`
      : '',
    scene.start ? `It starts inside the trouble: ${scene.start}` : '',
    scene.moment ? `The moment to land: ${scene.moment}` : '',
    ...(scene.setup.length
      ? [
          'The setup, each part where the viewer can see or hear it, never the narrator:',
          ...scene.setup.map(
            (p) =>
              `- ${p.part}: ${p.how === 'line' ? `a line, ${p.by} to ${p.to}` : p.how === 'action' ? `an action by ${p.by || 'someone'}` : p.how === 'thing' ? 'a thing on screen' : 'narration (not allowed: give it to someone)'}: ${p.what}`,
          ),
        ]
      : []),
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
