/**
 * The tall story test piece (studio-vertical-plan §9.2): two friends at a
 * market stall, one bringing the other some news. A conversation, a walk
 * toward the camera, and a close on the reveal. Written by hand as a
 * sheet (no writer), with a global, neutral cast, and staged by code as
 * the worker stages a story's scene (stageStory), for either shape.
 */
import { bibleOf, storySheetOf, type StudioBible } from '../studio';
import { mendSheet, repairSheet, withFeatures } from '../studio-check';
import { stageStory } from '../studio-stage';
import type { SceneScript } from '../../scene-script';

const blank = {
  feeling: null,
  sign: null,
  do: null,
  prop: null,
  spot: null,
  from: null,
  pace: null,
  seconds: null,
};
const line = (
  who: string,
  to: string,
  say: string,
  more: Record<string, unknown> = {},
) => ({ ...blank, kind: 'line', who, to, say, from: 'here', ...more });
const figure = (over: Record<string, unknown>) => ({
  age: 'adult',
  build: 'average',
  skin: 4,
  hair: 'short',
  hairColour: 'brown',
  facialHair: 'none',
  headwear: 'none',
  top: 't-shirt',
  topColour: 'blue',
  bottom: 'trousers',
  bottomColour: 'navy',
  accentColour: 'red',
  extras: [],
  ...over,
});

export const MARKET_NEWS_BIBLE: StudioBible = bibleOf({
  characters: [
    {
      id: 'mina',
      name: 'Mina',
      kind: 'person',
      role: 'lead',
      look: 'a young woman in a green apron, her hair tied back',
      figure: figure({
        hair: 'bun',
        hairColour: 'black',
        skin: 3,
        top: 'apron',
        topColour: 'green',
        bottom: 'skirt',
        bottomColour: 'brown',
      }),
      size: null,
      voice: 'woman',
      voicePick: 1,
      traits: ['hard-working', 'doubtful'],
      carries: null,
    },
    {
      id: 'theo',
      name: 'Theo',
      kind: 'person',
      role: 'supporting',
      look: 'a young man in a yellow jacket',
      figure: figure({
        hair: 'curly',
        hairColour: 'black',
        skin: 6,
        top: 'jacket',
        topColour: 'yellow',
      }),
      size: null,
      voice: 'man',
      voicePick: 1,
      traits: ['excitable', 'loyal'],
      carries: null,
    },
  ],
  sets: [
    {
      id: 'market',
      name: 'The Market',
      look: 'an open-air market street with a fruit and jam stall',
      kind: 'outdoor',
      stand: 'on',
      front: null,
      sound: null,
    },
  ],
  world: { era: 'today', region: '', culture: '', landscape: '', homes: '' },
});

/** The scene's beats: news called from afar, a walk up to the stall toward the camera, the talk, and the reveal. */
export const MARKET_NEWS_BEATS = [
  line('theo', 'mina', 'Mina! Mina, wait! I have news!', { pace: 'shout' }),
  {
    ...blank,
    kind: 'action',
    who: 'theo',
    do: 'walk',
    spot: 'centre-right',
    say: 'Theo hurries up to the front of the stall, toward the camera.',
  },
  line('mina', 'theo', 'You look like you ran all the way here.'),
  line('theo', 'mina', 'I did. I went to the bakery on the corner.'),
  line('mina', 'theo', 'The bakery? What did they say?', { aim: 'asks' }),
  line('theo', 'mina', 'They tasted your jam. They want it. Every week.', {
    aim: 'reveals',
    feeling: 'happy',
  }),
  {
    ...blank,
    kind: 'reaction',
    who: 'mina',
    feeling: 'surprised',
    say: 'Mina stares at him.',
  },
  line('mina', 'theo', 'Every week? Theo, that is wonderful!', {
    pace: 'shout',
    feeling: 'happy',
  }),
];

/** The sheet, as the writer would have written it. */
export const MARKET_NEWS_SHEET = storySheetOf({
  kind: 'story',
  title: 'News at the Stall',
  set: 'market',
  time: 'day',
  weather: 'clear',
  crowd: 'none',
  mood: 'happy',
  music: 'calm',
  transition: 'cut',
  onStage: [
    {
      who: 'mina',
      spot: 'centre-left',
      pose: 'standing',
      face: 'neutral',
      holding: null,
    },
    {
      who: 'theo',
      spot: 'right',
      pose: 'standing',
      face: 'happy',
      holding: null,
      depth: 'back',
    },
  ],
  props: [],
  beats: MARKET_NEWS_BEATS,
  camera: [],
});

/** The scene staged by code, as the worker stages it: its script, its bible with the set's features. */
export function marketNewsStaged(): {
  script: SceneScript;
  bible: StudioBible;
} {
  const mended = mendSheet(MARKET_NEWS_SHEET, MARKET_NEWS_BIBLE, null);
  const bible = withFeatures(
    MARKET_NEWS_BIBLE,
    MARKET_NEWS_SHEET.set,
    mended.features,
  );
  const script = stageStory(
    repairSheet(MARKET_NEWS_SHEET, bible, null),
    bible,
    { before: null },
  );
  return { script, bible };
}
