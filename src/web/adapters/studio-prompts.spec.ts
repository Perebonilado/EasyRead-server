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
