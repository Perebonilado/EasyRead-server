/**
 * The illustrated look end to end in code (WP17; tech §11): code chooses
 * the look with the world (characters for history and the young,
 * portraits and silhouettes for the news, money and science) and the
 * maker's choice wins; the board's answer keeps a speech bubble and eyes
 * only in an illustrated show, sparingly, and a character is named only
 * for a person of the list; the build stands the characters on the map,
 * labels a named one the first time, makes the eyes, and says the look is
 * illustrated; a bubble leaves once read.
 */
import { EMPTY_BRIEF, type StudioBrief } from '../studio/studio';
import { lookStyleFor, showLookStyle } from '../studio/studio-look';
import { MAP, PALETTE, REGISTRY } from './__fixtures__/regional-turn';
import { buildShots, shotLook, type BuildContext } from './shot-build';
import { mendPlan, planOf } from './shot-check';
import { registryOf } from './shot-registry';
import { SAY_LINGER_MS, timeShots } from './shot-time';
import { dwellMs } from '../studio/explainer-rules';
import type { ShotPlan } from './types';

const ctx: BuildContext = {
  shape: 'wide',
  palette: PALETTE,
  held: null,
  theme: 'paper',
  map: MAP,
  seed: 'scene-7',
  look: 'illustrated',
};
const registry = registryOf([
  ...REGISTRY,
  {
    name: 'person:Ahmadu Bello',
    kind: 'person',
    about: 'Northern leader',
    claim: 'c9',
    likeness: 'tall, a white turban, a white robe, a short beard',
  },
]);

describe('the look chosen with the world', () => {
  it('draws history and culture and the young with characters, the news, money and science editorially', () => {
    expect(
      lookStyleFor({
        subject: 'The fall of the Roman Empire',
        band: 'general-adult',
      }),
    ).toBe('illustrated');
    expect(
      lookStyleFor({
        subject: 'Why inflation came back',
        band: 'general-adult',
      }),
    ).toBe('editorial');
    expect(
      lookStyleFor({
        subject: 'How vaccines train the body',
        band: 'primary-upper',
      }),
    ).toBe('illustrated');
    // A past world leans to characters, unless its subject is the news's own (politics, money, science).
    expect(
      lookStyleFor({
        subject: 'The road to the river',
        band: 'general-adult',
        era: 'medieval',
      }),
    ).toBe('illustrated');
    expect(
      lookStyleFor({
        subject: 'The road to self-government',
        band: 'general-adult',
        era: '1945-1975',
      }),
    ).toBe('editorial');
    expect(
      lookStyleFor({
        subject: 'How a jet engine works',
        band: 'general-adult',
      }),
    ).toBe('editorial');
  });

  it('plays the maker’s choice over the world’s, the world’s over code’s; a story has none', () => {
    const brief: StudioBrief = {
      ...EMPTY_BRIEF,
      format: 'explainer',
      idea: 'Inflation explained',
    };
    expect(showLookStyle(brief, null, null)).toBe('editorial');
    expect(showLookStyle(brief, { style: 'illustrated' }, null)).toBe(
      'illustrated',
    );
    expect(
      showLookStyle(
        { ...brief, lookStyle: 'editorial' },
        { style: 'illustrated' },
        null,
      ),
    ).toBe('editorial');
    expect(
      showLookStyle({ ...EMPTY_BRIEF, format: 'story' }, null, null),
    ).toBeNull();
  });
});

const NARRATION =
  'In 1951 the North sent its men to Kano. Ahmadu Bello watched the West and the East from the north.';
const RAW = {
  shots: [
    {
      on: 'In 1951 the North',
      set: { kind: 'map' },
      actors: [
        {
          id: 'men',
          kit: 'character.group',
          place: 'place:Kano',
          side: 'North Region',
          dress: 'northern horsemen, white robes and turbans',
          era: 'the 1950s',
          count: 3,
          moves: [{ move: 'enter', on: 'sent its men' }],
        },
      ],
      info: [
        { recipe: 'pin', target: 'place:Kano', on: 'to Kano' },
        {
          recipe: 'say',
          target: 'men',
          text: 'Here we go again, said everyone loudly',
          on: 'sent its men',
        },
      ],
      camera: [],
      life: ['eyes', 'cloud-shadows'],
      join: 'continue',
      eyes: [
        { at: 'region:West Region', to: 'region:East Region', face: 'angry' },
        { at: 'region:East Region', to: 'region:West Region' },
        { at: 'region:North Region', to: 'region:West Region' },
      ],
    },
    {
      on: 'Ahmadu Bello watched',
      set: { kind: 'map' },
      actors: [
        {
          id: 'bello',
          kit: 'character.person',
          place: 'place:Kano',
          name: 'Ahmadu Bello',
          moves: [{ move: 'enter', on: 'Ahmadu Bello watched' }],
        },
        {
          id: 'nobody',
          kit: 'character.person',
          place: 'place:Lagos',
          name: 'Someone Madeup',
        },
      ],
      info: [],
      camera: [],
      life: [],
      join: 'cut',
    },
  ],
};
const KIT = ['character.person', 'character.group'];

describe('the board in an illustrated show', () => {
  it('keeps a bubble of six words at most and two eyes a shot; an editorial show keeps neither', () => {
    const illustrated = planOf(RAW, NARRATION, {
      kit: KIT,
      look: 'illustrated',
    });
    const first = illustrated.shots[0];
    expect(
      first.info.find((i) => i.recipe === 'say')?.text?.split(' '),
    ).toHaveLength(6);
    expect(first.eyes).toHaveLength(2);
    expect(first.life).not.toContain('eyes');
    const editorial = planOf(RAW, NARRATION, { kit: KIT, look: 'editorial' });
    expect(editorial.shots[0].info.some((i) => i.recipe === 'say')).toBe(false);
    expect(editorial.shots[0].eyes).toBeUndefined();
  });

  it('names a character only for a person of the list, as the list writes them', () => {
    const plan = mendPlan(
      planOf(RAW, NARRATION, { kit: KIT, look: 'illustrated' }),
      NARRATION,
      registry,
      {
        kit: KIT,
        look: 'illustrated',
        map: true,
      },
    );
    const actors = plan.shots.flatMap((s) => s.actors);
    expect(actors.find((a) => a.id === 'bello')?.params?.name).toBe(
      'Ahmadu Bello',
    );
    expect(actors.find((a) => a.id === 'nobody')?.params?.name).toBeUndefined();
    // The bubble is from a character of its shot; the eyes only on the map's regions.
    const first = plan.shots[0];
    expect(first.info.filter((i) => i.recipe === 'say')).toHaveLength(1);
    expect(first.eyes?.every((e) => e.at.startsWith('region:'))).toBe(true);
  });
});

describe('the build in an illustrated show', () => {
  const plan: ShotPlan = mendPlan(
    planOf(RAW, NARRATION, { kit: KIT, look: 'illustrated' }),
    NARRATION,
    registry,
    {
      kit: KIT,
      look: 'illustrated',
      map: true,
    },
  );
  const built = buildShots(plan, registry, ctx);

  it('says the look is illustrated, its map a natural relief', () => {
    expect(shotLook(ctx).style).toBe('illustrated');
    expect(shotLook({ ...ctx, look: 'editorial' }).style).toBeUndefined();
    expect(built.shots[0].set).toMatchObject({ kind: 'map', style: 'relief' });
  });

  it('stands the characters on the map, drawn by the kit', () => {
    const men = built.shots[0].actors.find((a) => a.id === 'men');
    expect(men).toBeDefined();
    const asset = built.assets[men!.asset];
    expect(asset.kind).toBe('svg');
    expect(asset.kind === 'svg' && asset.rig?.figures?.length).toBe(3);
  });

  it('makes the eyes on the regions, each glancing at another', () => {
    const eyes = built.shots[0].life.filter((l) => l.effect === 'eyes');
    expect(eyes).toHaveLength(2);
    expect(eyes[0]).toMatchObject({
      at: { kind: 'asset', asset: 'map', part: 'group-west-region' },
      to: { kind: 'asset', asset: 'map', part: 'group-east-region' },
      face: 'angry',
    });
  });

  it('labels a named character with their name the first time, and draws them from their likeness', () => {
    const labels = built.shots
      .flatMap((s) => s.info)
      .filter((i) => i.recipe === 'label' && i.text === 'Ahmadu Bello');
    expect(labels).toHaveLength(1);
    expect(labels[0].target).toEqual({
      kind: 'actor',
      actor: 'bello',
      part: 'head',
    });
    const bello = built.shots
      .flatMap((one) => one.actors)
      .find((a) => a.id === 'bello')!;
    const svg = built.assets[bello.asset];
    // A white turban: the likeness's.
    expect(svg.kind === 'svg' && svg.svg).toContain('data-part="hat"');
  });

  it('times a bubble to leave once it is read', () => {
    const say = built.shots[0].info.find((i) => i.recipe === 'say')!;
    expect(say.target).toEqual({ kind: 'actor', actor: 'men' });
    // The narration spoken a word every 300 ms: [charStart, charEnd, startMs, endMs].
    let at = 0;
    const words = NARRATION.split(' ').map((w, k) => {
      const word = [at, at + w.length, k * 300, k * 300 + 250];
      at += w.length + 1;
      return word;
    });
    const end = words.length * 300;
    const timed = timeShots(
      built.shots,
      [{ text: NARRATION, startMs: 0, endMs: end, words }],
      end + 500,
      { notes: [] },
    );
    const bubble = timed
      .flatMap((s) => s.info)
      .find((i) => i.recipe === 'say')!;
    // It leaves once read (sooner when the next change comes), never staying to the shot's end.
    expect(bubble.untilMs).toBeGreaterThan(bubble.atMs + bubble.durMs);
    expect(bubble.untilMs).toBeLessThanOrEqual(
      bubble.atMs + bubble.durMs + dwellMs(6) + SAY_LINGER_MS,
    );
  });
});
