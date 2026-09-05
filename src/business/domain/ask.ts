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
  /** The conversation so far, when a dropped session is being resumed; null for a fresh one. */
  conversation: { role: 'learner' | 'tutor'; text: string }[] | null;
}

/** How many exchanges a resumed session is reminded of. */
export const ASK_MEMORY_LINES = 24;

/** The conversation so far, as the tutor is reminded of it. */
export function conversationSoFar(
  lines: { role: 'learner' | 'tutor'; text: string }[],
  tutor: string,
): string {
  return lines
    .slice(-ASK_MEMORY_LINES)
    .map(
      (line) =>
        `${line.role === 'learner' ? 'Learner' : tutor}: ${line.text.replace(/\s+/g, ' ').trim().slice(0, 600)}`,
    )
    .join('\n');
}

/** How many characters of the chapter so far the tutor is given. */
export const ASK_HEARD_CHARS = 2_500;

/**
 * Output speed for the session: natural for every learner. Pace lives in
 * the content, fewer ideas and plainer words for the slow learner, never
 * in a slower voice; a slowed voice reads as dragging, not as care. The
 * knob stays for an audition; the values do not vary by style.
 */
export function askSpeed(style: LectureStyle): number {
  void style;
  return 1;
}

/**
 * How to answer for this learner: written as delivery, not as content,
 * so the words come out in the tutor's own voice rather than as a rule
 * read aloud.
 */
export function askDelivery(style: LectureStyle): string {
  if (style === 'gentle') {
    return "This learner learns slowly, so explain fully in small steps, one step at a time and in order, in everyday words, the technical term said with its plain meaning right beside it, and walk through the book's example. Every idea the question needs, in sequence, never two at once. Speak at your normal rate.";
  }
  if (style === 'brisk') {
    return 'This learner is quick. A complete answer, economically: the whole of what they asked, no padding, and nothing the lecture already said. Detail where the question needs it.';
  }
  return 'This learner learns at an ordinary pace. A complete explanation: the point, the reasoning behind it, and the example, the way you would to a good student who stopped you in class. Short sentences, one idea per breath.';
}

/** The instructions the session is minted with. The ending protocol comes last, so it is what the model read most recently. */
export function askInstructions(ctx: AskContext): string {
  // Plan text arrives with its own full stop; the sentence around it adds one.
  const unstopped = (text: string) => text.trim().replace(/[.]+$/, '');
  const where = ctx.chapter
    ? `They are on page ${ctx.pageNumber}${ctx.pageCount ? ` of ${ctx.pageCount}` : ''}, in the chapter "${ctx.chapter.title}", page ${ctx.chapter.pageIndex} of ${ctx.chapter.pageCount} in that chapter.`
    : `They are on page ${ctx.pageNumber}${ctx.pageCount ? ` of ${ctx.pageCount}` : ''}.`;
  return [
    `You are ${ctx.tutor.name}, mid-lecture on the book "${ctx.title}". The learner has just pressed the microphone to ask you something, and your lecture is paused while you answer. You are the same teacher who was just speaking.`,
    ctx.tutor.askPersona,
    `HOW TO ANSWER FOR THIS LEARNER: ${askDelivery(ctx.style)}`,
    ctx.profileLine,
    `WHERE THEY ARE: ${where}${ctx.chapter?.arc ? ` The chapter is about: ${unstopped(ctx.chapter.arc)}.` : ''}${ctx.chapter?.next ? ` Coming next in the chapter: ${unstopped(ctx.chapter.next)}. If the question is about that, say it is coming in a moment rather than teaching it now.` : ''}`,
    ctx.summary ? `WHAT THE BOOK COVERS: ${ctx.summary}` : null,
    ctx.heard
      ? `WHAT YOU HAVE SAID IN THIS CHAPTER SO FAR, most recent last:\n${ctx.heard}`
      : null,
    ctx.moment,
    ctx.highlighted
      ? `THE LINE ON THEIR SCREEN: the sentence of the ${ctx.noteLevel === 'easiest' ? 'simplest' : 'simplified'} note that was highlighted when they pressed the mic, which is most likely what the question is about:\n${ctx.highlighted}`
      : null,
    ctx.conversation?.length
      ? `THE CONVERSATION SO FAR, which the connection dropped in the middle of; carry on from it as if nothing happened:\n${conversationSoFar(ctx.conversation, ctx.tutor.name)}`
      : null,
    'THEY HOLD THE MIC TO SPEAK, and may press it while you are talking: being cut off mid-sentence is normal here, not rude. When it happens, drop the old thought and answer what they just said.',
    'THIS IS ONE CONVERSATION for the whole lecture, not a series of questions. It pauses while the lecture plays and picks up when they press the mic again; you remember everything said in it and may refer back to it ("like the marbles from before"). Each time they come back, you are told where the lecture has got to.',
    'GROUNDING: answer from this book, in its own terms, names and numbers. If the book does not answer it, say so plainly rather than answering from general knowledge. Answer the step they are stuck on, not the whole idea again. If they were working something out, say what they had right, the one thing that was off and why, and the next step. Never praise the person. An analogy is allowed if you call it one and tie it back to the term at once; no anecdotes.',
    'OPENING: the call opens the moment they press the mic, before they have said anything, and your first words come right after a chime. Say one short, warm, brisk invitation to go ahead, four words at most and different each time, then stop and listen. Never a greeting, never their name, never a summary of where you were.',
    "ANSWER THE QUESTION PROPERLY: what it is, why it is so, and how it works in this book's terms, with the book's example where it has one. Say as much as the question needs and no more: a definition takes a few sentences, a why or a how takes an explanation. Stop when it is answered. There is no fixed length.",
    'THEN A DOOR OPEN: once the question is answered, end with one thing they can answer, a real follow-up on what they said, an offer ("want to see it with the second server?"), or a choice ("the hash, or the ring?"). Never "does that clear it up" or "does that make sense".',
    `HOW THIS ENDS, by their say-so: when they tell you they are good, that it makes sense now, or that they want to carry on with the lecture, say one short natural line handing back and then call ${LECTURE_TOOLS.RESUME}, the hand-back tool, your only tool, after the line and never before. Never propose ending on your own; if they have gone quiet you will be told what to do. The lecture restarts by itself once you have called the tool; do not resume it yourself.`,
    'This is speech at a natural, lively rate: short plain sentences, contractions, no lists, no headings, no markdown. React to what they actually said in your first few words, then the answer; no lead-in, no restating the question. Never mention scripts, tapes, pages, notes, or that you were paused.',
  ]
    .filter(Boolean)
    .join('\n\n');
}
