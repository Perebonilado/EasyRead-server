/**
 * What a story's narration says its characters do, read from its own
 * words as its dialogue is: who hugs whom, who waves, nods, laughs, claps,
 * cries, shrugs, points, gives, looks up at the sky; and who comes onto
 * the scene and who goes. The writer's storyboard may ask for the same,
 * and often does not; the words are what the listener hears, so they are
 * acted where they are said.
 *
 * Only the narration counts, never the words inside a quote. Whoever does
 * it is the character the clause names before the verb; a clause that
 * names no one goes on with whoever it was about ("Baba Sule laughed,
 * waved goodbye and walked on"); "he" and "she" are the last character
 * named who could be called so. Whom it is done to is the first named
 * after the verb, or "him", "her". Nothing wanted, feared or denied is
 * acted ("wanted to go home", "did not laugh").
 */
import { namedIn, quotedSpans, type Speaker } from './scene-dialogue';
import { PROP_KIND, PROP_WORDS, type StageProp } from './scene-props';

/** Someone who may act on a page: their id there, their names, and whether "she" or "he" may mean them. */
export interface Actor extends Speaker {
  gender?: 'f' | 'm' | null;
}

/** What the narration may say someone does, acted by the stage. */
export const NARRATED_MOVES = [
  'hug',
  'wave',
  'nod',
  'shake',
  'laugh',
  'hop',
  'clap',
  'sob',
  'shrug',
  'point',
  'reach',
  'look',
] as const;
export type NarratedMove = (typeof NARRATED_MOVES)[number];

/** Someone doing something, where the narration says it. */
export interface NarratedAct {
  beat: number;
  /** Where the verb starts in the sentence. */
  at: number;
  who: string;
  do: NarratedMove;
  /** Toward whom or what: an id on the page, "@up" or "@down" (the sky, the ground), or no one. */
  toward: string | null;
}

/** What people do with the things on the stage, where the narration says it. */
export const PROP_ACTIONS = [
  'take',
  'raise',
  'break',
  'give',
  'eat',
  'drink',
  'dip',
  'put',
] as const;
export type PropAction = (typeof PROP_ACTIONS)[number];

/**
 * Someone handling a thing, where the narration says so: Jesus takes the
 * bread, blesses it, breaks it and gives it to the disciples; they eat.
 */
export interface PropBusiness {
  beat: number;
  /** Where the verb starts in the sentence. */
  at: number;
  who: string;
  does: PropAction;
  prop: StageProp;
  /** Given to whom, by id; or no one. */
  to: string | null;
}

/** Someone coming onto the scene or leaving it, where the narration says so. */
export interface Passage {
  beat: number;
  at: number;
  who: string;
  how: 'enter' | 'leave';
  /** Brought in by speaking, not by the words: in the scene all along, shown now. */
  said?: true;
}

/** A line said from somewhere else: from the kitchen, over the phone. */
const ELSEWHERE =
  /\b(?:from (?:the |inside|outside|behind|upstairs|downstairs|far|across|another|next door|somewhere)|(?:on|over) the (?:phone|radio)|in (?:a|her|his|their) (?:letter|message))\b/iu;

/**
 * Whoever speaks and is not on the stage is brought into view as their
 * line starts: a line from somewhere else ("…," Mum called from the
 * kitchen) excepted, and anyone the words have sent away.
 */
export function speakersIn(
  sentences: readonly string[],
  lines: ReadonlyMap<
    number,
    readonly { span: [number, number]; speaker: string }[]
  >,
): Passage[] {
  const out: Passage[] = [];
  sentences.forEach((sentence, beat) => {
    if (ELSEWHERE.test(sentence)) return;
    for (const line of lines.get(beat) ?? [])
      out.push({
        beat,
        at: line.span[0],
        who: line.speaker,
        how: 'enter',
        said: true,
      });
  });
  return out;
}

/** How people go on foot, or otherwise. */
const GOING =
  'walk(?:s|ed|ing)?|r[au]n(?:s|ning)?|went|go(?:es|ing)?|hurr(?:y|ies|ied|ying)|head(?:s|ed|ing)|wander(?:s|ed|ing)?|stroll(?:s|ed|ing)?|skip(?:s|ped|ping)?|rush(?:es|ed|ing)?|dash(?:es|ed|ing)?|march(?:es|ed|ing)?|limp(?:s|ed|ing)?|trot(?:s|ted|ting)?|stomp(?:s|ed|ing)?|tiptoe(?:s|d|ing)?|fl(?:ew|ies|y|ying)|sw(?:am|ims|im|imming)|r(?:ode|ides|ide|iding)|crawl(?:s|ed|ing)?|drove|drives|driving|hopp(?:ed|ing)|hops';

/** Someone going: away, off, home, on down the road; leaving; gone from sight. */
const LEAVING = new RegExp(
  `\\b(?:(?:${GOING})(?: \\p{L}+ly)? (?:away|off|out|home|back home|back to|on (?:down|up|along|his|her|their|its)|down the (?:road|path|street|lane|hill|track)|out of)\\b|(?:left|leaves)(?= *(?:[.,;!?]|$|for\\b|home\\b|the (?:room|house|shop|village|market|school|hut|kitchen|garden|party|class|field|farm|yard|compound)\\b))|(?:disappear|vanish)(?:s|es|ed)?\\b)`,
  'giu',
);

/** Someone coming: in, up, over, along, back; arriving; appearing somewhere. */
const COMING = new RegExp(
  `\\b(?:(?:came|comes|coming)(?: \\p{L}+ly)? (?:in|into|out|over|up|along|back|running|walking|hurrying|rushing|skipping|flying|down|to|toward|towards|across|round|around|through|by)|arriv(?:e|es|ed|ing)|appear(?:s|ed|ing)? (?:in|at|from|out of|behind|beside|round|around|on)|join(?:s|ed|ing)? (?:them|him|her|us)|(?:${GOING})(?: \\p{L}+ly)? (?:up to|up|in|into|over to|over|across to|across))\\b`,
  'giu',
);

type Doing = NarratedMove | 'enter' | 'leave' | PropAction;

/** Each verb, what it is acted as, and whether it is done to someone: needed, maybe, or never. */
const VERBS: {
  pattern: RegExp;
  does: Doing;
  object: 'must' | 'may' | 'none';
}[] = [
  // What is done with things: the longer phrases first, so "gave thanks"
  // is a blessing and not a giving.
  {
    pattern:
      /\b(?:bless(?:es|ed|ing)?|g(?:ave|ives|iving|ive) thanks|raised|raises|raising|lift(?:s|ed|ing)? (?:it |them )?up|h(?:eld|olds|olding) (?:it |them )?up)\b/giu,
    does: 'raise',
    object: 'may',
  },
  {
    pattern:
      /\b(?:took|takes|taking|picked up|picks up|picking up|pick(?:s|ed)? (?:it|them) up|lifted|lifts|lifting|grabbed|grabs|seized)\b/giu,
    does: 'take',
    object: 'must',
  },
  {
    pattern: /\b(?:broke|brake|breaks|breaking|tore|tears|tearing)\b/giu,
    does: 'break',
    object: 'must',
  },
  {
    pattern:
      /\b(?:gave|gives|giving|handed|hands|handing|passed|passes|passing|shared|shares|sharing|offered|offers|offering)\b/giu,
    does: 'give',
    object: 'must',
  },
  {
    pattern:
      /\b(?:ate|eats|eating|bit|bites|biting|chewed|chews|tasted|tastes)\b|\beat\b(?! (?:up|away))/giu,
    does: 'eat',
    object: 'may',
  },
  {
    pattern: /\b(?:drank|drinks|drinking|drink|sipped|sips|sipping)\b/giu,
    does: 'drink',
    object: 'may',
  },
  {
    pattern: /\b(?:dipped|dips|dipping|dip)\b/giu,
    does: 'dip',
    object: 'may',
  },
  {
    pattern:
      /\b(?:put|puts|set|sets|laid|lays|placed|places) (?:it |them |the \p{L}+ )?(?:down|on the table|back)\b/giu,
    does: 'put',
    object: 'may',
  },
  {
    pattern:
      /\b(?:hug(?:s|ged|ging)?|embrac(?:e|es|ed|ing)|cuddl(?:e|es|ed|ing))\b/giu,
    does: 'hug',
    object: 'must',
  },
  {
    pattern:
      /\b(?:put|puts|putting|threw|throws|throwing|wrapped|wraps|wrapping|flung) (?:his|her|their|both) arms?\b/giu,
    does: 'hug',
    object: 'must',
  },
  { pattern: /\bwav(?:e|es|ed|ing)\b/giu, does: 'wave', object: 'may' },
  { pattern: /\bnod(?:s|ded|ding)?\b/giu, does: 'nod', object: 'none' },
  {
    pattern: /\bbow(?:s|ed|ing)? (?:his |her |their )?(?:head|low|down)\b/giu,
    does: 'nod',
    object: 'none',
  },
  {
    pattern: /\bsh(?:ook|akes|aking|ake) (?:his|her|their) heads?\b/giu,
    does: 'shake',
    object: 'none',
  },
  {
    pattern:
      /\b(?:laugh(?:s|ed|ing)?|giggl(?:e|es|ed|ing)|chuckl(?:e|es|ed|ing))\b/giu,
    does: 'laugh',
    object: 'none',
  },
  {
    pattern:
      /\b(?:jump(?:s|ed|ing)?|leap(?:s|t|ed|ing)?|hopp(?:ed|ing)|hops|danc(?:e|es|ed|ing))\b(?= (?:up|for joy|with joy|in the air|up and down|about|around)\b)/giu,
    does: 'hop',
    object: 'none',
  },
  {
    pattern: /\b(?:clap(?:s|ped|ping)?|cheer(?:s|ed|ing)?)\b/giu,
    does: 'clap',
    object: 'none',
  },
  {
    pattern:
      /\b(?:began to cry|started (?:to cry|crying)|burst into tears|sob(?:s|bed|bing)?|wept|weep(?:s|ing)?|(?:was|were|is|are) crying|cr(?:ies|ied) (?:softly|quietly|and))\b/giu,
    does: 'sob',
    object: 'none',
  },
  { pattern: /\bshrug(?:s|ged|ging)?\b/giu, does: 'shrug', object: 'none' },
  {
    pattern: /\bpoint(?:s|ed|ing)? (?:at|to|toward|towards|up|out)\b/giu,
    does: 'point',
    object: 'may',
  },
  {
    pattern:
      /\b(?:reach(?:es|ed|ing)? (?:for|out|toward|towards)|handed|handing|gave|gives|giving|offer(?:s|ed|ing)?|held out|holds out|(?:took|takes|taking|held|holds|holding) (?:his|her|their) hand)\b/giu,
    does: 'reach',
    object: 'must',
  },
  {
    pattern:
      /\b(?:look(?:s|ed|ing)?|gaz(?:e|es|ed|ing)|star(?:e|es|ed|ing)|glanc(?:e|es|ed|ing)|peer(?:s|ed|ing)?|turn(?:s|ed|ing)? to(?:ward|wards)?)\b(?: (?:up|down|over|across|back|around|round|out))?(?: (?:at|to|toward|towards|into))?/giu,
    does: 'look',
    object: 'may',
  },
  { pattern: COMING, does: 'enter', object: 'none' },
  { pattern: LEAVING, does: 'leave', object: 'none' },
];

/** Words before a verb that say it is not happening: wanted, would, did not. */
const NOT_DONE =
  /\b(?:to|would|will|could|should|might|must|can|cannot|can't|couldn't|wouldn't|didn't|did not|don't|do not|doesn't|does not|never|not|let's|let us|about to)\s+(?:\p{L}+ly\s+)?$/iu;

/**
 * Words that tell of what happens as a rule, not now: "every evening",
 * "usually", "used to". A sentence that says them tells no one to move.
 */
const HABIT =
  /\b(?:(?:every|each) (?:morning|evening|afternoon|day|night|week|year|time|summer|winter|spring|autumn)|usually|always|often|sometimes|used to)\b/iu;

/** Words that join a clause to the verb without naming anyone: "and then", "slowly". */
const FILLER =
  /^(?:\s|[,—–-]|\b(?:and|then|but|so|also|just|now|soon|suddenly|finally|quickly|slowly|gently|quietly|happily|sadly|softly|at last|at once|all|both|together|still|even|too|again|once more)\b)*$/iu;

/** What may come before whoever leads a clause: joining words, "the", "old". */
const LEAD =
  /^(?:\s|[,—–-]|\b(?:and|then|but|so|also|just|now|soon|suddenly|finally|at last|at once|all|both|together|still|even|too|again|the|a|an|old|young|little|big|poor|dear|brave|kind|wise|clever|\p{L}+ly)\b)*$/iu;

/** What may stand between whoever does it and the verb: "then", "slowly". */
const ADVERBS =
  /^(?:\s|\b(?:just|then|also|still|even|all|both|together|soon|now|at once|at last|\p{L}+ly)\b)*$/iu;

/**
 * Where the clause a verb is in starts: after a stop, a comma or a quote,
 * or at an "and" that brings in a new subject ("…and then she hugged",
 * "…and Baba Sule laughed"), but never inside two names joined ("Ada and
 * Kofi walked home").
 */
function clauseStart(
  outside: string,
  at: number,
  names: readonly { at: number; end: number }[],
): number {
  const before = outside.slice(0, at);
  let start = 0;
  for (const m of before.matchAll(
    /[.!?;:,—–]\s*|\b(?:and|but|then|so|while|as|when)\s+(?=(?:then\s+|so\s+)?(?:he|she)\b)/giu,
  ))
    start = Math.max(start, m.index + m[0].length);
  // A quote, blanked in the narration, is a stop too.
  const blank = before.lastIndexOf('  ');
  if (blank >= 0) start = Math.max(start, blank + 2);
  for (const name of names) {
    if (name.at >= at) break;
    const joined = /\b(?:and|but|then|so|while|as|when)\s+$/iu.exec(
      outside.slice(0, name.at),
    );
    if (!joined) continue;
    const ended = outside.slice(0, joined.index).trimEnd().length;
    if (names.some((other) => other.end === ended)) continue;
    start = Math.max(start, name.at);
  }
  return start;
}

/**
 * What the narration of a page's sentences says its characters do, and
 * who comes and who goes, in the order it is said.
 */
export function directionsIn(
  sentences: readonly string[],
  actors: readonly Actor[],
  /** Other things on the page by id and name, to look or point at. */
  things: readonly Speaker[] = [],
  /** Each sentence's quoted lines and who says them: speaking is being mentioned. */
  lines: ReadonlyMap<
    number,
    readonly { span: [number, number]; speaker: string }[]
  > = new Map(),
  /** The things the page's words set on the stage, for "they ate" with nothing named. */
  props: readonly StageProp[] = [],
): { acts: NarratedAct[]; passages: Passage[]; business: PropBusiness[] } {
  const acts: NarratedAct[] = [];
  const passages: Passage[] = [];
  const business: PropBusiness[] = [];
  /** The thing last named: what "it" and "them" are. */
  let lastProp: StageProp | null = null;
  /** The first prop a text names, and where. */
  const propIn = (text: string): { prop: StageProp; at: number } | null => {
    let best: { prop: StageProp; at: number } | null = null;
    for (const [prop, words] of Object.entries(PROP_WORDS) as [
      StageProp,
      RegExp,
    ][]) {
      const m = words.exec(text);
      if (m && (!best || m.index < best.at)) best = { prop, at: m.index };
    }
    return best;
  };
  const genderOf = new Map(actors.map((a) => [a.id, a.gender ?? null]));
  /** Whoever was mentioned, the latest last. */
  const recent: string[] = [];
  const mention = (id: string) => {
    const i = recent.indexOf(id);
    if (i >= 0) recent.splice(i, 1);
    recent.push(id);
  };
  /** The last one mentioned who could be "she" or "he", other than those in `not`. */
  const pronounFor = (word: string, not: readonly string[] = []) => {
    const gender = /^(?:she|her)$/iu.test(word) ? 'f' : 'm';
    for (let i = recent.length - 1; i >= 0; i -= 1)
      if (!not.includes(recent[i]) && genderOf.get(recent[i]) === gender)
        return recent[i];
    return null;
  };

  sentences.forEach((sentence, beat) => {
    const quotes = quotedSpans(sentence);
    let outside = sentence;
    for (const [a, b] of quotes)
      outside = outside.slice(0, a) + ' '.repeat(b - a) + outside.slice(b);
    // Every verb in the narration, the first of any that overlap.
    const found: {
      at: number;
      end: number;
      does: Doing;
      object: 'must' | 'may' | 'none';
    }[] = [];
    for (const { pattern, does, object } of VERBS)
      for (const m of outside.matchAll(pattern))
        found.push({ at: m.index, end: m.index + m[0].length, does, object });
    found.sort((a, b) => a.at - b.at || b.end - a.end);
    const verbs = found.filter(
      (one, i) =>
        !found.slice(0, i).some((o) => o.at < one.end && one.at < o.end),
    );
    const names = namedIn(outside, actors);
    // Who is mentioned, and where: named in the narration, or speaking.
    const marks = [
      ...names.map((n) => ({ at: n.at, id: n.id })),
      ...(lines.get(beat) ?? []).map((line) => ({
        at: line.span[0],
        id: line.speaker,
      })),
    ].sort((a, b) => a.at - b.at);
    let marked = 0;
    const mentionUpTo = (at: number) => {
      while (marked < marks.length && marks[marked].at < at)
        mention(marks[marked++].id);
    };
    /** Whoever the sentence is about so far: the last to do something in it. */
    let subjects: string[] = [];

    for (const verb of verbs) {
      mentionUpTo(verb.at);
      const start = clauseStart(outside, verb.at, names);
      const prefix = outside.slice(start, verb.at);
      // The clause with its earlier verbs and what they did left out:
      // "waved goodbye and" before "walked on" is the same one going on.
      let bare = prefix;
      for (const earlier of verbs) {
        if (earlier.at < start || earlier.at >= verb.at) continue;
        const from = earlier.at - start;
        const upTo = bare.slice(from).search(/\b(?:and|then)\b|,/u);
        const to = upTo >= 0 ? from + upTo : bare.length;
        bare = bare.slice(0, from) + ' '.repeat(to - from) + bare.slice(to);
      }
      // Who does it: the one named right before the verb ("…and Baba
      // Sule laughed"), with anyone joined to them at the clause's start
      // ("Musa and Zainab ran off"); else "she" or "he" right before it;
      // else whoever leads the clause, name or pronoun, doing more than
      // one thing ("Musa stood up and put his arm…", "She smiled and
      // waved"); else, naming no one, whoever the sentence is about.
      const named = namedIn(prefix, actors);
      const last = named[named.length - 1];
      const pronoun = [...prefix.matchAll(/\b(she|he)\b/giu)].pop();
      const leads = (at: number) => LEAD.test(prefix.slice(0, at));
      const joined = (a: { end: number }, b: { at: number }) =>
        /^\s*,?\s*(?:and|&)?\s*$/iu.test(prefix.slice(a.end, b.at));
      let who: string[] = [];
      if (last && ADVERBS.test(prefix.slice(last.end))) {
        let first = named.length - 1;
        while (first > 0 && joined(named[first - 1], named[first])) first -= 1;
        who = leads(named[first].at)
          ? named.slice(first).map((n) => n.id)
          : [last.id];
      } else if (
        pronoun &&
        ADVERBS.test(prefix.slice(pronoun.index + pronoun[0].length))
      ) {
        const id = pronounFor(pronoun[1]);
        if (id) who = [id];
      } else if (named.length && leads(named[0].at)) {
        let end = 0;
        while (end + 1 < named.length && joined(named[end], named[end + 1]))
          end += 1;
        who = named.slice(0, end + 1).map((n) => n.id);
      } else if (pronoun && leads(pronoun.index)) {
        const id = pronounFor(pronoun[1]);
        if (id) who = [id];
      } else if (FILLER.test(bare)) {
        const lead = names.find(
          (n) =>
            n.at < verb.at &&
            LEAD.test(outside.slice(0, n.at).replace(/["“”‘’']/gu, ' ')),
        );
        who = subjects.length ? subjects : lead ? [lead.id] : [];
      }
      // "They ate", "they all drank": everyone the page has named so far.
      if (
        !who.length &&
        (verb.does === 'eat' || verb.does === 'drink') &&
        /\bthey\b(?:\s+(?:all|both|were|had|then|each))*\s*$/iu.test(bare)
      )
        who = recent.slice(-3);
      if (!who.length) continue;
      subjects = who;
      if (NOT_DONE.test(outside.slice(Math.max(0, verb.at - 24), verb.at)))
        continue;
      // "While they were eating", "as he was drinking": the meal going on
      // behind what happens, not a bite at a moment.
      if (
        (verb.does === 'eat' || verb.does === 'drink') &&
        /\b(?:(?:while|as)\s+(?:they|he|she|we|you|\p{L}+)\s+(?:(?:were|was|are|is)\s+)?|when\s+(?:they|he|she|we|you|\p{L}+)\s+(?:were|was|are|is)\s+)$/iu.test(
          outside.slice(Math.max(0, verb.at - 32), verb.at),
        )
      )
        continue;
      if (HABIT.test(outside.slice(0, verb.at))) continue;
      if (verb.does === 'enter' || verb.does === 'leave') {
        for (const id of who)
          passages.push({ beat, at: verb.at, who: id, how: verb.does });
        continue;
      }
      // Whom it is done to: the first named after it in the clause, else "him" or "her".
      const rest = outside.slice(verb.end);
      const clauseEnd = rest.search(/[.!?;:,]|\s{2}/u);
      const after = clauseEnd >= 0 ? rest.slice(0, clauseEnd) : rest;
      // What is done with a thing: the thing named after the verb, or "it",
      // or, eaten or drunk, what there is to eat or drink.
      const before = propIn(outside.slice(0, verb.at));
      if (before) lastProp = before.prop;
      if ((PROP_ACTIONS as readonly string[]).includes(verb.does)) {
        const does = verb.does as PropAction;
        const named = propIn(after);
        const it =
          /^\s*(?:\p{L}+ly\s+)?(?:it|them|some|one|a piece|a bit|pieces)\b/iu.test(
            after,
          );
        let prop: StageProp | null = named?.prop ?? (it ? lastProp : null);
        if (!prop && does === 'eat')
          prop = props.find((p) => PROP_KIND[p] === 'food') ?? null;
        if (!prop && does === 'drink')
          prop = props.find((p) => PROP_KIND[p] === 'drink') ?? null;
        if (!prop && does === 'dip')
          prop = props.includes('bowl') ? 'bowl' : null;
        if (!prop && (does === 'raise' || does === 'put')) prop = lastProp;
        if (prop) {
          lastProp = prop;
          const to =
            does === 'give'
              ? (namedIn(after, actors).find((n) => !who.includes(n.id))?.id ??
                null)
              : null;
          for (const id of who)
            business.push({ beat, at: verb.at, who: id, does, prop, to });
          continue;
        }
        // Given with no thing named: a hand held out to them, as before.
        if (does !== 'give') continue;
      }
      const does = verb.does === 'give' ? 'reach' : (verb.does as NarratedMove);
      let toward: string | null =
        namedIn(after, actors).find((n) => !who.includes(n.id))?.id ??
        namedIn(after, things)[0]?.id ??
        null;
      if (!toward) {
        const object =
          /\b(him)\b|\b(her)\b(?=\s*(?:$|[,.;!?]|and\b|as\b|close\b|tight(?:ly)?\b|goodbye\b|back\b|again\b|too\b|gently\b|warmly\b|softly\b))/iu.exec(
            after,
          );
        const word = object?.[1] ?? object?.[2];
        if (word) toward = pronounFor(word, who);
      }
      const looking = /\b(up|down)\b/iu.exec(outside.slice(verb.at, verb.end));
      if (does === 'look') {
        if (!toward && looking)
          toward = looking[1].toLowerCase() === 'up' ? '@up' : '@down';
        if (!toward) continue;
      }
      if (does === 'point' && !toward && looking?.[1].toLowerCase() === 'up')
        toward = '@up';
      if (verb.object === 'must' && !toward) continue;
      for (const id of who)
        acts.push({ beat, at: verb.at, who: id, do: does, toward });
    }
    mentionUpTo(Infinity);
    // What the whole sentence names last is what the next "it" is.
    const named = [...Object.entries(PROP_WORDS)]
      .map(([prop, words]) => ({
        prop: prop as StageProp,
        at: outside.search(new RegExp(words.source, 'giu')),
      }))
      .filter((f) => f.at >= 0)
      .sort((a, b) => b.at - a.at)[0];
    if (named) lastProp = named.prop;
  });
  return { acts, passages, business };
}
