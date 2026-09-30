import { studioTurnSchema } from './ai-sdk/studio-schemas';
import { STUDIO_PROMPTS } from './studio-prompts';

describe("the producer's instructions", () => {
  it('leaves the go-ahead to the Studio’s button, never a choice to tap', () => {
    const turn = STUDIO_PROMPTS.studioTurn;
    expect(turn).toContain(
      'The Studio shows the next step as a button; never offer the go-ahead as a choice',
    );
    expect(turn).not.toContain('"Yes, write it"');
  });

  it('reads lines from the Studio as done, and never writes one', () => {
    expect(STUDIO_PROMPTS.studioTurn).toMatch(
      /Lines from "Studio" in the conversation[^]*never write such a line yourself/,
    );
  });
});

describe('a request about one character’s look', () => {
  it('is that character drawn again, never the whole cast written again', () => {
    const turn = STUDIO_PROMPTS.studioTurn;
    expect(turn).toMatch(
      /request about one character's look[^]*is action "redraw", character[^]*their name/,
    );
    expect(turn).toContain('It is never "cast", and never the whole cast');
    expect(turn).toContain('character is null except with');
  });
});

describe('what the producer may say of a change', () => {
  it('says what it will try and that it will be checked, never that it is done', () => {
    const turn = STUDIO_PROMPTS.studioTurn;
    expect(turn).not.toContain('being done');
    expect(turn).not.toContain('Trimming scene 2 now');
    expect(turn).toContain('then make it again and');
    expect(turn).toContain(
      'Never say a change is done, fixed, sorted or happening',
    );
    expect(turn).toMatch(/A "checked" line says whether what[^]*never more/);
    // Several scenes at once, every one of them.
    expect(turn).toContain('scenes lists every one of their numbers');
    // What the stage can show now: beds, seats, clothes.
    expect(turn).toMatch(/get into bed and out of it/);
    expect(turn).toMatch(/put clothes on and take them off/);
  });

  it('tells the writer the poses, getting up first, and putting clothes on', () => {
    const scene = STUDIO_PROMPTS.studioScene;
    expect(scene).toContain('"standing", "sitting", "lying", "in bed"');
    expect(scene).toMatch(/gets up first \("stand-up"/);
    expect(scene).toMatch(/never carry clothes about/);
  });

  it('checks a remade scene by what its film shows, never its script', () => {
    const check = STUDIO_PROMPTS.studioCheck;
    expect(check).toContain('Judge only by what the film shows now.');
    expect(check).toContain('"furniture-moves"');
  });
});

describe('the brief the producer gathers', () => {
  it('chooses an idea left to it, takes a loose one as said, and never asks twice', () => {
    const turn = STUDIO_PROMPTS.studioTurn;
    expect(turn).toMatch(
      /"you pick", "surprise me", "up to you"[^]*choose it\s+yourself: invent one concrete logline/,
    );
    expect(turn).toMatch(
      /Any idea counts, however loose[^]*never ask for the idea again/,
    );
  });

  it('keeps a tone in other words to its own, and serious only when asked', () => {
    const turn = STUDIO_PROMPTS.studioTurn;
    expect(turn).toMatch(/dry, ironic, deadpan, chaotic, silly[^]*are "funny"/);
    expect(turn).toContain('"serious" only when they ask for');
  });

  it('catches a tone or a genre the model wrote in words as the one it is', () => {
    const answer = studioTurnSchema.parse({
      reply: 'A dark comedy it is.',
      brief: {
        tone: 'Dry and ironic',
        genre: 'dark comedy',
        audience: 'adults',
      },
      action: 'none',
    });
    expect(answer.brief).toMatchObject({
      tone: 'funny',
      genre: 'dark-comedy',
      audience: 'adults',
    });
    expect(
      studioTurnSchema.parse({ reply: 'Hm.', brief: { tone: 'nope' } }).brief
        .tone,
    ).toBeNull();
  });
});
