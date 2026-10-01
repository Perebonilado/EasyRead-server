import { EDITOR_PROMPTS, boardLessonPrompt } from './editor-prompts';
import { INFOGRAPHIC_KINDS_CAST, MAP_GROUPS_GUIDE, PROMPTS } from './prompts';

const count = (text: string, part: string) => text.split(part).length - 1;

describe("the editor's lesson board prompt", () => {
  const prompt = boardLessonPrompt();

  it("is the writer's craft with the editor's decision rule, each guide once", () => {
    expect(prompt.startsWith(PROMPTS.sceneWrite)).toBe(true);
    expect(count(prompt, INFOGRAPHIC_KINDS_CAST)).toBe(1);
    expect(count(prompt, MAP_GROUPS_GUIDE)).toBe(1);
    expect(prompt).toContain(
      "Choose each line's picture by what the line is about.",
    );
    for (const kind of [
      'counter',
      'icons',
      'namecard',
      'calendar',
      'split',
      'strike',
      'document',
      'seats',
      'transfer',
    ])
      expect(prompt).toContain(kind);
  });

  it('keeps the narration as written, and teaches, never describes', () => {
    expect(prompt).toContain('word for word');
    expect(prompt).not.toMatch(/#[0-9a-f]{6}\b/i);
  });
});

describe("the editor's script prompts", () => {
  it('say plainly that say is spoken and show is seen, and people go by their names', () => {
    expect(EDITOR_PROMPTS.script).toContain(
      'say is only what the narrator speaks aloud; show is only what is',
    );
    expect(EDITOR_PROMPTS.script).toContain('never an id');
    expect(EDITOR_PROMPTS.read).toContain('is a stage');
  });
});
