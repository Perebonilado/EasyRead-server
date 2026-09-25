/**
 * The story truth set: short passages from the books the fixes were made
 * for (Hide-and-Seek, and Matthew in the NET translation), each quote's
 * speaker labelled by hand from the book. Every line the text reader gives
 * a speaker must be the right one; a line it cannot settle is left to the
 * writer, who reads the page whole.
 */
import { bookLines } from './scene-screenplay';
import type { Speaker } from './scene-dialogue';

const HIDE: Speaker[] = [
  { id: 'james', names: ['James'], gender: 'm' },
  { id: 'sally', names: ['Sally'], gender: 'f' },
  { id: 'mark', names: ['Mark'], gender: 'm' },
  {
    id: 'marks-father',
    names: ["Mark's father", 'Mark’s father', 'Marks dad'],
    gender: 'm',
  },
  { id: 'sallys-mother', names: ["Sally's mother"], gender: 'f' },
];

const MATTHEW: Speaker[] = [
  { id: 'jesus', names: ['Jesus'], gender: 'm' },
  { id: 'centurion', names: ['Centurion'], gender: 'm' },
  {
    id: 'man-with-leprosy',
    names: ['Man with leprosy', 'man with leprosy'],
    gender: 'm',
  },
  { id: 'disciples', names: ['Disciples', 'disciples'], group: true },
];

/** Each quote, as "speaker: its first words", the speaker "-" where the text does not settle it. */
const said = (text: string, cast: Speaker[]) =>
  bookLines(text, cast).map(
    (line) =>
      `${line.speaker ?? '-'}: ${line.text.split(' ').slice(0, 4).join(' ')}`,
  );

describe('the story truth set: Hide-and-Seek', () => {
  it('knows who says each line where the book says', () => {
    const page4 =
      '“I guess I’ll just go home,” Mark said in a sad voice. “Aww come on,” replied James. “We still have time for another game of – of something.” Then Sally said, “I have an idea! Let’s play Hide-and Seek.”';
    expect(said(page4, HIDE)).toEqual([
      'mark: I guess I’ll just',
      'james: Aww come on,',
      'james: We still have time',
      'sally: I have an idea!',
    ]);
  });

  it('goes on with the one whose tag stands between two quotes, not the one named after', () => {
    const page10 =
      '“Keep yelling Sally,” James screamed. “That way we can find you.” Sally heard her brother and kept screaming.';
    expect(said(page10, HIDE)).toEqual([
      'james: Keep yelling Sally,',
      'james: That way we can',
    ]);
  });

  it('never gives a line the tag of the quote beside it', () => {
    const page5 =
      '“I was just going to say that,” James said. “Yah, I’ll bet,” replied his sister. “Do not!” James said in a loud voice. “Do too,” yelled Sally.';
    // "replied his sister": the story has no name for her there; the
    // writer, reading the page whole, says who.
    expect(said(page5, HIDE)).toEqual([
      'james: I was just going',
      '-: Yah, I’ll bet,',
      'james: Do not!',
      'sally: Do too,',
    ]);
    const page21 =
      '“Whatever happened to ‘finders-keepers’?” she mumbled. “What did you say Sally?” her mother asked. “Oh, nothing.” Sally replied.';
    expect(said(page21, HIDE)[1]).toBe('-: What did you say');
  });

  it('gives Mark’s father his own lines, and a new line’s quote to no one it cannot know', () => {
    const page12 = [
      '“What’s wrong?” James yelled. “There’s something down here with me,” Sally replied in a shaky voice. Just then, Mark and his dad came running through the woods. Mark’s father knelt down and asked Sally if she was okay. He could hear her crying and sobbing. “Sally, are you hurt?” he asked. “No,” she said. “But I’m scared and there is something down here with me.”',
      '“Stand back Sally. I am lowering a rope and will be down with you in a second.”',
    ].join('\n');
    expect(said(page12, HIDE)).toEqual([
      'james: What’s wrong?',
      'sally: There’s something down here',
      'marks-father: Sally, are you hurt?',
      'sally: No,',
      'sally: But I’m scared and',
      '-: Stand back Sally. I',
    ]);
    const page18 =
      '“We’re rich,” the boys screamed. “Not quite,” interrupted Mark’s father. “I’ll share it,” Sally said happily. “That’s nice Sally,” replied Marks dad.';
    expect(said(page18, HIDE)).toEqual([
      '-: We’re rich,',
      'marks-father: Not quite,',
      'sally: I’ll share it,',
      'marks-father: That’s nice Sally,',
    ]);
  });

  it('finds who was going to say it: "Just as Mark was going to say, …"', () => {
    const page25 =
      '“Is not,” Sally said in an angered voice. Just as Mark was going to say, “They are at it again,” Sally said, “This is why there isn’t an extra 1/6!”';
    expect(said(page25, HIDE)).toEqual([
      'sally: Is not,',
      'mark: They are at it',
      'sally: This is why there',
    ]);
  });
});

describe('the story truth set: Matthew', () => {
  it('gives the leper and the centurion their own lines, never Jesus', () => {
    const page13 = [
      'A man with leprosy approached, and bowed low before him, saying, “Lord, if you are willing, you can make me clean.” He stretched out his hand and touched him saying, “I am willing. Be clean!” Immediately his leprosy was cleansed.',
      'When he entered Capernaum, a centurion came to him asking for help: “Lord, my servant is lying at home paralyzed, in terrible anguish.” Jesus said to him, “I will come and heal him.” But the centurion replied, “Lord, I am not worthy to have you come under my roof.”',
    ].join('\n');
    expect(said(page13, MATTHEW)).toEqual([
      'man-with-leprosy: Lord, if you are',
      '-: I am willing. Be',
      'centurion: Lord, my servant is',
      'jesus: I will come and',
      'centurion: Lord, I am not',
    ]);
  });

  it('never takes the ones pointed at for the one who speaks', () => {
    const page25 =
      'To the one who had said this, Jesus replied, “Who is my mother and who are my brothers?” And pointing toward his disciples he said, “Here are my mother and my brothers!”';
    expect(said(page25, MATTHEW)).toEqual([
      'jesus: Who is my mother',
      'jesus: Here are my mother',
    ]);
  });
});
