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
    });
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
    });
    expect(
      sceneScriptSchema.parse(page([thing({ map: 'Africa' })])).cast[0].map,
    ).toBeNull();
  });
});
