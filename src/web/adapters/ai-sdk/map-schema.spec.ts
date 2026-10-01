import { sceneScriptSchema } from './schemas';

/** A thing in the lesson writer's cast, every field null but those given. */
const thing = (more: Record<string, unknown>) => ({
  id: 'map',
  kind: 'map',
  name: 'Where it is found',
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
  figure: null,
  count: null,
  pose: null,
  signs: null,
  holding: null,
  timeline: null,
  chart: null,
  ...more,
});

/** What a map asks for beyond countries, places and routes, none of it given. */
const NONE_MORE = {
  areas: null,
  groups: null,
  seams: null,
  pins: null,
  year: null,
};

const page = (cast: unknown[]) => ({
  fit: 'good',
  fitReason: null,
  title: 'Maps',
  mood: 'curious',
  beats: [],
  steps: [],
  cast,
});

describe("the lesson writer's map", () => {
  it('takes a map by names', () => {
    const parsed = sceneScriptSchema.parse(
      page([
        thing({
          map: {
            region: 'Africa',
            highlight: [{ name: 'Kenya', label: true, group: 'Found' }],
            places: ['Nairobi'],
            routes: [{ from: 'Nairobi', to: 'Mombasa', name: null }],
          },
        }),
      ]),
    );
    expect(parsed.cast[0].kind).toBe('map');
    expect(parsed.cast[0].map).toEqual({
      region: 'Africa',
      highlight: [{ name: 'Kenya', label: true, group: 'Found' }],
      places: ['Nairobi'],
      routes: [{ from: 'Nairobi', to: 'Mombasa', name: null }],
      ...NONE_MORE,
    });
  });

  it('takes areas, named regions, seams, pins and a year, by names', () => {
    const parsed = sceneScriptSchema.parse(
      page([
        thing({
          map: {
            region: 'Germany',
            highlight: null,
            places: null,
            routes: null,
            areas: [{ name: 'Bavaria', label: true, group: null }],
            groups: [
              { name: 'East', members: ['Saxony', 'Berlin'], colour: 'chart3' },
              { name: 'West', members: null, colour: '#123456' },
            ],
            seams: [{ between: ['East', 'West'], style: 'glow' }],
            pins: [{ place: 'Berlin', label: 'Berlin', number: '1961' }],
            year: 1961,
          },
        }),
      ]),
    );
    expect(parsed.cast[0].map).toEqual({
      region: 'Germany',
      highlight: null,
      places: null,
      routes: null,
      areas: [{ name: 'Bavaria', label: true, group: null }],
      groups: [
        { name: 'East', members: ['Saxony', 'Berlin'], colour: 'chart3' },
        // A colour that is no theme colour is none: the map gives the next.
        { name: 'West', members: null, colour: null },
      ],
      seams: [{ between: ['East', 'West'], style: 'glow' }],
      pins: [{ place: 'Berlin', label: 'Berlin', number: '1961' }],
      year: 1961,
    });
    // A stray value is null, never a lost scene.
    expect(
      sceneScriptSchema.parse(
        page([
          thing({
            map: {
              region: 'Peru',
              areas: 'Cusco',
              pins: [{}],
              year: 'long ago',
            },
          }),
        ]),
      ).cast[0].map,
    ).toMatchObject({ region: 'Peru', areas: null, pins: null, year: null });
  });

  it('tolerates a map left out, half given or given wrongly', () => {
    expect(sceneScriptSchema.parse(page([thing({})])).cast[0].map).toBeNull();
    expect(
      sceneScriptSchema.parse(
        page([
          thing({ map: { region: 'Peru', highlight: [{ name: 'Peru' }] } }),
        ]),
      ).cast[0].map,
    ).toEqual({
      region: 'Peru',
      highlight: [{ name: 'Peru', label: null, group: null }],
      places: null,
      routes: null,
      ...NONE_MORE,
    });
    expect(
      sceneScriptSchema.parse(page([thing({ map: 'Africa' })])).cast[0].map,
    ).toBeNull();
  });
});
