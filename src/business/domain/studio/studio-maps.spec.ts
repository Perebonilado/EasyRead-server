import {
  mendScript,
  partNames,
  type MapThing,
  type SceneScriptDraft,
} from '../scene-script';
import {
  AFRICA_MAP,
  SLEEPING_SICKNESS_FILM,
  composeSleepingSickness,
} from './__fixtures__/sleeping-sickness';
import { checkExplainer, repairExplainer, sentBackFor } from './studio-check';
import type { ExplainerSheet } from './studio';

type Cast = SceneScriptDraft['cast'][number];

const NONE = {
  brief: null,
  motion: null,
  parts: null,
  states: null,
  shape: null,
  value: null,
  style: null,
  sound: null,
  lines: null,
  plot: null,
  quote: null,
  phrases: null,
  ref: null,
  state: null,
  timeline: null,
  chart: null,
} as const;

const drawing = (id: string, name: string, brief: string): Cast => ({
  ...NONE,
  id,
  kind: 'drawing',
  name,
  brief,
  parts: [],
  states: [],
  shape: 'square',
});

const draftOf = (cast: Cast[], effects: string[] = []): SceneScriptDraft => ({
  fit: 'good',
  fitReason: null,
  title: 'Where it is found',
  mood: 'curious',
  beats: [
    {
      say: 'Sleeping sickness is found in the DRC, around Kinshasa.',
      pause: 'short',
      delivery: 'explain',
      speaker: null,
      music: null,
      energy: null,
    },
  ],
  cast,
  steps: [
    {
      beat: 0,
      phrase: 'Sleeping sickness is found',
      layout: 'one',
      show: [cast[0].id],
      arrows: [],
      effects: null,
    },
    ...effects.map((target) => ({
      beat: 0,
      phrase: target.split('.')[1],
      layout: null,
      show: null,
      arrows: null,
      effects: [{ target, do: 'point' as const }],
    })),
  ],
});

const sheetOf = (draft: SceneScriptDraft): ExplainerSheet => ({
  kind: 'explainer',
  title: draft.title,
  transition: 'cut',
  draft,
});

const OPTIONS = {
  teach: 'Sleeping sickness is found in the DRC, around Kinshasa.',
  stage: null,
  maths: false,
  planned: null,
};

describe('a map in a lesson', () => {
  it("is drawn by code from the writer's names, its parts pointed at", () => {
    const { script, problems } = mendScript(
      draftOf([AFRICA_MAP], ['africa.DRC', 'africa.Kinshasa']),
      { formats: ['explainer'] },
    );
    expect(problems.filter((p) => !p.includes('sentences'))).toEqual([]);
    const map = script.cast[0] as MapThing;
    expect(map.kind).toBe('map');
    expect(map.map.region.name).toBe('Africa');
    expect(partNames(map)).toEqual(
      expect.arrayContaining(['DRC', 'Uganda', 'Kinshasa', 'Kampala']),
    );
    const pointed = script.steps.flatMap((step) =>
      step.effects.map((e) => `${e.target}.${e.part}`),
    );
    expect(pointed).toEqual(['africa.DRC', 'africa.Kinshasa']);
  });

  it('leaves off what it does not know, and says so', () => {
    const { script, mended } = mendScript(
      draftOf([
        {
          ...AFRICA_MAP,
          map: {
            region: 'Africa',
            highlight: [{ name: 'Wakanda', label: true, group: null }],
            places: ['Kinshasa', 'Zenith City'],
            routes: null,
          },
        },
      ]),
      { formats: ['explainer'] },
    );
    expect(partNames(script.cast[0])).toEqual(['Kinshasa']);
    expect(mended).toEqual(
      expect.arrayContaining([
        'africa: "Wakanda" is no country or region the map knows; left off the map',
        'africa: "Zenith City" is no place the map knows; left off the map',
      ]),
    );
  });

  it('sends back a map of nowhere, and sets it in type', () => {
    const nowhere = draftOf([
      {
        ...AFRICA_MAP,
        map: { region: 'Narnia', highlight: null, places: null, routes: null },
      },
    ]);
    const { script, problems } = mendScript(nowhere, {
      formats: ['explainer'],
    });
    expect(script.cast[0].kind).toBe('words');
    expect(problems[0]).toMatch(/^The map "africa" names no place code knows/);
    const repaired = repairExplainer(sheetOf(nowhere), OPTIONS);
    expect(repaired.draft.cast[0].kind).toBe('words');
  });

  it("never lets the artist draw a real place's map", () => {
    const draft = draftOf([
      drawing(
        'where',
        'Where sleeping sickness is found',
        'A map of Africa with the DRC and Uganda shaded, Kinshasa marked.',
      ),
    ]);
    // Sent back once, to be written as a map ...
    const { problems } = checkExplainer(sheetOf(draft), OPTIONS);
    const back = sentBackFor(problems).map((p) => p.message);
    expect(back).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^The drawing "where" is a map of a real place/),
      ]),
    );
    // ... and drawn as one by code if it comes back the same.
    const { script, mended } = mendScript(draft, { formats: ['explainer'] });
    const map = script.cast[0] as MapThing;
    expect(map.kind).toBe('map');
    expect(map.map.region.name).toBe('Africa');
    expect(map.map.highlights.map((h) => h.countries[0])).toEqual([
      'Dem. Rep. Congo',
      'Uganda',
    ]);
    expect(map.map.places.map((p) => p.name)).toEqual(['Kinshasa']);
    expect(mended[0]).toMatch(/is a map of a real place; drawn by code/);
  });

  it('leaves a made-up map to the artist', () => {
    const draft = draftOf([
      drawing(
        'treasure',
        'Treasure map',
        'An old treasure map: an island, an X.',
      ),
    ]);
    expect(
      checkExplainer(sheetOf(draft), OPTIONS).problems.some((p) =>
        p.message.includes('map of a real place'),
      ),
    ).toBe(false);
    expect(
      mendScript(draft, { formats: ['explainer'] }).script.cast[0].kind,
    ).toBe('drawing');
  });

  it('composes the sleeping-sickness piece in both shapes, its maps drawn by code', async () => {
    expect(SLEEPING_SICKNESS_FILM.scenes).toHaveLength(2);
    for (const shape of ['wide', 'tall'] as const) {
      const [first, second] = await composeSleepingSickness(shape);
      const africa = first.scene.things.find((t) => t.id === 'africa');
      expect(africa).toMatchObject({ kind: 'drawing', source: 'map' });
      if (africa?.kind !== 'drawing') throw new Error('no map');
      // Two groups' colours and their key, and the names it writes.
      expect(africa.svg).toContain('>West and Central African form</text>');
      expect(africa.svg).toContain('>Kinshasa</text>');
      expect(Object.keys(africa.labels)).toEqual(
        expect.arrayContaining([
          'DRC',
          'Uganda',
          'Malawi',
          'Kinshasa',
          'Kampala',
        ]),
      );
      // The voice's points land on the map's parts.
      const points = first.scene.effects
        .filter((e) => e.do === 'point' && e.target === 'africa')
        .map((e) => e.part);
      expect(points).toEqual([
        'Sahara',
        'DRC',
        'Kinshasa',
        'Uganda',
        'Kampala',
        'Malawi',
      ]);
      for (const part of points) expect(africa.parts[part!]).toBeTruthy();
      // A tall film's map is square or taller than wide.
      if (shape === 'tall') expect(africa.aspect).toBeLessThanOrEqual(1.16);
      // The artist was asked for "a map of Uganda": code drew it.
      const uganda = second.scene.things.find((t) => t.id === 'uganda');
      expect(uganda).toMatchObject({ kind: 'drawing', source: 'map' });
      if (uganda?.kind !== 'drawing') throw new Error('no map');
      expect(uganda.parts['Lake Victoria']).toBeTruthy();
      expect(uganda.svg.length).toBeLessThan(72_000);
    }
  });
});
