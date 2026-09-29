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
  /** What is planted here, to pay off later; and what pays off here, planted before. */
  plants: string[];
  pays: string[];
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
          plants: words(b.plants, 4, 60),
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

/** Where the story peaks: its climax, or a short film's twist. */
export function peakOf(sheet: BeatSheet): number {
  const climax = lastOf(sheet.beats, 'climax');
  if (climax >= 0) return climax;
  return sheet.template === 'short' ? lastOf(sheet.beats, 'twist') : -1;
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
 * before the climax; the climax its peak, nothing before it as high; and
 * after it, it falls into the resolution. A flat curve, or one that peaks
 * too early, goes back.
 */
export function checkCurve(sheet: BeatSheet): string[] {
  const out: string[] = [];
  const { beats } = sheet;
  if (beats.length < 3) return out;
  const at = beats.map((b) => b.intensity);
  const peak = peakOf(sheet);
  const top = Math.max(...at);
  if (top - Math.min(...at) < 4)
    out.push(
      `The tension is flat (${at.join(', ')}): start lower, rise with each attempt, peak at the climax.`,
    );
  if (peak < 0) return out;
  if (at[peak] < top || at.slice(0, peak).some((n) => n >= at[peak]))
    out.push(
      `The tension peaks too early (${at.join(', ')}): the ${beats[peak].role} is the highest, nothing before it as high.`,
    );
  if (at[0] >= at[peak] - 3)
    out.push(
      'The tension starts too high: begin calmer, so it has somewhere to go.',
    );
  if (sheet.template !== 'short') {
    // Between the inciting incident and the climax: a dip for relief.
    const from = Math.max(0, firstOf(beats, 'inciting', 'problem'));
    const rising = at.slice(from, peak);
    const dips = rising.some((n, k) => k > 0 && n < rising[k - 1]);
    if (!dips)
      out.push(
        'Put a relief beat (a joke, a warm moment) between the rising beats: a dip in the tension before it climbs again.',
      );
    // It rises: the stretch before the climax higher than the start.
    const half = Math.ceil(rising.length / 2);
    const early = rising.slice(0, half);
    const late = rising.slice(half);
    if (
      late.length &&
      Math.max(...late) <= Math.max(...early) &&
      rising.length >= 3
    )
      out.push(
        'The tension does not rise: each attempt harder, or costing more.',
      );
    // The low point before the climax: the moment it cannot get worse.
    const low = lastOf(beats, 'low', 'turn');
    if (low < 0 || low > peak)
      out.push('Put the low point (or the turn) just before the climax.');
  }
  // After the peak, it falls.
  const after = at.slice(peak + 1);
  if (after.length && after[after.length - 1] > at[peak] - 3)
    out.push('After the climax, let the tension fall into the resolution.');
  return out;
}

/** A thing planted or paid off, as compared. */
const thingKey = (thing: string) =>
  thing
    .toLowerCase()
    .replace(/^(?:the|a|an|his|her|their)\s+/u, '')
    .replace(/[^\p{L}\p{N} ]+/gu, '')
    .trim();

/** Setups and payoffs (§1.3): everything planted pays off later; everything paid off was planted before. */
export function checkSetups(sheet: BeatSheet): string[] {
  const out: string[] = [];
  const planted = new Map<string, number>();
  const paid = new Map<string, number>();
  sheet.beats.forEach((beat, k) => {
    for (const one of beat.plants)
      if (!planted.has(thingKey(one))) planted.set(thingKey(one), k);
    for (const one of beat.pays) paid.set(thingKey(one), k);
  });
  for (const [thing, k] of planted) {
    const when = paid.get(thing);
    if (when === undefined)
      out.push(`"${thing}" is planted in beat ${k + 1} but never pays off.`);
    else if (when <= k)
      out.push(
        `"${thing}" pays off in beat ${when + 1}, before it is planted.`,
      );
  }
  for (const [thing, k] of paid)
    if (!planted.has(thing))
      out.push(`"${thing}" pays off in beat ${k + 1} but was never planted.`);
  if (sheet.template !== 'short' && !planted.size)
    out.push(
      'Plant something early (a skill, a secret, a thing) that pays off later.',
    );
  return out;
}

/** Everything code sees wrong in a beat sheet. */
export const checkBeats = (sheet: BeatSheet): string[] => [
  ...checkStructure(sheet),
  ...checkCurve(sheet),
  ...checkSetups(sheet),
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
        `${k}. [${b.role}, intensity ${b.intensity}] ${b.what}${b.wants ? ` Wants: ${b.wants}.` : ''}${b.stops ? ` Stopped by: ${b.stops}.` : ''}${b.changes ? ` Changes: ${b.changes}.` : ''}${b.plants.length ? ` Plants: ${b.plants.join(', ')}.` : ''}${b.pays.length ? ` Pays off: ${b.pays.join(', ')}.` : ''}`,
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

/** The whole story in words: what later steps and the outline's writer build on. */
export function describeStory(story: StudioStory): string {
  return [
    `The story, as developed:\n${describePremise(story.premise)}`,
    `The beats:\n${describeBeats(story.beats)}`,
  ].join('\n\n');
}
