import { LECTURE_TOOLS } from '../../contracts';
import { TUTORS } from './values/tutors';
import {
  askDelivery,
  askInstructions,
  askSpeed,
  conversationSoFar,
  type AskContext,
} from './ask';

const base: AskContext = {
  tutor: {
    name: 'Sam',
    askPersona: 'You are Sam, stopped mid-lecture by a question.',
  },
  title: 'System Design Interview',
  summary: 'How large systems are designed, one problem per chapter.',
  style: 'steady',
  noteLevel: 'standard',
  pageNumber: 73,
  pageCount: 312,
  chapter: {
    title: 'Design Consistent Hashing',
    pageIndex: 3,
    pageCount: 16,
    arc: 'From rehashing pain to a ring that barely moves.',
    next: 'Virtual nodes even out the ring.',
  },
  heard: 'When server 1 goes offline, only three servers are left.',
  moment:
    'THE SENTENCE YOU WERE SAYING when they pressed the mic (marked >>), with the ones before it:\n>> We use a method called the modular operation.',
  highlighted:
    'We use a method called the modular operation, which helps us divide the keys among the remaining servers.',
  profileLine: 'ABOUT THIS LEARNER, from earlier lessons: examples land best.',
  conversation: null,
};

describe('a question mid-lecture: what the tutor is told', () => {
  const text = askInstructions(base);

  it('says who, where in the book, and what is coming', () => {
    expect(text).toContain('You are Sam, mid-lecture on the book');
    expect(text).toContain('page 73 of 312');
    expect(text).toContain('"Design Consistent Hashing", page 3 of 16');
    expect(text).toContain('The chapter is about: From rehashing pain');
    expect(text).toContain('Coming next in the chapter: Virtual nodes');
  });

  it('carries the moment, the lit sentence, the chapter so far and the learner', () => {
    expect(text).toContain('>> We use a method called the modular operation.');
    expect(text).toContain('THE LINE ON THEIR SCREEN');
    expect(text).toContain('divide the keys among the remaining servers');
    expect(text).toContain('WHAT YOU HAVE SAID IN THIS CHAPTER SO FAR');
    expect(text).toContain('examples land best');
  });

  it('uses the interruption persona and never the whiteboard', () => {
    expect(text).toContain('stopped mid-lecture by a question');
    expect(text).not.toMatch(/whiteboard|board_/i);
    expect(text).not.toContain('SPEAK SLOWLY');
  });

  it('is one conversation that keeps the door open and ends by consent', () => {
    expect(text).toContain('THIS IS ONE CONVERSATION for the whole lecture');
    expect(text).toContain('being cut off mid-sentence is normal here');
    expect(text).toContain('you remember everything said in it');
    expect(text).toContain('ANSWER THE QUESTION PROPERLY');
    expect(text).toContain('Stop when it is answered');
    expect(text.indexOf('THEN A DOOR OPEN')).toBeGreaterThan(
      text.indexOf('ANSWER THE QUESTION PROPERLY'),
    );
    expect(text).toContain('There is no fixed length');
    expect(text).toContain('Never "does that clear it up"');
    expect(text).not.toContain('ask one short check');
    const ending = text.indexOf('HOW THIS ENDS');
    expect(ending).toBeGreaterThan(text.indexOf('GROUNDING'));
    expect(text).toContain('by their say-so');
    expect(text).toContain('Never propose ending on your own');
    expect(text).toContain(
      `call ${LECTURE_TOOLS.RESUME}, the hand-back tool, your only tool, after the line and never before`,
    );
  });

  it('reminds a resumed session of the conversation so far', () => {
    const lines = [
      { role: 'learner' as const, text: 'What is a  virtual node?' },
      {
        role: 'tutor' as const,
        text: 'A server split into pieces on the ring. Want the example?',
      },
    ];
    expect(conversationSoFar(lines, 'Sam')).toBe(
      'Learner: What is a virtual node?\nSam: A server split into pieces on the ring. Want the example?',
    );
    const resumed = askInstructions({ ...base, conversation: lines });
    expect(resumed).toContain('THE CONVERSATION SO FAR');
    expect(resumed).toContain('Sam: A server split');
    expect(text).not.toContain('THE CONVERSATION SO FAR');
  });

  it('leaves out what it does not have', () => {
    const bare = askInstructions({
      ...base,
      summary: null,
      chapter: null,
      heard: '',
      moment: null,
      highlighted: null,
      profileLine: null,
    });
    expect(bare).toContain('They are on page 73 of 312.');
    expect(bare).not.toContain('WHAT THE BOOK COVERS');
    expect(bare).not.toContain('THE LINE ON THEIR SCREEN');
    expect(bare).not.toContain('ABOUT THIS LEARNER');
  });

  it('answers for the learner it has: less and plainer, or shorter, never slower', () => {
    expect(askDelivery('gentle')).toContain('explain fully in small steps');
    expect(askDelivery('brisk')).toContain('A complete answer');
    expect(askDelivery('steady')).toContain('A complete explanation');
    for (const style of ['gentle', 'steady', 'brisk'] as const) {
      expect(askSpeed(style)).toBe(1);
      // Pace lives in the content: nothing here names a tempo.
      expect(askDelivery(style)).not.toMatch(/pause|beat|unhurried|slow down/i);
    }
    expect(askInstructions({ ...base, style: 'gentle' })).toContain(
      'This learner learns slowly',
    );
  });

  it("no tutor's interruption persona names a tempo, and each leads with the answer then explains", () => {
    for (const tutor of TUTORS) {
      expect(tutor.askPersona).not.toMatch(
        /unhurried|slow|pause|take your time/i,
      );
      expect(tutor.askPersona).toContain('Lead with the answer');
      expect(tutor.askPersona).toContain('explain it');
      expect(tutor.askPersona).toContain('No lead-in');
    }
  });

  it('nothing asks for a short answer: not the instructions, not a persona, not a style', () => {
    const clipped =
      /\bbrief\b|shortest|first sentence|at most (?:one|two|three|four|five|\d)/i;
    expect(text).not.toMatch(clipped);
    for (const style of ['gentle', 'steady', 'brisk'] as const) {
      expect(askDelivery(style)).not.toMatch(clipped);
    }
    for (const tutor of TUTORS) expect(tutor.askPersona).not.toMatch(clipped);
  });
});
