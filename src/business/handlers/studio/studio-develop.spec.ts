/**
 * Story development sends at most one answer back in all (Richard,
 * 2026-09-30: "Cut the rewrites"), and only for what breaks the story's
 * structure: what code can put right it puts right, and the rest is
 * noted, never paid for with another call.
 */
import { bibleOf, briefOf } from '../../domain/studio/studio';
import type { LlmGatewayPort } from '../../ports/llm.port';
import { developStory } from './studio-develop';

const bible = bibleOf({
  characters: [
    { name: 'Nadia', voice: 'woman', role: 'main', figure: {} },
    { name: 'Raj', voice: 'man', role: 'supporting', figure: {} },
  ],
  sets: [
    { name: 'Launderette', id: 'launderette' },
    { name: 'Bus Stop', id: 'bus-stop' },
  ],
});
const brief = briefOf({
  format: 'story',
  idea: 'a locked washing machine',
  audience: 'adults',
  minutes: 1,
  genre: 'comedy',
});
const usage = { model: 'm', tokensIn: 1, tokensOut: 1, latencyMs: 1 };

const premise = {
  title: 'The Last Pound',
  logline:
    'Nadia must get her shirt out of the locked machine before the last bus, or she misses her interview.',
  theme: 'Asking for help',
  hook: 'A machine that eats pound coins.',
  stakes: 'Her interview in the morning.',
  tools: ['a ticking clock'],
  gag: 'Raj says "no refunds" to everything.',
  hero: 'nadia',
  want: 'her shirt back',
  // More than one thing: put right by code, never sent back.
  obstacle: 'A locked machine; Raj wants to lock up.',
  clock: 'the last bus at midnight',
  normalDay: 'Nadia does her washing on Sundays.',
  whyToday: 'Her interview is tomorrow.',
  whyCare: 'She gives her last pound to a stranger.',
  spine: [
    'Once upon a time there was Nadia.',
    'Every day she washed her shirt.',
    'Until one day the machine locked.',
    'Because of that she begged Raj.',
    'Until finally the machine opened.',
    'Ever since then she carries two pounds.',
  ],
};
const characters = {
  characters: ['nadia', 'raj'].map((id) => ({
    id,
    want: 'her shirt back',
    need: 'to ask for help',
    flaw: 'too proud',
    fear: 'being late',
    personality: ['counts coins twice', 'hums when nervous'],
    voice: 'short sentences',
    habits: [],
    relationships: [],
    arc: {},
  })),
};
const beat = (role: string, intensity: number) => ({
  role,
  what: `The ${role}.`,
  wants: '',
  stops: '',
  changes: '',
  intensity,
  plants: [],
  pays: [],
  link: role === 'setup' ? null : 'therefore',
});
const beats = {
  beats: [
    beat('setup', 2),
    beat('problem', 4),
    beat('attempt', 6),
    beat('twist', 8),
    beat('payoff', 3),
  ],
};
const plan = {
  scenes: [
    {
      title: 'Locked In',
      beats: [0, 1, 2, 3, 4],
      purpose: 'Set it up.',
      conflict: 'Nadia against Raj.',
      turn: 'The machine opens.',
      shift: 'worry to relief',
      moment: 'The shirt flies out.',
      set: 'launderette',
      cast: ['nadia', 'raj'],
      seconds: 55,
      summary: 'Nadia gets her shirt back from Raj.',
      setup: [],
      value: { name: 'hope', from: '-', to: '+' },
      start: 'Nadia kicks the machine.',
      link: null,
    },
  ],
};

/** A writer whose answers are given step by step: the first, then the one after it goes back. */
function writer(answers: Record<string, Record<string, unknown>[]>): {
  llm: LlmGatewayPort;
  asked: { step: string; problems?: string[] }[];
} {
  const asked: { step: string; problems?: string[] }[] = [];
  const step = (name: string) => (input: { problems?: string[] }) => {
    const had = asked.filter((a) => a.step === name).length;
    asked.push({ step: name, problems: input.problems });
    const list = answers[name];
    return Promise.resolve({
      value: list[Math.min(had, list.length - 1)],
      usage,
    });
  };
  const llm = {
    studioPremise: step('premise'),
    studioCharacters: step('characters'),
    studioBeats: step('beats'),
    studioScenePlan: step('plan'),
  } as unknown as LlmGatewayPort;
  return { llm, asked };
}

describe('story development, fast', () => {
  it('sends nothing back for what code puts right or only notes: one call a step', async () => {
    const { llm, asked } = writer({
      premise: [premise],
      characters: [characters],
      beats: [beats],
      plan: [plan],
    });
    const developed = await developStory(llm, {
      brief,
      briefWords: 'A comedy.',
      bible,
    });
    expect(asked.map((a) => a.step)).toEqual([
      'premise',
      'characters',
      'beats',
      'plan',
    ]);
    expect(developed.story.premise.obstacle).toBe('A locked machine');
    expect(developed.steps[0].fixed).toEqual([
      'the obstacle is its first part: "A locked machine"',
    ]);
    expect(developed.steps.every((s) => s.left === undefined)).toBe(true);
  });

  it('sends back at most once in all, only for what breaks the structure, hard problems first', async () => {
    const { llm, asked } = writer({
      // No want: the story has nothing to go for. Still none when asked again.
      premise: [{ ...premise, want: '' }],
      characters: [characters],
      // No twist, no payoff: sent back too, if the story had a send-back left.
      beats: [{ beats: [beat('setup', 2), beat('problem', 4)] }],
      plan: [plan],
    });
    const developed = await developStory(llm, {
      brief,
      briefWords: 'A comedy.',
      bible,
    });
    expect(asked.map((a) => a.step)).toEqual([
      'premise',
      'premise',
      'characters',
      'beats',
      'plan',
    ]);
    expect(asked[1].problems?.[0]).toMatch(/^Say the want/);
    const [first, , third] = developed.steps;
    expect(first.left).toBeDefined();
    expect(third.hard?.length).toBeGreaterThan(0);
    expect(third.left).toBeUndefined();
  });

  it('sends nothing back with no send-backs to spend', async () => {
    const { llm, asked } = writer({
      premise: [{ ...premise, want: '' }],
      characters: [characters],
      beats: [beats],
      plan: [plan],
    });
    await developStory(llm, {
      brief,
      briefWords: 'A comedy.',
      bible,
      sendBacks: 0,
    });
    expect(asked).toHaveLength(4);
  });
});
