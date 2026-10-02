import { briefOf, explainerSheetOf } from '../../business/domain/studio/studio';
import type { StudioBible } from '../../business/domain/studio/studio';
import type { EditorWorld } from '../../business/domain/studio/studio-editor';
import {
  LINES,
  PALETTE,
  PLAN,
  REGISTRY,
} from '../../business/domain/shots/__fixtures__/regional-turn';
import type {
  StudioEpisodeRecord,
  StudioSceneRecord,
  StudioShowRecord,
} from '../../business/repositories/studio.repository';
import { explainerScripts, studioMakeOf } from './studio.processor';

/**
 * An editor's episode with one scene the board wrote as shots and one as
 * today's storyboard: the make reads each from its stored sheet, never
 * from the switch, and gives the shots engine only the scene of shots.
 */
const at = new Date('2026-10-02T10:00:00Z');
const world = {
  era: 'modern',
  region: 'Nigeria',
  palette: PALETTE,
  held: { token: 'chart5', for: 'the payoff' },
  legend: '',
  picture: 'the map of the three regions',
  base: { kind: 'map', region: 'Nigeria', groups: [], seams: [] },
  places: [],
  people: [],
  things: [],
} as unknown as EditorWorld;
const bible = {
  characters: [],
  sets: [],
  world: null,
  subject: 'history: the regional turn',
  maths: false,
} as unknown as StudioBible;
const show = {
  id: 'show-1',
  userId: 'u1',
  title: 'Nigeria’s Road',
  format: 'explainer',
  brief: briefOf({
    format: 'explainer',
    idea: 'how Nigeria’s regions shaped independence',
    audience: 'adults',
    minutes: 3,
  }),
  bible,
  editor: { world },
  createdAt: at,
  updatedAt: at,
} as unknown as StudioShowRecord;
const episode = {
  id: 'ep-1',
  showId: 'show-1',
  userId: 'u1',
  number: 1,
  title: 'The Regional Turn',
  logline: null,
  phase: 'script',
  busy: null,
  error: null,
  outline: {
    title: 'The Regional Turn',
    logline: '',
    scenes: [
      {
        title: 'Pressure Turns Regional',
        summary: '',
        seconds: 45,
        teach: 'Regions',
        points: ['three regions', 'the 1951 constitution'],
      },
      {
        title: 'Three Timelines',
        summary: '',
        seconds: 40,
        teach: 'Timelines',
        points: [],
      },
    ],
  },
  shareToken: null,
  durationMs: null,
  thumbKey: null,
  createdAt: at,
  updatedAt: at,
} as unknown as StudioEpisodeRecord;

const draft = (lines: readonly string[]) => ({
  fit: 'good',
  fitReason: null,
  title: 'A scene',
  mood: 'serious',
  pace: 'infographic',
  beats: lines.map((say) => ({
    say,
    pause: 'short',
    delivery: 'explain',
    speaker: null,
    music: null,
    energy: null,
  })),
  cast: [],
  steps: [],
});
const shotsSheet = explainerSheetOf({
  kind: 'explainer',
  title: 'Pressure Turns Regional',
  transition: 'cut',
  draft: draft(LINES),
  engine: 'shots',
  shots: PLAN,
  registry: REGISTRY,
  rowClaims: LINES.map(() => ['c1']),
});
const todaySheet = explainerSheetOf({
  kind: 'explainer',
  title: 'Three Timelines',
  transition: 'cut',
  draft: {
    ...draft([
      'The East wanted independence in 1956.',
      'The North wanted more time.',
    ]),
    cast: [
      {
        id: 'east',
        kind: 'words',
        name: 'East',
        words: { text: '1956', style: 'keyword' },
      },
    ],
    steps: [{ beat: 0, phrase: 'The East', layout: 'one', show: ['east'] }],
  },
});
const rows = [shotsSheet, todaySheet].map(
  (sheet, position) =>
    ({
      id: `row-${position}`,
      episodeId: 'ep-1',
      position,
      sheet,
      status: 'ready',
    }) as StudioSceneRecord,
);

describe('the make of an editor’s scene of shots', () => {
  const of = studioMakeOf(show, episode, rows[0], rows, bible);

  it('hands the shots engine the stored plan, what it may name and the show’s world', () => {
    expect(of.shots).toBeDefined();
    expect(of.shots!.plan).toEqual(PLAN);
    expect(of.shots!.registry).toEqual(REGISTRY);
    expect(of.shots!.rowClaims[0]).toEqual(['c1']);
    expect(of.shots!.world).toEqual({
      palette: PALETTE,
      held: 'chart5',
      base: world.base,
    });
    // The episode's first scene: its first change by a second and a half.
    expect(of.shots!.first).toBe(true);
    expect(of.shots!.seed).toBe('row-0');
  });

  it('voices its lines word for word, with no things to check and nothing for the artist', () => {
    expect(of.script!.beats.map((b) => b.say)).toEqual(LINES);
    expect(of.script!.cast).toEqual([]);
    expect(of.script!.steps).toEqual([]);
    expect(of.drawn).toBeUndefined();
    expect(of.pace).toBeDefined();
    expect(of.story).toBeNull();
  });

  it('marks its ideas as a lesson’s are, for the scrubber', () => {
    const scene = {
      beats: LINES.map((text) => ({ text, startMs: 0, endMs: 0, words: [] })),
    } as never;
    const finished = of.finish!(scene) as { ideas?: unknown[] };
    expect(finished.ideas?.length).toBeGreaterThan(0);
  });

  it('leaves today’s storyboard as it was, and keeps a scene of shots out of any build', () => {
    const today = studioMakeOf(show, episode, rows[1], rows, bible);
    expect(today.shots).toBeUndefined();
    expect(today.script!.cast.length).toBeGreaterThan(0);
    const scripts = explainerScripts(show, episode, rows, bible);
    expect(scripts(0)).toBeNull();
    expect(scripts(1)).not.toBeNull();
  });

  it('is read from the sheet, never the switch: a plan without its switch is today’s storyboard', () => {
    const half = explainerSheetOf({ ...shotsSheet, engine: undefined });
    const row = { ...rows[0], sheet: half } as StudioSceneRecord;
    expect(
      studioMakeOf(show, episode, row, [row, rows[1]], bible).shots,
    ).toBeUndefined();
  });
});
