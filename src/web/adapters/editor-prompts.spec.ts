import { EDITOR_PROMPTS, boardLessonPrompt } from './editor-prompts';
import {
  EXPLAINER_SWAPS,
  INFOGRAPHIC_KINDS_CAST,
  MAP_GROUPS_GUIDE,
  PROMPTS,
  explainerWrite,
} from './prompts';

const count = (text: string, part: string) => text.split(part).length - 1;

describe("the editor's lesson board prompt", () => {
  const prompt = boardLessonPrompt();

  it("is the writer's craft with the editor's decision rule, each guide once", () => {
    expect(prompt.startsWith(explainerWrite())).toBe(true);
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

  it('asks for no card in place of a picture, no one drawn, and a real place on the map', () => {
    for (const asked of [
      'make it a keyword instead',
      'or a keyword card where there is nothing to draw',
      '"person" is a human being the page shows',
      'a scene with people (or a drawing)',
      'draw it as one drawing',
    ])
      expect(prompt).not.toContain(asked);
    expect(prompt).toContain('No one is drawn');
    expect(prompt).toContain('never anyone standing in for the viewer');
    expect(prompt).toContain('(map.pins)');
    expect(prompt).toContain('Never a keyword card standing in for a picture');
  });
});

describe("an explainer's writer's craft (explainerWrite)", () => {
  it("is the book's craft with each card and people passage told the explainer's way", () => {
    const write = explainerWrite();
    for (const [book, explainer] of EXPLAINER_SWAPS) {
      // Each passage is still the book's own (so none goes unswapped)...
      expect(
        typeof book === 'string'
          ? PROMPTS.sceneWrite.includes(book)
          : book.test(PROMPTS.sceneWrite),
      ).toBe(true);
      // ...and the explainer's is told the other way.
      expect(write).toContain(explainer);
      if (typeof book === 'string') expect(write).not.toContain(book);
      else expect(book.test(write)).toBe(false);
    }
    expect(write).not.toContain('Dress each person for the part');
    // A book's page, story or lesson, keeps its writer's words.
    expect(PROMPTS.sceneWrite).toContain('make it a keyword instead');
    expect(PROMPTS.sceneWrite).toContain('"person" is a human being');
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
