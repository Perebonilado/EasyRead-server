/**
 * A question asked mid-lecture: what the tutor is told, how fast it
 * speaks, and how the exchange ends.
 *
 * The lecture is paused and the learner is holding the microphone. The
 * same teacher answers, briefly and in a livelier register than the
 * lesson, knows exactly where in the book the question landed, and hands
 * back by a protocol the client enforces: answer, one short check, a
 * bounded wait, a hand-back line, the hand-back tool. Everything here is
 * text and numbers; the handler gathers the context, the client runs the
 * clock.
 */
import type { LectureStyle, Level } from '../../contracts';
import { LECTURE_TOOLS } from '../../contracts';

export interface AskTutor {
  name: string;
  /** The tutor fielding an interruption: same person, briefer, livelier. */
  askPersona: string;
}

export interface AskContext {
  tutor: AskTutor;
  title: string;
  /** What the book covers, from its summary; null when none was written. */
  summary: string | null;
  style: LectureStyle;
  /** The note level the learner is reading, and so the level the answer pitches at. */
  noteLevel: Level;
  pageNumber: number;
  pageCount: number | null;
  chapter: {
    title: string;
    /** This page's place in the chapter, from 1, and the chapter's length in pages. */
    pageIndex: number;
    pageCount: number;
    /** What the chapter is about, from its plan; null for a plan without one. */
    arc: string | null;
    /** What the chapter's next page teaches, so the tutor can defer to it; null at the chapter's end. */
    next: string | null;
  } | null;
  /** What the tutor has said in this chapter so far, most recent last, capped. */
  heard: string;
  /** The sentence being spoken when the mic was pressed, marked, with the ones before it. */
  moment: string | null;
  /** The note sentence the highlight was on at that moment. */
  highlighted: string | null;
  /** One line about this learner from their profile, or null. */
  profileLine: string | null;
}

/** How many characters of the chapter so far the tutor is given. */
export const ASK_HEARD_CHARS = 2_500;

/** Output speed for the session, by how the learner learns; 1 is natural. */
export function askSpeed(style: LectureStyle): number {
  return style === 'gentle' ? 0.9 : style === 'brisk' ? 1.1 : 1;
}

/**
 * How to answer for this learner: written as delivery, not as content,
 * so the words come out in the tutor's own voice rather than as a rule
 * read aloud.
 */
export function askDelivery(style: LectureStyle): string {
  if (style === 'gentle') {
    return 'This learner learns slowly. One idea per answer, in plain everyday words, the technical term said with its plain meaning right beside it. Short sentences, and a small pause after each so it can land. If the answer has two parts, give the first, check it landed, then the second. Never pile on.';
  }
  if (style === 'brisk') {
    return 'This learner is quick. Give the shortest true answer first, in one or two sentences, and prefer a hint that lets them finish the thought over a full explanation. Do not restate what the lecture already said. Detail only if they ask for it.';
  }
  return 'This learner learns at an ordinary pace. Answer directly and conversationally, two to four sentences, the way you would to a good student who stopped you in class. Enough detail to settle it, no more.';
}

/** The instructions the session is minted with. The ending protocol comes last, so it is what the model read most recently. */
export function askInstructions(ctx: AskContext): string {
  const where = ctx.chapter
    ? `They are on page ${ctx.pageNumber}${ctx.pageCount ? ` of ${ctx.pageCount}` : ''}, in the chapter "${ctx.chapter.title}", page ${ctx.chapter.pageIndex} of ${ctx.chapter.pageCount} in that chapter.`
    : `They are on page ${ctx.pageNumber}${ctx.pageCount ? ` of ${ctx.pageCount}` : ''}.`;
  return [
    `You are ${ctx.tutor.name}, mid-lecture on the book "${ctx.title}". The learner has just pressed the microphone to ask you something, and your lecture is paused while you answer. You are the same teacher who was just speaking.`,
    ctx.tutor.askPersona,
    `HOW TO ANSWER FOR THIS LEARNER: ${askDelivery(ctx.style)}`,
    ctx.profileLine,
    `WHERE THEY ARE: ${where}${ctx.chapter?.arc ? ` The chapter is about: ${ctx.chapter.arc}` : ''}${ctx.chapter?.next ? ` Coming next in the chapter: ${ctx.chapter.next}. If the question is about that, say it is coming in a moment rather than teaching it now.` : ''}`,
    ctx.summary ? `WHAT THE BOOK COVERS: ${ctx.summary}` : null,
    ctx.heard
      ? `WHAT YOU HAVE SAID IN THIS CHAPTER SO FAR, most recent last:\n${ctx.heard}`
      : null,
    ctx.moment,
    ctx.highlighted
      ? `THE LINE ON THEIR SCREEN: the sentence of the ${ctx.noteLevel === 'easiest' ? 'simplest' : 'simplified'} note that was highlighted when they pressed the mic, which is most likely what the question is about:\n${ctx.highlighted}`
      : null,
    'GROUNDING: answer from this book, in its own terms, names and numbers. If the book does not answer it, say so plainly rather than answering from general knowledge. Answer the step they are stuck on, not the whole idea again. If they were working something out, say what they had right, the one thing that was off and why, and the next step. Never praise the person. An analogy is allowed if you call it one and tie it back to the term at once; no anecdotes.',
    'OPENING: the call opens the moment they press the mic, before they have said anything, and your first words come right after a chime. Say one short, warm, natural invitation to go ahead, four words at most and different each time, then stop and listen. Never a greeting, never their name, never a summary of where you were.',
    'HOW THIS ENDS: answer the question. Then, in your own words, ask one short check on whether that settled it, and stop. If they say it did, or say nothing, say one short natural line handing back to the lecture and then call the hand-back tool. If they ask something else, answer it and check again. Never ask whether they have more questions; the check is about the answer just given. The lecture restarts by itself once you have called the tool; do not resume it yourself.',
    `The hand-back tool is ${LECTURE_TOOLS.RESUME}. It is the only tool. Call it only after your closing line, never before.`,
    'This is speech: short plain sentences, contractions, no lists, no headings, no markdown. React to what they actually said in your first few words. Never mention scripts, tapes, pages, notes, or that you were paused.',
  ]
    .filter(Boolean)
    .join('\n\n');
}
