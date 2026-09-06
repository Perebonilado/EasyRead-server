import { LECTURE_TOOLS } from '../../contracts';
import { TUTORS } from './values/tutors';
import {
  askDelivery,
  askInstructions,
  askSpeed,
  conversationSoFar,
  figureKindFor,
  INVITATION_LINES,
  pageFigures,
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

  it('uses the interruption persona and never the lecture board listing or the old tools', () => {
    expect(text).toContain('stopped mid-lecture by a question');
    expect(text).not.toMatch(
      /On the whiteboard right now|board_highlight|board_note/,
    );
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
      `call ${LECTURE_TOOLS.RESUME}, the hand-back tool, after the line and never before`,
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

describe('a question mid-lecture: the board', () => {
  it('tells the tutor when and how to draw, and names every tool', () => {
    const text = askInstructions(base);
    expect(text).toContain('THE BOARD.');
    expect(text).toContain('without being asked when the idea has a shape');
    expect(text).toContain('One drawing per question');
    expect(text).not.toContain('Not on every question');
    for (const tool of [
      LECTURE_TOOLS.SHOW,
      LECTURE_TOOLS.WRITE,
      LECTURE_TOOLS.ARROW,
      LECTURE_TOOLS.CUE,
      LECTURE_TOOLS.NEW,
      LECTURE_TOOLS.DIAGRAM,
      LECTURE_TOOLS.REST,
      LECTURE_TOOLS.FIND,
    ]) {
      expect(text).toContain(tool);
    }
    expect(text).toContain('IN THREE BEATS');
    expect(text).toContain('say nothing while an item is being written');
    expect(text).toContain('setting the picture up in their words');
    expect(text).toContain('that is when you explain');
    expect(text).toContain('in the order it was drawn');
    expect(text).toContain('explain it in one go');
    expect(text).toContain('the board marks each item for you as you name it');
    expect(text).toContain(
      `do not call ${LECTURE_TOOLS.CUE} during the walk-through`,
    );
    expect(text).toContain('Your turn is not over until you have asked it');
    expect(text).not.toContain('keep explaining meanwhile');
    expect(text).toContain('never their ids');
    expect(text.indexOf('THE BOARD.')).toBeLessThan(
      text.indexOf('HOW THIS ENDS'),
    );
    expect(text).not.toContain('YOUR BOARD ON THIS PAGE');
  });

  it('reminds a returning tutor what is already on the board', () => {
    const text = askInstructions({
      ...base,
      board: [
        'L1 | heading | Consistent hashing',
        'L2 | term | Ring: servers on a circle',
      ],
    });
    expect(text).toContain('YOUR BOARD ON THIS PAGE already has');
    expect(text).toContain('L2 | term | Ring');
    expect(text).toContain('do not write what is already there again');
  });

  it('ends the board by consent, and looks things up before saying the book lacks them', () => {
    const text = askInstructions(base);
    expect(text).toContain('WHEN THE BOARD IS DONE');
    expect(text).toContain('ask whether it is clear');
    expect(text.indexOf('WHEN THE BOARD IS DONE')).toBeLessThan(
      text.indexOf('HOW THIS ENDS'),
    );
    expect(text).toContain('LOOKING THINGS UP');
    expect(text).toContain(
      'always before saying the book does not cover something',
    );
    expect(text).toContain('after looking it up, say so plainly');
  });

  it('names the pictures a page mentions, so the tutor can offer them', () => {
    expect(
      pageFigures([
        {
          type: 'paragraph',
          text: 'As Figure 5-3 shows, the ring has four servers.',
        },
        { type: 'table', text: 'server | keys\ns0 | 3' },
        { type: 'paragraph', text: 'See figure 5-3 again, and Table 2.' },
      ]),
    ).toBe('Figure 5-3; a table; Table 2');
    expect(
      pageFigures([{ type: 'paragraph', text: 'No pictures.' }]),
    ).toBeNull();
    expect(askInstructions({ ...base, figures: 'Figure 5-3' })).toContain(
      'THIS PAGE NAMES A PICTURE: Figure 5-3',
    );
    expect(askInstructions(base)).not.toContain('THIS PAGE NAMES A PICTURE');
  });

  it('opens by inviting them, unless a recorded line already has', () => {
    expect(askInstructions(base)).toContain(
      'Say one short, warm, brisk invitation to go ahead',
    );
    const invited = askInstructions({ ...base, invited: true });
    expect(invited).toContain(
      'a recorded line of yours has already invited them',
    );
    expect(invited).toContain('Say nothing until they have spoken');
    expect(invited).not.toContain('Say one short, warm, brisk invitation');
    expect(INVITATION_LINES).toHaveLength(6);
    for (const line of INVITATION_LINES) {
      expect(line.split(/\s+/).length).toBeLessThanOrEqual(4);
      expect(line).toMatch(/[.?!]$/);
    }
  });

  it('helps a learner who reaches ahead: confirm, name the answer and the page, offer to go there', () => {
    const text = askInstructions(base);
    expect(text).toContain('REACHING AHEAD');
    expect(text).toContain('First say plainly whether they are right');
    expect(text).toContain('offer to go there now or carry on in order');
    expect(text).toContain(
      'Never answer a question about what is wrong with the page by explaining the page again',
    );
    expect(text).toContain('PASSAGES THE BOOK HAS');
    expect(text).not.toContain('say it is coming in a moment');
    expect(text).not.toContain('Answer the step they are stuck on');
    expect(text).toContain('wherever in the book its answer is');
    expect(text.indexOf('REACHING AHEAD')).toBeLessThan(
      text.indexOf('GROUNDING'),
    );
  });

  it('shows the chapter page by page, behind, here and still to come', () => {
    const text = askInstructions({
      ...base,
      chapter: {
        ...base.chapter!,
        beats: [
          { pageNumber: 72, goal: 'The rehashing problem.' },
          { pageNumber: 73, goal: 'The ring.' },
          { pageNumber: 81, goal: 'Virtual nodes even out the ring.' },
        ],
      },
    });
    expect(text).toContain('THE CHAPTER, PAGE BY PAGE');
    expect(text).toContain('page 72 (behind): The rehashing problem');
    expect(text).toContain('page 73 (you are here): The ring');
    expect(text).toContain(
      'page 81 (still to come): Virtual nodes even out the ring',
    );
    expect(askInstructions(base)).not.toContain('THE CHAPTER, PAGE BY PAGE');
  });

  it('reads the shape of a drawing from the ask', () => {
    expect(figureKindFor('the steps a request goes through')).toBe('process');
    expect(figureKindFor('consistent hashing versus modular hashing')).toBe(
      'comparison',
    );
    expect(figureKindFor('the hash ring with four servers')).toBe('structure');
  });
});
