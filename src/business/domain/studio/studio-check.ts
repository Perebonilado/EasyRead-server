/**
 * Every scene checked before anything is drawn or voiced: so each person
 * says only their own lines, only whoever the scene lists is on the stage,
 * no one stands where someone already is, and nothing is done with a thing
 * that is not there or not in hand.
 *
 * The check walks the scene beat by beat, keeping who is on the stage and
 * where, and who holds what. What code can put right without changing the
 * story it puts right (someone who speaks walks on first, a thing is taken
 * up before it is eaten, a second person on a spot moves to the next free
 * one); what it cannot is a problem, said in plain words, which goes back
 * to the writer and shows on the scene's card. A warning shows on the card
 * and goes nowhere.
 */
import { narratorsLine, lineOf } from '../scene-screenplay';
import { faceNamed } from '../scene-feeling';
import { PROP_KIND, type StageProp } from '../scene-props';
import {
  STILL_WORDS,
  fewStageChanges,
  mendScript,
  quietStretches,
  type SceneScript,
} from '../scene-script';
import type { LearningStage } from '../scene-stage';
import {
  LINE_WORDS,
  MOST_ON_STAGE,
  SPOTS,
  secondsOf,
  studioId,
  type ExplainerSheet,
  type SheetBeat,
  type Spot,
  type StudioBible,
  type StudioCharacter,
  type StudioOutline,
  type StorySheet,
} from './studio';

export interface SheetProblem {
  /** Which rule: for the card's icon and for tests. */
  rule:
    | 'set'
    | 'cast'
    | 'crowded'
    | 'speaker'
    | 'narrator'
    | 'presence'
    | 'prop'
    | 'doing'
    | 'length'
    | 'empty'
    | 'continuity'
    | 'storyboard';
  /** In plain words, for the maker and for the writer. */
  message: string;
  /** The beat it is about, from 0; null for the whole scene. */
  beat: number | null;
  /** An error keeps the scene from being made; a warning does not. */
  level: 'error' | 'warning';
}

/** How a scene leaves the stage: who is where, and where each thing is. */
export interface EndState {
  set: string;
  onStage: { who: string; spot: Spot }[];
  props: { prop: StageProp; holder: string | null; gone: boolean }[];
}

/** A story's scene may run this much longer, or shorter, than its outline said before it goes back. */
export const LONGEST = 1.7;
export const SHORTEST = 0.4;

const words = (say: string) => say.split(/\s+/).filter(Boolean).length;

/** A name as the writer or a person wrote it, as one of the bible's characters' ids. */
export function characterId(
  said: string | null | undefined,
  bible: StudioBible,
): string | null {
  if (!said) return null;
  const key = studioId(said, '');
  if (!key) return null;
  const all = bible.characters;
  const found =
    all.find((c) => c.id === key) ??
    all.find((c) => studioId(c.name) === key) ??
    all.find((c) => studioId(c.name.split(/\s+/)[0]) === key) ??
    all.find(
      (c) =>
        key.length >= 3 &&
        (c.id.startsWith(`${key}-`) || studioId(c.name).startsWith(`${key}-`)),
    );
  return found?.id ?? null;
}

/** A set as the writer wrote it, as one of the bible's sets' ids. */
export function setId(
  said: string | null | undefined,
  bible: StudioBible,
): string | null {
  if (!said) return null;
  const key = studioId(said, '');
  return (
    bible.sets.find((s) => s.id === key)?.id ??
    bible.sets.find((s) => studioId(s.name) === key)?.id ??
    null
  );
}

const NARRATOR = /^(?:the-)?narrator$/u;

/** The free spot nearest the one asked for, or null when every spot is taken. */
function freeSpot(asked: Spot, taken: ReadonlySet<Spot>): Spot | null {
  if (!taken.has(asked)) return asked;
  const at = SPOTS.indexOf(asked);
  for (let d = 1; d < SPOTS.length; d += 1)
    for (const k of [at + d, at - d])
      if (k >= 0 && k < SPOTS.length && !taken.has(SPOTS[k])) return SPOTS[k];
  return null;
}

/** The spot to bring someone on at: the middle first, then out to either side. */
const ARRIVAL: readonly Spot[] = [
  'centre-right',
  'centre-left',
  'right',
  'left',
  'centre',
];

const blankBeat = (kind: SheetBeat['kind']): SheetBeat => ({
  kind,
  who: null,
  to: null,
  say: '',
  feeling: null,
  sign: null,
  do: null,
  prop: null,
  spot: null,
  from: null,
  pace: null,
  seconds: null,
});

/** Lines that come from somewhere with no one standing on the stage to say them. */
const FROM_AWAY = new Set(['off', 'phone', 'letter', 'above', 'dream']);

/**
 * A story's sheet put right where it can be without changing the story:
 * names made the bible's ids, spots made free, whoever speaks or acts
 * brought on first, a thing taken up before it is used, a line the
 * narrator must say given to the narrator. What was done is listed.
 */
export function mendSheet(
  input: StorySheet,
  bible: StudioBible,
): { sheet: StorySheet; mended: string[] } {
  const mended: string[] = [];
  const sheet: StorySheet = JSON.parse(JSON.stringify(input)) as StorySheet;
  const nameOf = (id: string) =>
    bible.characters.find((c) => c.id === id)?.name ?? id;

  sheet.set = setId(sheet.set, bible) ?? sheet.set;

  // Who is there as it opens: the bible's people, each once, each on a spot of their own.
  const taken = new Set<Spot>();
  const opening: StorySheet['onStage'] = [];
  for (const place of sheet.onStage) {
    const who = characterId(place.who, bible) ?? place.who;
    if (opening.some((p) => p.who === who)) {
      mended.push(`${nameOf(who)} was listed twice as the scene opens`);
      continue;
    }
    const spot = freeSpot(place.spot, taken);
    if (!spot) continue;
    if (spot !== place.spot)
      mended.push(
        `${nameOf(who)} moved to the ${spot}: someone already stands ${place.spot === 'centre' ? 'in the centre' : `on the ${place.spot}`}`,
      );
    taken.add(spot);
    opening.push({ ...place, who, spot });
  }
  sheet.onStage = opening;

  // The things on the stage: each once.
  const props = new Map<StageProp, string | null>();
  for (const one of sheet.props)
    if (!props.has(one.prop))
      props.set(one.prop, characterId(one.near, bible) ?? null);

  const here = new Map<string, Spot>(opening.map((p) => [p.who, p.spot]));
  const holders = new Map<StageProp, string | null>(
    [...props.keys()].map((prop) => [prop, null]),
  );
  const out: SheetBeat[] = [];
  const bringOn = (who: string, at: number, why: string): boolean => {
    if (here.has(who)) return true;
    if (here.size >= MOST_ON_STAGE) return false;
    const used = new Set(here.values());
    const spot = ARRIVAL.find((s) => !used.has(s)) ?? null;
    if (!spot) return false;
    out.push({
      ...blankBeat('action'),
      who,
      do: 'enter',
      spot,
      say: `${nameOf(who)} comes in.`,
      seconds: 1,
    });
    here.set(who, spot);
    mended.push(`beat ${at + 1}: ${nameOf(who)} walks on first, ${why}`);
    return true;
  };

  sheet.beats.forEach((raw, at) => {
    const beat: SheetBeat = { ...raw };
    beat.who = characterId(beat.who, bible) ?? beat.who;
    beat.to = characterId(beat.to, bible) ?? beat.to;
    if (beat.kind === 'line') {
      if (beat.who && NARRATOR.test(beat.who)) {
        mended.push(`beat ${at + 1}: the narrator's words are narration`);
        beat.kind = 'narration';
        beat.who = null;
        beat.to = null;
        beat.feeling = null;
        beat.from = null;
        beat.pace = null;
      } else {
        // A line is what they say, not the words around it: "…," said Ada.
        const said = lineOf(beat.say);
        if (said.attributed) {
          beat.say = said.text;
          mended.push(`beat ${at + 1}: the line without "said …" around it`);
        } else beat.say = said.text;
        const speaker = bible.characters.find((c) => c.id === beat.who);
        // Words no character says: a question to the viewer, someone
        // telling of themselves as another would. The narrator's.
        const why = speaker ? narratorsLine(beat.say, [speaker.name]) : null;
        if (why) {
          mended.push(`beat ${at + 1}: ${why}; the narrator says it`);
          beat.kind = 'narration';
          beat.who = null;
          beat.to = null;
          beat.from = null;
          beat.pace = null;
          beat.feeling = null;
        }
      }
    }
    if (beat.kind === 'line' && beat.who) {
      const away = beat.from && FROM_AWAY.has(beat.from);
      if (!away && bible.characters.some((c) => c.id === beat.who))
        bringOn(beat.who, at, 'to say their line');
      if (beat.to && (beat.to === beat.who || !here.has(beat.to))) {
        if (
          beat.to !== beat.who &&
          bible.characters.some((c) => c.id === beat.to)
        )
          mended.push(
            `beat ${at + 1}: said to everyone; ${nameOf(beat.to)} is not on the stage`,
          );
        beat.to = null;
      }
    }
    if (beat.kind === 'action' && beat.who) {
      if (beat.do === 'enter') {
        if (here.has(beat.who)) {
          mended.push(
            `beat ${at + 1}: ${nameOf(beat.who)} is on the stage already`,
          );
          return;
        }
        const spot = freeSpot(
          beat.spot ?? 'centre-right',
          new Set(here.values()),
        );
        if (spot && here.size < MOST_ON_STAGE) {
          beat.spot = spot;
          here.set(beat.who, spot);
        }
      } else if (beat.do === 'leave') {
        if (!here.has(beat.who)) {
          mended.push(
            `beat ${at + 1}: ${nameOf(beat.who)} is not there to leave`,
          );
          return;
        }
        here.delete(beat.who);
        for (const [prop, holder] of holders)
          if (holder === beat.who) holders.set(prop, null);
      } else if (beat.do === 'walk') {
        if (!here.has(beat.who)) bringOn(beat.who, at, 'to walk across');
        const others = new Set(
          [...here].filter(([id]) => id !== beat.who).map(([, s]) => s),
        );
        const spot = freeSpot(beat.spot ?? 'centre', others);
        if (spot) {
          beat.spot = spot;
          here.set(beat.who, spot);
        }
      } else if (beat.do !== 'still') {
        if (bible.characters.some((c) => c.id === beat.who))
          bringOn(beat.who, at, 'to be seen doing it');
        // A reach toward a thing, not a person (under the stall, for the
        // apple): the stage reaches only for people, so it points there.
        const person = beat.to && bible.characters.some((c) => c.id === beat.to);
        if (beat.do === 'reach' && !person) {
          beat.do = 'point';
          beat.to = null;
          mended.push(`beat ${at + 1}: a reach toward no one is a point`);
        }
        if (beat.do === 'hug' && !person) {
          mended.push(`beat ${at + 1}: a hug with no one to hug; left out`);
          return;
        }
        if (beat.to && beat.to !== '@up' && !here.has(beat.to)) {
          if (
            beat.do === 'hug' &&
            bible.characters.some((c) => c.id === beat.to)
          )
            bringOn(beat.to, at, 'to be hugged');
          else {
            if (beat.do === 'hug' || beat.do === 'reach') {
              mended.push(
                `beat ${at + 1}: no one there to ${beat.do} toward; left out`,
              );
              return;
            }
            beat.to = null;
          }
        }
      }
    }
    if (beat.kind === 'business' && beat.who && beat.prop) {
      if (bible.characters.some((c) => c.id === beat.who))
        bringOn(beat.who, at, 'to be seen doing it');
      if (!props.has(beat.prop)) {
        props.set(beat.prop, beat.who);
        holders.set(beat.prop, null);
        mended.push(
          `the ${beat.prop} set on the stage, before ${nameOf(beat.who)}`,
        );
      }
      const holder = holders.get(beat.prop) ?? null;
      const uses = ['raise', 'break', 'give', 'eat', 'drink', 'dip'];
      if (
        beat.do &&
        uses.includes(beat.do) &&
        holder !== beat.who &&
        holder === null
      ) {
        out.push({
          ...blankBeat('business'),
          who: beat.who,
          do: 'take',
          prop: beat.prop,
          say: `${nameOf(beat.who)} takes the ${beat.prop}.`,
        });
        holders.set(beat.prop, beat.who);
        mended.push(
          `beat ${at + 1}: ${nameOf(beat.who)} takes the ${beat.prop} up first`,
        );
      }
      if (beat.do === 'take') holders.set(beat.prop, beat.who);
      if (beat.do === 'put') holders.set(beat.prop, null);
      if (beat.do === 'give' && beat.to) {
        if (
          !here.has(beat.to) &&
          bible.characters.some((c) => c.id === beat.to)
        )
          bringOn(beat.to, at, 'to be given it');
        if (holders.get(beat.prop) === beat.who)
          holders.set(beat.prop, beat.to);
      }
    }
    if (beat.kind === 'reaction' && beat.who && !beat.feeling && !beat.sign)
      beat.feeling = faceNamed(beat.say) ?? null;
    out.push(beat);
  });
  sheet.beats = out;
  sheet.props = [...props].map(([prop, near]) => ({ prop, near }));

  // The camera only on who is there when it is.
  const present = presenceByBeat(sheet);
  sheet.camera = sheet.camera.flatMap((shot) => {
    const on = characterId(shot.on, bible) ?? shot.on;
    const also = characterId(shot.with, bible) ?? shot.with;
    const there = present[Math.min(shot.beat, present.length - 1)] ?? new Set();
    if (shot.shot !== 'wide' && (!on || !there.has(on))) {
      mended.push(
        `the ${shot.shot} shot at beat ${shot.beat + 1} is on no one there; left out`,
      );
      return [];
    }
    return [
      {
        ...shot,
        beat: Math.min(shot.beat, Math.max(0, sheet.beats.length - 1)),
        on: shot.shot === 'wide' ? null : on,
        with: shot.shot === 'two' && also && there.has(also) ? also : null,
      },
    ];
  });
  return { sheet, mended };
}

/** Who is on the stage as each beat plays, by id. */
export function presenceByBeat(sheet: StorySheet): Set<string>[] {
  const here = new Set(sheet.onStage.map((p) => p.who));
  return sheet.beats.map((beat) => {
    if (beat.kind === 'action' && beat.who) {
      if (beat.do === 'enter') here.add(beat.who);
      if (beat.do === 'leave') {
        const now = new Set(here);
        here.delete(beat.who);
        return now;
      }
    }
    return new Set(here);
  });
}

/**
 * What is wrong with a story's sheet, once mended. `planned` is the
 * outline's seconds for it; `before` how the scene before left the stage.
 */
export function checkSheet(
  sheet: StorySheet,
  bible: StudioBible,
  planned: number | null = null,
  before: EndState | null = null,
): SheetProblem[] {
  const problems: SheetProblem[] = [];
  const error = (
    rule: SheetProblem['rule'],
    message: string,
    beat: number | null = null,
  ) => problems.push({ rule, message, beat, level: 'error' });
  const warn = (
    rule: SheetProblem['rule'],
    message: string,
    beat: number | null = null,
  ) => problems.push({ rule, message, beat, level: 'warning' });
  const byId = new Map(bible.characters.map((c) => [c.id, c]));
  const nameOf = (id: string) => byId.get(id)?.name ?? id;
  const known = (id: string | null): id is string =>
    Boolean(id && byId.has(id));

  if (!bible.sets.some((s) => s.id === sheet.set))
    error(
      'set',
      `The scene is set in "${sheet.set || 'nowhere'}", which is none of the show's places (${bible.sets.map((s) => s.id).join(', ') || 'none yet'}).`,
    );
  for (const place of sheet.onStage)
    if (!known(place.who))
      error(
        'cast',
        `"${String(place.who)}" is on the stage as it opens but is not one of the show's characters.`,
      );
  if (sheet.onStage.length > MOST_ON_STAGE)
    error(
      'crowded',
      `${sheet.onStage.length} people stand on the stage at once; ${MOST_ON_STAGE} at most, or they stand on each other.`,
    );
  const spots = sheet.onStage.map((p) => p.spot);
  if (new Set(spots).size < spots.length)
    error('crowded', 'Two people stand on the same spot as the scene opens.');

  const here = new Map<string, Spot>(sheet.onStage.map((p) => [p.who, p.spot]));
  const holders = new Map<StageProp, string | null>(
    sheet.props.map((p) => [p.prop, null]),
  );
  const eaten = new Set<StageProp>();
  let spoken = 0;
  sheet.beats.forEach((beat, at) => {
    const n = at + 1;
    if (beat.kind === 'line' || beat.kind === 'narration') {
      if (!beat.say.trim()) error('empty', `Beat ${n} says nothing.`, at);
      else spoken += 1;
      if (words(beat.say) > LINE_WORDS)
        error(
          beat.kind === 'line' ? 'speaker' : 'narrator',
          `Beat ${n} runs to ${words(beat.say)} words; split it, ${LINE_WORDS} words at most in one.`,
          at,
        );
    }
    if (beat.kind === 'line') {
      if (!known(beat.who))
        error(
          'speaker',
          `Beat ${n} is a line with ${beat.who ? `"${String(beat.who)}", who is none of the show's characters,` : 'no one'} to say it: each line is said by exactly one of the cast.`,
          at,
        );
      else if (!here.has(beat.who) && !(beat.from && FROM_AWAY.has(beat.from)))
        error(
          'presence',
          `${nameOf(beat.who)} says beat ${n} but is not on the stage: bring them on first, or say where the voice comes from (off, a phone, a letter).`,
          at,
        );
    }
    if (beat.kind === 'narration') {
      // Someone's own words in the narrator's mouth: theirs to say.
      const quoted = beat.say.match(/["“]([^"”]{12,})["”]/u);
      if (quoted)
        error(
          'narrator',
          `The narrator says someone's words in beat ${n} ("${quoted[1].slice(0, 40)}…"): make it a line said by whoever says it.`,
          at,
        );
    }
    if (
      beat.kind === 'action' ||
      beat.kind === 'business' ||
      beat.kind === 'reaction'
    ) {
      if (!known(beat.who))
        error(
          'cast',
          `Beat ${n} has ${beat.who ? `"${String(beat.who)}", who is none of the show's characters,` : 'no one'} doing it.`,
          at,
        );
      else if (
        !(beat.kind === 'action' && beat.do === 'enter') &&
        !here.has(beat.who)
      )
        error(
          'presence',
          `${nameOf(beat.who)} acts in beat ${n} but is not on the stage.`,
          at,
        );
      if (beat.kind !== 'reaction' && !beat.do)
        error(
          'doing',
          `Beat ${n} asks for something the stage cannot show; use one of the doings listed.`,
          at,
        );
      if (beat.kind === 'reaction' && !beat.feeling && !beat.sign)
        error('doing', `Beat ${n} is a reaction with no face or sign.`, at);
    }
    if (beat.kind === 'action' && beat.who) {
      if (beat.do === 'enter') {
        if (here.size >= MOST_ON_STAGE)
          error(
            'crowded',
            `${nameOf(beat.who)} comes on in beat ${n} to a stage that has ${MOST_ON_STAGE} people already.`,
            at,
          );
        if ([...here.values()].includes(beat.spot ?? 'centre'))
          error(
            'crowded',
            `${nameOf(beat.who)} comes on to a spot someone stands on.`,
            at,
          );
        here.set(beat.who, beat.spot ?? 'centre');
      } else if (beat.do === 'leave') here.delete(beat.who);
      else if (beat.do === 'walk' && beat.spot) here.set(beat.who, beat.spot);
      if (
        (beat.do === 'hug' || beat.do === 'reach') &&
        !(beat.to && here.has(beat.to))
      )
        error(
          'presence',
          `Beat ${n} has ${nameOf(beat.who)} ${beat.do === 'hug' ? 'hug' : 'reach for'} someone not on the stage.`,
          at,
        );
    }
    if (beat.kind === 'business' && beat.who && beat.prop) {
      const prop = beat.prop;
      if (!holders.has(prop))
        error(
          'prop',
          `The ${prop} is used in beat ${n} but is not on the stage.`,
          at,
        );
      if (eaten.has(prop))
        warn(
          'prop',
          `The ${prop} is used in beat ${n} after it was eaten up.`,
          at,
        );
      const holder = holders.get(prop) ?? null;
      if (beat.do === 'take' && holder && holder !== beat.who)
        error(
          'prop',
          `${nameOf(beat.who)} takes the ${prop} in beat ${n}, but ${nameOf(holder)} has it.`,
          at,
        );
      if (
        (beat.do === 'give' || beat.do === 'raise' || beat.do === 'break') &&
        holder !== beat.who
      )
        error(
          'prop',
          `${nameOf(beat.who)} does not have the ${prop} in beat ${n}.`,
          at,
        );
      if (beat.do === 'break' && prop !== 'bread')
        error(
          'prop',
          `Only bread is broken on the stage; beat ${n} breaks the ${prop}.`,
          at,
        );
      if (beat.do === 'eat' && PROP_KIND[prop] !== 'food')
        error('prop', `The ${prop} is not something to eat (beat ${n}).`, at);
      if (beat.do === 'drink' && PROP_KIND[prop] !== 'drink')
        error(
          'prop',
          `The ${prop} is not something to drink from (beat ${n}).`,
          at,
        );
      if (beat.do === 'give') {
        if (!beat.to || !here.has(beat.to))
          error(
            'presence',
            `Beat ${n} gives the ${prop} to someone not on the stage.`,
            at,
          );
        else holders.set(prop, beat.to);
      }
      if (beat.do === 'take') holders.set(prop, beat.who);
      if (beat.do === 'put') holders.set(prop, null);
      if (beat.do === 'eat') eaten.add(prop);
    }
  });
  if (spoken < 2)
    error('empty', 'A scene needs at least two lines or narrations.');
  if (
    !sheet.beats.some((b) => b.kind === 'line') &&
    sheet.onStage.length + sheet.beats.filter((b) => b.do === 'enter').length >
      0
  )
    warn(
      'speaker',
      'No one says anything in this scene: only the narrator speaks.',
    );
  const seconds = secondsOf(sheet);
  // Too long is sent back to the writer once, and shown; the maker may
  // still make it, knowing what it will run to.
  if (planned && seconds > planned * LONGEST)
    warn(
      'length',
      `The scene runs about ${seconds} seconds; the outline gives it ${planned}. Cut it down to about ${planned}.`,
    );
  else if (planned && seconds < planned * SHORTEST)
    warn(
      'length',
      `The scene runs about ${seconds} seconds of the ${planned} the outline gives it.`,
    );
  // Who the scene before left here, in the same place: a warning if the
  // scene opens with a different set of people and no cut in time.
  if (before && before.set === sheet.set) {
    const was = new Set(before.onStage.map((p) => p.who));
    const now = new Set(sheet.onStage.map((p) => p.who));
    const gone = [...was].filter((id) => !now.has(id));
    if (gone.length && sheet.transition === 'cut')
      warn(
        'continuity',
        `The scene before left ${gone.map(nameOf).join(' and ')} here; they are gone as this one opens.`,
      );
  }
  return problems;
}

/** How a story's scene leaves the stage, from how the one before it did. */
export function endStateOf(sheet: StorySheet): EndState {
  const here = new Map<string, Spot>(sheet.onStage.map((p) => [p.who, p.spot]));
  const holders = new Map<StageProp, string | null>(
    sheet.props.map((p) => [p.prop, null]),
  );
  const gone = new Set<StageProp>();
  for (const beat of sheet.beats) {
    if (beat.kind === 'action' && beat.who) {
      if (beat.do === 'enter' || beat.do === 'walk')
        here.set(beat.who, beat.spot ?? 'centre');
      if (beat.do === 'leave') {
        here.delete(beat.who);
        for (const [prop, holder] of holders)
          if (holder === beat.who) holders.set(prop, null);
      }
    }
    if (beat.kind === 'business' && beat.prop && beat.who) {
      if (beat.do === 'take') holders.set(beat.prop, beat.who);
      if (beat.do === 'put') holders.set(beat.prop, null);
      if (beat.do === 'give' && beat.to) holders.set(beat.prop, beat.to);
      if (beat.do === 'eat') gone.add(beat.prop);
    }
  }
  return {
    set: sheet.set,
    onStage: [...here].map(([who, spot]) => ({ who, spot })),
    props: [...holders].map(([prop, holder]) => ({
      prop,
      holder,
      gone: gone.has(prop),
    })),
  };
}

/** How the scene before left things, said for the writer. */
export function describeEnd(end: EndState | null, bible: StudioBible): string {
  if (!end) return 'This is the first scene: nothing came before it.';
  const nameOf = (id: string) =>
    bible.characters.find((c) => c.id === id)?.name ?? id;
  const place = bible.sets.find((s) => s.id === end.set)?.name ?? end.set;
  const people = end.onStage.length
    ? end.onStage
        .map((p) => `${nameOf(p.who)} (${p.who}) at the ${p.spot}`)
        .join(', ')
    : 'no one';
  const things = end.props.filter((p) => !p.gone);
  return [
    `The scene before ended in ${place} (${end.set}) with ${people} on the stage.`,
    things.length
      ? `Things there: ${things.map((p) => `the ${p.prop}${p.holder ? ` in ${nameOf(p.holder)}'s hand` : ''}`).join(', ')}.`
      : '',
    'Carry on from there: in the same place and time, the people there are still there unless they left; in a new place or time, start afresh.',
  ]
    .filter(Boolean)
    .join(' ');
}

/** What is wrong with an outline: places and people the show does not have, a length that does not add up. */
export function checkOutline(
  outline: StudioOutline,
  bible: StudioBible,
  minutes: number,
  story: boolean,
): string[] {
  const problems: string[] = [];
  if (outline.scenes.length < 1) problems.push('The outline has no scenes.');
  const seconds = outline.scenes.reduce((n, s) => n + s.seconds, 0);
  const wanted = minutes * 60;
  if (seconds > wanted * 1.35 || seconds < wanted * 0.65)
    problems.push(
      `The scenes add up to ${seconds} seconds; the episode should run about ${wanted}. Change the scenes' seconds, or how many there are.`,
    );
  if (story) {
    outline.scenes.forEach((scene, k) => {
      if (!scene.set || !setId(scene.set, bible))
        problems.push(
          `Scene ${k + 1} is set in "${scene.set ?? 'nowhere'}", none of the show's places (${bible.sets.map((s) => s.id).join(', ')}).`,
        );
      const strangers = scene.cast.filter((id) => !characterId(id, bible));
      if (strangers.length)
        problems.push(
          `Scene ${k + 1} has ${strangers.join(', ')}, who are none of the show's characters (${bible.characters.map((c) => c.id).join(', ')}).`,
        );
      if (!scene.cast.length) problems.push(`Scene ${k + 1} has no one in it.`);
    });
    const used = new Set(
      outline.scenes.flatMap((s) =>
        s.cast.map((id) => characterId(id, bible)).filter(Boolean),
      ),
    );
    const unused = bible.characters.filter(
      (c) => c.role !== 'minor' && !used.has(c.id),
    );
    if (unused.length)
      problems.push(
        `${unused.map((c) => c.name).join(' and ')} ${unused.length > 1 ? 'are' : 'is'} in no scene: give them a part, or leave them out of the show.`,
      );
  } else
    outline.scenes.forEach((scene, k) => {
      if (!scene.teach || words(scene.teach) < 25)
        problems.push(
          `Scene ${k + 1} says too little of what it teaches: write it out as a good book would, 60 to 200 words.`,
        );
    });
  return problems;
}

/** The outline's ids made the bible's own, where the writer wrote a name for one. */
export function mendOutline(
  outline: StudioOutline,
  bible: StudioBible,
): StudioOutline {
  return {
    ...outline,
    scenes: outline.scenes.map((scene) => ({
      ...scene,
      set: setId(scene.set, bible) ?? scene.set,
      cast: [...new Set(scene.cast.map((id) => characterId(id, bible) ?? id))],
    })),
  };
}

/** What is wrong with a bible: two looking alike, a person with nothing to set them apart. */
export function checkBible(bible: StudioBible, story: boolean): string[] {
  if (!story) return [];
  const problems: string[] = [];
  if (!bible.characters.length) problems.push('The show has no characters.');
  if (!bible.sets.length) problems.push('The show has no places.');
  const people = bible.characters.filter(
    (
      c,
    ): c is StudioCharacter & {
      figure: NonNullable<StudioCharacter['figure']>;
    } => c.kind === 'person' && Boolean(c.figure),
  );
  for (let i = 0; i < people.length; i += 1)
    for (let j = i + 1; j < people.length; j += 1) {
      const a = people[i].figure;
      const b = people[j].figure;
      const same = [
        a.age === b.age,
        a.hair === b.hair,
        a.hairColour === b.hairColour,
        a.top === b.top,
        a.topColour === b.topColour,
        Math.abs(a.skin - b.skin) <= 1,
        a.headwear === b.headwear,
      ].filter(Boolean).length;
      if (same >= 6)
        problems.push(
          `${people[i].name} and ${people[j].name} look almost the same: change one's hair, clothes or colours so a viewer tells them apart.`,
        );
    }
  const voices = new Map<string, string[]>();
  for (const c of bible.characters) {
    const key = `${c.voice}#${c.voicePick}`;
    voices.set(key, [...(voices.get(key) ?? []), c.name]);
  }
  for (const [, names] of voices)
    if (names.length > 1)
      problems.push(`${names.join(' and ')} speak in the same voice.`);
  return problems;
}

/** Each character a voice of their own: a second of the same kind takes the next of that kind's voices. */
export function distinctVoices(bible: StudioBible): StudioBible {
  const used = new Map<string, Set<number>>();
  return {
    ...bible,
    characters: bible.characters.map((c) => {
      const taken = used.get(c.voice) ?? new Set<number>();
      let pick = c.voicePick;
      for (let n = 0; n < 3 && taken.has(pick); n += 1) pick = (pick + 1) % 3;
      taken.add(pick);
      used.set(c.voice, taken);
      return pick === c.voicePick ? c : { ...c, voicePick: pick };
    }),
  };
}

/**
 * An explainer's sheet checked: its storyboard mended as a lesson's page
 * is, what the lesson writer would be sent back for, and its length.
 */
export function checkExplainer(
  sheet: ExplainerSheet,
  options: {
    teach: string | null;
    stage: LearningStage | null;
    maths: boolean;
    planned: number | null;
  },
): { script: SceneScript; problems: SheetProblem[] } {
  const mended = mendScript(sheet.draft, {
    material: options.teach ?? undefined,
    formats: options.maths ? ['explainer', 'maths'] : ['explainer'],
    stage: options.stage,
  });
  // What the storyboard gets wrong keeps the scene from being made; a
  // picture that sits still a while is sent back to the writer once, and
  // shown, but the maker may make it as it is.
  const problems: SheetProblem[] = [
    ...mended.problems.map((message) => ({
      rule: 'storyboard' as const,
      message,
      beat: null,
      level: 'error' as const,
    })),
    ...[
      ...quietStretches(mended.script, STILL_WORDS),
      ...fewStageChanges(mended.script),
    ].map((message) => ({
      rule: 'storyboard' as const,
      message,
      beat: null,
      level: 'warning' as const,
    })),
  ];
  if (!mended.script.beats.length)
    problems.push({
      rule: 'empty',
      message: 'The scene says nothing.',
      beat: null,
      level: 'error',
    });
  if (!mended.script.steps.some((step) => step.stage))
    problems.push({
      rule: 'storyboard',
      message: 'Nothing is ever shown on the stage.',
      beat: null,
      level: 'error',
    });
  const seconds = secondsOf(sheet);
  if (options.planned && seconds > options.planned * LONGEST)
    problems.push({
      rule: 'length',
      message: `The scene runs about ${seconds} seconds; the outline gives it ${options.planned}. Say it in fewer words.`,
      beat: null,
      level: 'warning',
    });
  return { script: mended.script, problems };
}

/** Only what keeps a scene from being made. */
export const errorsIn = (problems: readonly SheetProblem[]) =>
  problems.filter((p) => p.level === 'error');

/**
 * What a written scene goes back to its writer for, once: whatever keeps
 * it from being made, and a length or a still picture that does not.
 */
export const sentBackFor = (problems: readonly SheetProblem[]) =>
  problems.filter(
    (p) =>
      p.level === 'error' || p.rule === 'length' || p.rule === 'storyboard',
  );
