/**
 * The editor's desk, offline (FakeLlmAdapter): a small, sound show on
 * whatever topic the brief names, every step its shape, the same every
 * time, nothing spent. Its research cites pages its fake search "found",
 * so the whole chain (angles to boards) runs end to end without a key.
 */
import type {
  EditorFound,
  EditorSearchStep,
  EditorWriteStep,
} from '../../business/ports/llm.port';

/** The topic a step's parts are about: the brief's idea, else the show's question. */
export function fakeTopic(parts: readonly string[]): string {
  const all = parts.join('\n');
  const idea = /^Idea: (.+)$/mu.exec(all)?.[1];
  const question = /^The show's question: (.+)$/mu.exec(all)?.[1];
  return (idea ?? question ?? 'the topic').replace(/[.?!]+$/u, '').trim();
}

const slug = (words: string) =>
  words
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-|-$/gu, '')
    .slice(0, 40) || 'topic';

/** The pages the fake search finds for a topic. */
export function fakeFound(topic: string): EditorFound[] {
  return [1, 2, 3, 4].map((n) => ({
    url: `https://example.org/${slug(topic)}/${n}`,
    title: `${topic}, part ${n}`,
  }));
}

/** A step of the editor's desk answered by the fake, from its parts. */
export function fakeEditorAnswer(
  step: EditorWriteStep | EditorSearchStep | 'lesson' | 'illustrated',
  parts: readonly string[],
): Record<string, unknown> {
  const topic = fakeTopic(parts);
  const found = fakeFound(topic);
  const all = parts.join('\n');
  switch (step) {
    case 'angles':
      return {
        takeaway: `Why ${topic} works the way it does.`,
        notThis: [],
        angles: [
          ['What would happen without it?', 5, 4, 4, 5],
          ['Who first worked it out?', 4, 4, 3, 4],
          ['What does everyone get wrong about it?', 4, 3, 4, 4],
          ['How big is it, really?', 3, 2, 5, 3],
        ].map(([q, gap, tension, visual, payoff]) => ({
          question: `${topic}: ${q as string}`,
          pitch: `A question about ${topic}. Its answer surprises.`,
          scores: { gap, tension, visual, payoff },
          verdict: 'worth making',
        })),
      };
    case 'research':
      return {
        claims: [
          ['date', 'It began in 1582.', 'high', [0, 1]],
          ['number', 'About 4 million people are affected.', 'medium', [2]],
          ['event', 'A council met to settle it.', 'high', [0]],
          ['name', 'Clavius worked out the rule.', 'high', [1, 3]],
          ['claim', 'Some say the change was rushed.', 'medium', [3]],
          ['quote', 'A record says it "must follow the sun".', 'low', []],
        ].map(([kind, text, confidence, pages], k) => ({
          id: `c${k + 1}`,
          text: `${text as string}`,
          kind,
          confidence,
          sources: (pages as number[]).map((p) => ({
            url: found[p].url,
            title: found[p].title,
          })),
          visual: 'a timeline',
          contested: k === 4,
          who: k === 4 ? 'some historians' : null,
        })),
        // Deep enough to plan from (studio-editor-checks researchProblems):
        // dated events with their places, people with what they did, the
        // turning points as scenes, numbers with two sources.
        timeline: [
          ['1572', 'Rome', 'Gregory XIII becomes pope'],
          ['24 February 1582', 'Frascati', 'The papal bull is signed'],
          ['4 October 1582', 'Rome', 'The last day of the old count'],
          ['15 October 1582', 'Rome', 'The first day of the new count'],
          ['December 1582', 'Paris', 'France makes the change'],
        ].map(([date, place, event]) => ({
          date,
          place,
          event,
          claims: ['c1'],
        })),
        people: [
          {
            name: 'Clavius',
            role: 'the astronomer',
            wanted: 'a calendar that kept to the sun',
            did: 'worked out the rule',
            claims: ['c4'],
          },
        ],
        moments: [
          ['4 October 1582', 'Rome', 'the council', 'The old count ends'],
          [
            '15 October 1582',
            'Rome',
            'the townspeople',
            'People wake ten days on',
          ],
          ['1582', 'The council hall', 'Clavius', 'Clavius shows his sums'],
        ].map(([when, where, who, what]) => ({
          when,
          where,
          who,
          what,
          looked: 'a crowd at a notice board',
          claims: ['c1'],
        })),
        numbers: [
          { label: 'People affected', value: '4 million', claims: ['c2'] },
          { label: 'Days dropped', value: '10 days', claims: ['c1'] },
          {
            label: 'Leap days skipped',
            value: '3 in 400 years',
            claims: ['c4'],
          },
        ],
        myths: [
          {
            belief: `Everyone agreed on ${topic} at once`,
            truth: 'It took centuries',
            handle: 'Name the myth, then correct it',
            claims: ['c1'],
          },
        ],
        perspectives: [
          { side: 'Supporters', view: 'It was needed', claims: ['c3'] },
          { side: 'Critics', view: 'It was rushed', claims: ['c5'] },
        ],
        looks: [
          {
            subject: 'The council hall',
            kind: 'place',
            description: 'a long hall with benches and tall windows',
            claims: ['c3'],
          },
          {
            subject: 'Clavius',
            kind: 'person',
            description: 'an older man with a white beard and a dark robe',
            claims: ['c4'],
          },
        ],
        pronunciations: [{ word: 'Clavius', say: 'CLAY-vee-us' }],
        open: [],
      };
    case 'facts': {
      const used = [...new Set(all.match(/\bc\d+\b/gu) ?? [])];
      return {
        checks: used.map((claim) => ({
          claim,
          verdict: 'verified',
          note: 'found as said',
          rewrites: [],
          sources: [{ url: found[0].url, title: found[0].title }],
        })),
      };
    }
    case 'plan': {
      const item = (k: number, episode: number) => ({
        item: `Part ${k + 1} of ${topic}`,
        claims: [`c${(k % 5) + 1}`],
        moves: true,
        setsUp: k % 2 === 0,
        visual: true,
        surprise: k % 3 === 0,
        decision: 'keep',
        episode,
        seconds: 40,
        reason: 'moves the question',
      });
      return {
        spine: [
          `Once, ${topic} was a puzzle.`,
          'Every day, people lived with the problem.',
          'Until one day, someone measured it.',
          'Because of that, the old way was dropped.',
          'Because of that, a new rule began.',
          'Until finally, the rule stuck.',
        ],
        chain: [
          { beat: 'People lived with the problem', link: null },
          { beat: 'The problem grew', link: 'but' },
          { beat: 'A new rule was made', link: 'therefore' },
        ],
        items: [
          ...[0, 1, 2, 3, 4].map((k) => item(k, 1)),
          ...[5, 6, 7, 8, 9].map((k) => item(k, 2)),
          {
            ...item(10, 2),
            decision: 'cut',
            episode: null,
            setsUp: false,
            surprise: false,
            moves: false,
          },
        ],
        cast: [
          {
            name: 'Clavius',
            force: 'measurement',
            recurring: true,
            claims: ['c4'],
          },
          {
            name: 'A council member',
            force: 'tradition',
            recurring: false,
            claims: [],
          },
        ],
        fairness: ['Give the critics their say'],
        episodes: [
          {
            title: 'The puzzle',
            question: `Why did ${topic} need fixing?`,
            covers: [0, 1, 2, 3, 4],
            plants: [{ id: 'p1', text: 'the leftover minutes', paidIn: 2 }],
            endsOn: 'But the fix had a flaw.',
          },
          {
            title: 'The fix',
            question: `How was ${topic} fixed for good?`,
            covers: [5, 6, 7, 8, 9],
            plants: [],
            endsOn: 'The rule still holds today.',
          },
        ],
        leftOut: [`Part 11 of ${topic}`],
      };
    }
    case 'world':
      return {
        subject: `history: ${topic}`,
        maths: false,
        era: '1500-1800',
        region: null,
        palette: [
          { thing: 'the old way', token: 'chart1' },
          { thing: 'the new rule', token: 'chart0' },
        ],
        held: { token: 'accent', for: 'the answer' },
        legend: 'a small key in the corner while the timeline is up',
        picture: 'a timeline of the years',
        map: null,
        // Real places and people with the claims that name them; an
        // everyday place or an ordinary person made up for the story has
        // none, and is left out (worldOf).
        places: [
          {
            name: 'The council hall',
            kind: 'hall',
            look: 'benches and tall windows',
            time: 'day',
            claims: ['c3'],
          },
          {
            name: 'Rome',
            kind: 'street',
            look: 'stone streets and churches',
            time: 'day',
            claims: ['c1'],
          },
          {
            name: 'The town square',
            kind: 'square',
            look: 'a market square',
            time: 'day',
            claims: [],
          },
        ],
        people: [
          {
            name: 'Clavius',
            role: 'the astronomer',
            likeness: 'an older man with a white beard and a dark robe',
            recurring: true,
            voice: 'old man',
            figure: {
              age: 'elder',
              facialHair: 'beard',
              hairColour: 'white',
              top: 'robe',
              topColour: 'black',
            },
            claims: ['c4'],
          },
          {
            name: 'A council member',
            role: 'speaks for tradition',
            likeness: 'a plain robe',
            recurring: false,
            voice: 'woman',
            figure: { age: 'adult', top: 'robe' },
            claims: [],
          },
        ],
        things: [{ name: 'The calendar', look: 'a printed sheet of months' }],
      };
    case 'beats':
      return {
        acts: [
          {
            title: 'The puzzle',
            job: 'Set up the problem',
            seconds: 100,
            rehook: 'But nobody agreed on the fix.',
            plants: ['p1'],
            payoffs: [],
            grave: false,
          },
          {
            title: 'The turn',
            job: 'Show the fix and its cost',
            seconds: 110,
            rehook: '',
            plants: [],
            payoffs: [],
            grave: false,
          },
        ],
      };
    case 'hooks':
      return {
        hooks: ['image', 'paradox', 'stakes', 'myth', 'number'].map((kind) => ({
          text: `A ${kind} hook about ${topic}.`,
          kind,
          verdict: 'good',
          claims: ['c1'],
        })),
        hook: `In 1582, in Rome, Clavius watched ten days vanish from ${topic}. So where did they go?`,
        claims: ['c1'],
      };
    case 'script': {
      // Two columns as a writer gives them: what is said, and apart from
      // it, what is seen (never the same words: that is a direction).
      const row = (
        say: string,
        visual: string,
        act: number,
        show: string,
        claims: string[] = [],
        extra: Record<string, unknown> = {},
      ) => ({
        say,
        visual,
        show,
        claims,
        act,
        plant: null,
        payoff: null,
        delivery: 'explain',
        music: null,
        hold: false,
        ...extra,
      });
      return {
        rows: [
          row(
            `In 1582, ten days vanished from ${topic}.`,
            'scene',
            1,
            'The town square at dawn: people read a notice',
            ['c1'],
            { delivery: 'hook' },
          ),
          row(
            'People woke up and the date had jumped.',
            'scene',
            1,
            'The town square: a crowd gathers round the notice',
          ),
          row(
            'Nobody lost a minute of sleep.',
            'scene',
            1,
            'The town square: a baker yawns and opens up',
          ),
          row(
            'So where did the days go?',
            'when',
            1,
            'A calendar with ten days missing',
            [],
            { delivery: 'question' },
          ),
          row(
            'The old count ran slightly too long each year.',
            'why',
            1,
            "A calendar bar longer than the sun's bar",
          ),
          row(
            'Those leftover minutes piled up over centuries.',
            'why',
            1,
            'Minutes stacking into a tower along a timeline',
            [],
            { plant: 'p1' },
          ),
          row(
            'About 4 million people feel it today.',
            'how-many',
            1,
            'Counter: "4 million"',
            ['c2'],
          ),
          row(
            'A council met to settle it.',
            'scene',
            1,
            'The council hall: members argue across the table',
            ['c3'],
          ),
          row(
            'Clavius stood and showed his sums.',
            'scene',
            1,
            'The council hall: Clavius points at a slate of sums',
            ['c4'],
          ),
          row(
            'But nobody agreed on the fix.',
            'why',
            1,
            'Two arrows pulling apart',
            [],
            { hold: true },
          ),
          row(
            'The new rule dropped three leap days every four centuries.',
            'why',
            2,
            'Four century boxes, three crossed out',
            ['c4'],
          ),
          row(
            'That kept the seasons in their place.',
            'when',
            2,
            'Seasons in a ring, each on its month',
            ['c1'],
            { payoff: 'p1' },
          ),
          row(
            'Some say the change was rushed.',
            'who',
            2,
            'Name card: "Some historians"',
            ['c5'],
          ),
          row(
            'The ten days went to pay back the drift.',
            'when',
            2,
            'A calendar: 4 October, then 15 October',
            ['c1'],
            { delivery: 'key' },
          ),
        ],
      };
    }
    case 'read':
      return {
        notes: [
          'Row 3: make the question sharper.',
          'Row 7: the number needs its source said.',
          'Row 13: say whose view it is.',
        ],
      };
    case 'package':
      return {
        titles: [
          { text: `The Days That Vanished From ${topic}`, verdict: 'best' },
          { text: `${topic}, Explained`, verdict: 'plain' },
        ],
        title: `The Days That Vanished From ${topic}`,
        thumbnail: { words: 'TEN DAYS GONE', row: 8 },
        description: `${topic} explained: why ten days vanished.`,
        pinned: 'What would you have done with ten lost days?',
        hashtags: ['history', 'calendar'],
        leftOut: `We left out part 11 of ${topic}.`,
      };
    case 'lesson':
      return {
        fit: 'good',
        fitReason: null,
        title: 'A scene',
        mood: 'curious',
        beats: [],
        cast: [
          {
            id: 'idea',
            kind: 'words',
            name: 'The idea',
            brief: null,
            motion: null,
            parts: null,
            states: null,
            shape: null,
            value: null,
            style: 'keyword',
            sound: null,
            lines: null,
            plot: null,
            quote: null,
            phrases: null,
            ref: null,
            state: null,
            figure: null,
            count: null,
            pose: null,
            signs: null,
            holding: null,
            timeline: null,
            chart: null,
          },
        ],
        steps: [
          {
            beat: 0,
            phrase: '',
            layout: null,
            show: ['idea'],
            arrows: null,
            effects: null,
          },
        ],
      };
    case 'illustrated': {
      const set = /^Set: ([\w-]+)/mu.exec(all)?.[1] ?? '';
      const who = /^People here: ([\w-]+)/mu.exec(all)?.[1] ?? null;
      return {
        title: 'A shot',
        set,
        time: 'day',
        weather: 'clear',
        crowd: 'few',
        mood: 'curious',
        music: 'calm',
        transition: 'cut',
        onStage: who
          ? [{ who, spot: 'centre', pose: 'standing', face: 'neutral' }]
          : [],
        props: [],
        beats: who
          ? [
              {
                kind: 'action',
                who,
                say: 'They look up.',
                do: 'look',
                target: '@up',
              },
            ]
          : [],
        camera: [],
      };
    }
    default:
      return {};
  }
}
