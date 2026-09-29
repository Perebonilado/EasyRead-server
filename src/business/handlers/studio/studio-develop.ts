/**
 * Story development as the worker runs it (studio-story-plan §1.1–1.4,
 * S2), and as the story bench runs it: the premise; the characters'
 * personalities, kept with their looks; the beat sheet for the film's
 * length; and the scene plan, which the outline is built from by code.
 * Each step is asked of the writer (DeepSeek, thinking on, studio_write),
 * made sound, checked by code, and sent back once with what code found;
 * the better answer is kept.
 */
import type { LlmGatewayPort, LlmResult, LlmUsage } from '../../ports/llm.port';
import type { StudioBible, StudioOutline } from '../../domain/studio/studio';
import { checkOutline, mendOutline } from '../../domain/studio/studio-check';
import {
  TEMPLATES,
  beatSheetOf,
  checkBeats,
  checkCastForPremise,
  checkPersonas,
  checkPlan,
  checkPremise,
  contextOf,
  describeBeats,
  describePremise,
  outlineFromPlan,
  personasOf,
  premiseOf,
  scenePlanOf,
  templateFor,
  withPersonas,
  type Persona,
  type StudioStory,
} from '../../domain/studio/studio-story';
import { describeBible } from '../../domain/studio/studio-words';
import type { StudioBrief } from '../../domain/studio/studio';

/** What each step of development found, before and after it went back. */
export interface StepReport {
  step: 'premise' | 'characters' | 'beats' | 'plan';
  /** What code found in the first answer; empty when it passed. */
  first: string[];
  /** What is left after it went back once; absent when it did not. */
  left?: string[];
}

export interface Developed {
  story: StudioStory;
  /** Everyone's persona as developed, by id: kept in the bible. */
  personas: Map<string, Persona>;
  /** The bible with them. */
  bible: StudioBible;
  /** The outline built from the scene plan, the story kept in it. */
  outline: StudioOutline;
  /** What code still finds wrong, at the end. */
  problems: string[];
  steps: StepReport[];
}

/**
 * One step: asked, made sound, checked, and sent back once with the
 * problems; the answer with fewer problems kept.
 */
async function step<T>(
  name: StepReport['step'],
  ask: (again: {
    previous?: unknown;
    problems?: string[];
  }) => Promise<LlmResult<Record<string, unknown>>>,
  read: (raw: unknown) => T,
  check: (value: T) => string[],
  record: (usage: LlmUsage) => Promise<void> | void,
  reports: StepReport[],
): Promise<{ value: T; problems: string[] }> {
  const first = await ask({});
  await record(first.usage);
  let value = read(first.value);
  let problems = check(value);
  const report: StepReport = { step: name, first: problems };
  if (problems.length) {
    const again = await ask({ previous: first.value, problems });
    await record(again.usage);
    const second = read(again.value);
    const left = check(second);
    report.left = left;
    if (left.length <= problems.length) {
      value = second;
      problems = left;
    }
  }
  reports.push(report);
  return { value, problems };
}

/**
 * A story developed for a brief and a cast: in steps, each checked by
 * code. With `previous` and a `request`, the story is changed as asked
 * and the rest kept; with a request and no previous, the request is where
 * the story goes (a next episode's).
 */
export async function developStory(
  llm: Pick<
    LlmGatewayPort,
    'studioPremise' | 'studioCharacters' | 'studioBeats' | 'studioScenePlan'
  >,
  input: {
    /** The brief, and in words. */
    brief: StudioBrief;
    briefWords: string;
    bible: StudioBible;
    /** The episodes before this one, in words. */
    before?: string;
    request?: string;
    previous?: StudioStory | null;
    /** Whether every main character must have a part: a first episode. */
    first?: boolean;
    record?: (usage: LlmUsage) => Promise<void> | void;
    /** Told as each step finishes. */
    onStep?: (report: StepReport) => void;
  },
): Promise<Developed> {
  const record = input.record ?? (() => undefined);
  const reports: StepReport[] = [];
  const brief = input.briefWords;
  const previous = input.previous ?? null;
  const minutes = input.brief.minutes ?? 1;
  const template = templateFor(minutes);
  /** What each step is told of the maker's request: the change, over what it was. */
  const revise = (
    part: unknown,
    again: { previous?: unknown; problems?: string[] },
  ) => ({
    ...(input.request ? { request: input.request } : {}),
    ...(previous && input.request && part !== undefined
      ? { previous: part }
      : {}),
    ...(again.previous !== undefined ? { previous: again.previous } : {}),
    ...(again.problems ? { problems: again.problems } : {}),
  });
  const told = (report: StepReport) => input.onStep?.(report);
  // 1. The premise.
  const premise = await step(
    'premise',
    (again) =>
      llm.studioPremise({
        brief,
        bible: describeBible(input.bible, true),
        ...(input.before ? { before: input.before } : {}),
        ...revise(previous?.premise, again),
      }),
    (raw) => premiseOf(raw, input.brief),
    (value) => checkPremise(value, input.bible),
    record,
    reports,
  );
  told(reports[reports.length - 1]);
  // 2. The characters: who they are, kept with their looks.
  const had = input.bible.characters.flatMap((c) =>
    c.persona ? [{ id: c.id, ...c.persona }] : [],
  );
  const characters = await step(
    'characters',
    (again) =>
      llm.studioCharacters({
        brief,
        bible: describeBible(input.bible, true),
        story: describePremise(premise.value),
        ...revise(had.length ? { characters: had } : undefined, again),
      }),
    (raw) => personasOf(raw, input.bible),
    (personas) => [
      ...checkPersonas(input.bible, personas),
      ...checkCastForPremise(premise.value, input.bible, personas),
    ],
    record,
    reports,
  );
  told(reports[reports.length - 1]);
  // Theirs as they were where the writer gave none now.
  const personas = new Map<string, Persona>(
    input.bible.characters.flatMap((c) =>
      c.persona ? [[c.id, c.persona] as const] : [],
    ),
  );
  for (const [id, persona] of characters.value) personas.set(id, persona);
  const bible = withPersonas(input.bible, personas);
  // 3. The beats, shaped by the film's length.
  const shape = TEMPLATES[template];
  const beats = await step(
    'beats',
    (again) =>
      llm.studioBeats({
        brief,
        bible: describeBible(bible, true),
        story: describePremise(premise.value),
        structure: `${shape.beats}; ${shape.least} to ${shape.most} beats.`,
        ...revise(previous?.beats, again),
      }),
    (raw) => beatSheetOf(raw, template),
    // Everyone's habits and the running gag run through; they need no payoff.
    (sheet) =>
      checkBeats(sheet, contextOf(bible, premise.value), premise.value),
    record,
    reports,
  );
  told(reports[reports.length - 1]);
  // 4. The scene plan, and the outline built from it.
  const story = `${describePremise(premise.value)}\n\nThe beats (by index):\n${describeBeats(beats.value)}`;
  const outlineOfPlan = (plan: ReturnType<typeof scenePlanOf>) =>
    mendOutline(outlineFromPlan(plan, premise.value), bible);
  const planned = await step(
    'plan',
    (again) =>
      llm.studioScenePlan({
        brief,
        bible: describeBible(bible, true),
        story,
        ...revise(previous?.plan, again),
      }),
    scenePlanOf,
    (plan) => [
      ...checkPlan(plan, beats.value, {
        premise: premise.value,
        minutes,
        bible,
      }),
      ...checkOutline(
        outlineOfPlan(plan),
        bible,
        minutes,
        true,
        input.first ?? true,
      ),
    ],
    record,
    reports,
  );
  told(reports[reports.length - 1]);
  const developed: StudioStory = {
    premise: premise.value,
    beats: beats.value,
    plan: planned.value,
  };
  return {
    story: developed,
    personas,
    bible,
    outline: { ...outlineOfPlan(planned.value), story: developed },
    problems: [
      ...premise.problems,
      ...characters.problems,
      ...beats.problems,
      ...planned.problems,
    ],
    steps: reports,
  };
}
