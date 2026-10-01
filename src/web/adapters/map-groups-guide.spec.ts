import { MAP_COLOURS } from '../../business/domain/scene-map';
import { MAP_GROUPS_GUIDE, PROMPTS } from './prompts';

describe("the writer's guide to areas, regions, seams and pins", () => {
  it("is part of the lesson writer's map, after the countries, places and routes", () => {
    const write = PROMPTS.sceneWrite;
    expect(write).toContain(MAP_GROUPS_GUIDE);
    expect(write.indexOf(MAP_GROUPS_GUIDE)).toBeGreaterThan(
      write.indexOf('map.routes are journeys'),
    );
  });

  it('asks for every field the map reads, and its colours by their theme names', () => {
    for (const field of [
      'map.areas',
      'map.groups',
      'map.seams',
      'map.pins',
      'map.year',
    ])
      expect(MAP_GROUPS_GUIDE).toContain(field);
    for (const colour of ['accent', 'accent2', 'good', 'bad', 'muted'])
      expect(MAP_COLOURS).toContain(colour);
    expect(MAP_GROUPS_GUIDE).toContain('chart0 to chart5');
    expect(MAP_GROUPS_GUIDE).not.toMatch(/#[0-9a-f]{3,6}\b/i);
  });

  it('never has the voice say where a thing sits on the picture', () => {
    expect(MAP_GROUPS_GUIDE).toContain('never by where it sits on the picture');
    expect(MAP_GROUPS_GUIDE).not.toMatch(
      /\b(?:on the left|on the right|at the top|at the bottom)\b/i,
    );
  });
});
