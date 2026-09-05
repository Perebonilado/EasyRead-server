import { LECTURE_TOOLS } from '../../contracts';
import { askDelivery, askInstructions, askSpeed, type AskContext } from './ask';

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

  it('ends with the protocol, and names the one tool', () => {
    const ending = text.indexOf('HOW THIS ENDS');
    expect(ending).toBeGreaterThan(text.indexOf('GROUNDING'));
    expect(text).toContain('ask one short check');
    expect(text).toContain(`The hand-back tool is ${LECTURE_TOOLS.RESUME}`);
    expect(text).toContain('It is the only tool');
    expect(text).toContain('Call it only after your closing line');
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

  it('answers for the learner it has: slower and plainer, quicker and shorter', () => {
    expect(askDelivery('gentle')).toContain('One idea per answer');
    expect(askDelivery('brisk')).toContain('shortest true answer');
    expect(askDelivery('steady')).toContain('two to four sentences');
    expect(askSpeed('gentle')).toBeLessThan(1);
    expect(askSpeed('steady')).toBe(1);
    expect(askSpeed('brisk')).toBeGreaterThan(1);
    expect(askInstructions({ ...base, style: 'gentle' })).toContain(
      'This learner learns slowly',
    );
  });
});
