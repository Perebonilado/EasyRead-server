/**
 * How the voice says each sentence: the writer's delivery tag turned into
 * a pace and the silence after it.
 *
 * Every sentence at one pace with one of two pauses was a metronome, and
 * the people the videos were shown to heard it as flat. A person teaching
 * speeds up a little into a hook, slows on the point and leaves room after
 * it, and waits after a question long enough to think. The writer says
 * which sentence is which; the numbers are here, where they can be tuned
 * and tested, and a voice that takes a pace per sentence (Kokoro) says them.
 */
import {
  type SceneBeat,
  type SceneDelivery,
  type LineFrom,
  type LinePace,
  type SceneMood,
  type SceneScript,
} from './scene-script';
import {
  STORY_VOICES,
  type StoryBible,
  type StoryCharacter,
  type StoryVoice,
} from './scene-story';

/** The pace and the silence after a sentence, by how it is said. */
export const DELIVERY: Record<SceneDelivery, { speed: number; pause: number }> =
  {
    hook: { speed: 1.03, pause: 0.45 },
    explain: { speed: 1, pause: 0.35 },
    key: { speed: 0.93, pause: 0.7 },
    aside: { speed: 1.07, pause: 0.3 },
    question: { speed: 1, pause: 0.75 },
    recap: { speed: 0.96, pause: 0.5 },
  };

/** Where the idea changes, this much more silence. */
export const IDEA_CHANGE_S = 0.4;
/** The least silence before a key point: a beat before the reveal. */
export const BEFORE_KEY_S = 0.55;
/** No sentence faster or slower than this, whatever the tags add up to. */
export const SPEED_RANGE = [0.88, 1.1] as const;
/** No silence shorter or longer than this, in seconds. */
export const PAUSE_RANGE = [0.2, 1.4] as const;
/** The slowest a sentence is said, for the youngest learners. */
export const SLOWEST = 0.82;

const clamp = (n: number, [low, high]: readonly [number, number]) =>
  Math.min(high, Math.max(low, n));

/**
 * A screenplay's timing: a line at the speaker's own pace, the next line
 * close behind it as a conversation goes; the narrator a touch slower,
 * with a breath after.
 */
export const LINE_DELIVERY = { speed: 1, pause: 0.3 };
export const NARRATION_DELIVERY = { speed: 0.95, pause: 0.55 };
/** How a line's pace changes its speed. */
export const LINE_PACE_SPEED: Record<LinePace, number> = {
  calm: 1,
  quick: 1.07,
  slow: 0.9,
  whisper: 0.9,
  shout: 1.04,
};
/**
 * The longest silence a sentence may keep after it, for what happens in
 * it: a book's screenplay asks three seconds at most; a Studio scene up to
 * six (a look round), ten with an action in it (a throw, a jump, a thing
 * handled: studio-stage's ACTION_MOST_S), or twenty for a physical
 * sequence (a climb, a break-in, a chase: its SEQUENCE_MOST_S), carried by
 * its music.
 */
export const HOLD_LIMIT_S = 20;

/** Each sentence's pace and the silence after it, in seconds. */
/**
 * A line's pace by where it comes from: a thought is quieter and slower
 * than speech, and a voice from above is unhurried.
 */
const FROM_SPEED: Partial<Record<LineFrom, number>> = {
  thought: 0.92,
  above: 0.94,
  dream: 0.95,
};

export function deliveryPieces(
  beats: Pick<
    SceneBeat,
    'delivery' | 'pause' | 'kind' | 'pace' | 'holdS' | 'from'
  >[],
  /** Whom it is for: a child is spoken to more slowly, with longer pauses. */
  learners: { pace: number; pause: number } = { pace: 1, pause: 1 },
): { speed: number; pauseAfter: number }[] {
  return beats.map((beat, i) => {
    const how = beat.kind
      ? beat.kind === 'line'
        ? {
            speed:
              LINE_DELIVERY.speed *
              LINE_PACE_SPEED[beat.pace ?? 'calm'] *
              (FROM_SPEED[beat.from ?? 'here'] ?? 1),
            // Before the narrator comes in, a breath more.
            pause:
              beats[i + 1]?.kind === 'narration'
                ? NARRATION_DELIVERY.pause
                : LINE_DELIVERY.pause,
          }
        : NARRATION_DELIVERY
      : (DELIVERY[beat.delivery] ?? DELIVERY.explain);
    let pause = how.pause + (beat.pause === 'long' ? IDEA_CHANGE_S : 0);
    if (beats[i + 1]?.delivery === 'key' && !beat.kind)
      pause = Math.max(pause, BEFORE_KEY_S);
    const paused =
      Math.round(clamp(pause * learners.pause, PAUSE_RANGE) * 100) / 100;
    return {
      speed:
        Math.round(
          clamp(how.speed * learners.pace, [
            Math.min(SPEED_RANGE[0], SLOWEST),
            SPEED_RANGE[1],
          ]) * 100,
        ) / 100,
      // What happens after it without words takes its own time.
      pauseAfter: Math.min(HOLD_LIMIT_S, Math.max(paused, beat.holdS ?? 0)),
    };
  });
}

/**
 * The same tags as words, for a voice that takes direction (Gemini): how
 * the page feels and how this sentence goes, in a few words. Google's
 * guide (2026-09): the text is read as a verbatim transcript, so nothing
 * but the words goes in it; style is for emotion, pace and tone, kept
 * short, since more prompt text makes the voice drift; who the voice is
 * belongs to the voice itself, not to every sentence.
 */
export const MOOD_STYLE: Record<SceneMood, string> = {
  calm: 'calm and unhurried',
  bright: 'bright and upbeat',
  curious: 'curious, with a sense of wonder',
  serious: 'gentle and sober',
  playful: 'playful, with a smile in the voice',
};

/**
 * How each sentence goes, pace included: the voice takes no speed, so
 * the pace is said in words. About 140 to 160 words a minute is the pace
 * a listener understands best: slower for what is new or matters most, a
 * little quicker for what is known.
 */
export const DELIVERY_STYLE: Record<SceneDelivery, string> = {
  hook: 'inviting',
  explain: 'clear, unhurried',
  key: 'speaking slowly, landing it',
  aside: 'light, a little quicker',
  question: 'asking, then leaving room',
  recap: 'warm, steady',
};

/**
 * One sentence's direction: the page's mood, the sentence's delivery,
 * and the new term it says first, stressed.
 */
export function voiceStyle(
  mood: SceneMood,
  delivery: SceneDelivery,
  terms: readonly string[] = [],
): string {
  const stress = terms.length
    ? `; stressing ${terms
        .slice(0, 2)
        .map((term) => `"${term}"`)
        .join(' and ')}`
    : '';
  return `${MOOD_STYLE[mood] ?? MOOD_STYLE.curious}; ${DELIVERY_STYLE[delivery] ?? DELIVERY_STYLE.explain}${stress}`;
}

/**
 * A voice name as it goes into a file's name: a blend is joined with
 * commas ("af_heart,af_bella"), which a storage key should not carry.
 */
export const voiceSlug = (voice: string) =>
  voice.toLowerCase().replace(/[^a-z0-9_]+/g, '+');

/**
 * ElevenLabs' premade voices, by the name ElevenLabs gives them: in every
 * account, their ids fixed, so a character keeps theirs from episode to
 * episode. None is a child's or an old woman's (ElevenLabs makes no child
 * voices): the youngest and the most mature stand in, and the admin page
 * sets any voice the account has in their place.
 */
export const ELEVENLABS_PREMADE = {
  George: 'JBFqnCBsd6RMkjVDRZzb', // warm, captivating storyteller, British
  Alice: 'Xb7hH8MSUJpSbSDYk0k2', // clear, engaging educator, British
  Lily: 'pFZP5JQG7iQjIQuC4Bku', // velvety, British
  Matilda: 'XrExE9yKIg1WjnnlVkGX', // knowledgeable, alto
  Bella: 'hpp4J3VqNfWAUOO0d1Us', // bright, warm
  Sarah: 'EXAVITQu4vr4xnSDxMaL', // young, reassuring
  Laura: 'FGY2WhTYpPnrIDTdsKH5', // young, quirky enthusiast
  Jessica: 'cgSgspJ2msm6clMCkdW9', // young, playful, bright
  Liam: 'TX3LPaxmHKxFdv7VOQHJ', // young, energetic
  Will: 'bIHbv24MWmeRgasZH58o', // young, relaxed optimist
  Charlie: 'IKne3meq5aSn9XLyUdCD', // young, energetic, Australian
  Eric: 'cjVigY5qzO86Huf0OWal', // smooth tenor
  Chris: 'iP95p4xoKVk53GoZ742B', // charming, down to earth
  Roger: 'CwhRBWXzGAHq8TQ4Fs17', // laid back, resonant
  Harry: 'SOYHLrjzK2X1ezoPC6cr', // fierce warrior
  Callum: 'N2lVS1w4EtoT3dr4eOWO', // husky trickster
  River: 'SAz9YHcvj6GT2YYXdXww', // relaxed, neutral
  Brian: 'nPczCjzI2devNBz1zQrb', // deep, resonant, comforting
  Daniel: 'onwK4e9ZLuTAKqWW03F9', // steady broadcaster, British
  Bill: 'pqHfZKP75CvOlQylNhV4', // wise, mature, old
} as const;

/** The narrator's voice on ElevenLabs when none is set: George, a storyteller. */
export const ELEVENLABS_NARRATOR = ELEVENLABS_PREMADE.George;

const el = (...names: (keyof typeof ELEVENLABS_PREMADE)[]) =>
  names.map((name) => ELEVENLABS_PREMADE[name]);

/**
 * Cartesia's own voices, by the name its library gives them now, and their
 * ids: in every account, fixed, so a character keeps theirs from episode
 * to episode (Cartesia renames voices now and then; the id stays). Its
 * library has children's voices, old people's, and characters for
 * creatures and a voice from above; Tessa, Maya, Dana, Marian, Leo, Kyle
 * and Gavin are the voices Cartesia names as its most emotive. Checked
 * against the library on 2026-09-28; the admin page sets any voice the
 * account has in their place.
 */
export const CARTESIA_LIBRARY = {
  Clyde: '98a34ef2-2140-4c28-9c71-663dc4dd7022', // gentle, measured, warm storyteller: the narrator
  Daisy: '32b3f3c5-7171-46aa-abe7-b598964aa793', // a very young girl
  Dottie: 'e3827ec5-697a-4b7c-9704-1a23041bbc51', // a very young girl, earnest
  Lulu: 'e13cae5c-ec59-4f71-b0a6-266df3c9bb8e', // a young girl, squeaky
  Child: '2ee87190-8f84-4925-97da-e52547f9462c', // a child
  Zeke: 'e00d0e4c-a5c8-443f-a8a3-473eb9a62355', // high, young male
  Casper: '4f7f1324-1853-48a6-b294-4e78e8036a83', // wistful, young male
  Tessa: '6ccbfb76-1fc6-48f7-b71d-91ac6298247b', // warm, emotive
  Maya: 'cbaf8084-f009-4838-a096-07ee2e6612b1', // clear, emotive
  Lauren: 'a33f7a4c-100f-41cf-a1fd-5822e8fc253f', // expressive storyteller
  Dana: 'cc00e582-ed66-4004-8336-0175b85c85f6', // calm, emotive
  Leo: '0834f3df-e650-4766-a20c-5a93a43aa6e3', // warm, emotive
  Kyle: 'c961b81c-a935-4c17-bfb3-ba2239de8c2f', // warm, emotive
  Clint: 'db69127a-dbaf-4fa9-b425-2fe67680c348', // raspy, rugged, for acting
  Gavin: 'f4a3a8e4-694c-4c45-9ca0-27caf97901b5', // relaxed, emotive
  Edith: 'c8605446-247c-4d39-acd4-8f4c28aa363c', // elderly, wise
  Marge: 'a2364c9d-1fe3-4553-9eff-100c4fe5ffc8', // wise, mature, storyteller
  Marian: '26403c37-80c1-4a1a-8692-540551ca2ae5', // mature, calm, emotive
  Griffin: 'c99d36f3-5ffd-4253-803a-535c1bc9c306', // elderly, British
  Trevor: 'c45bc5ec-dc68-4feb-8829-6e6b2748095d', // deep, elderly
  Alaric: '87748186-23bb-4158-a1eb-332911b0b708', // wistful, wise, elderly
  Elias: '6a176356-ada1-4b48-b2ae-3a3fdd485680', // deep, for game characters
  Thistle: 'fb26447f-308b-471e-8b00-8e9f04284eb5', // whimsical troublemaker
  Matt: 'bfd3644b-d561-4b1c-a01f-d9af98cb67c0', // high, silly
  Caspian: 'd7862948-75c3-4c7c-ae28-2959fe166f49', // echoing, mystical, gravitas
  James: '42b39f37-515f-4eee-8546-73e841679c1d', // very deep, authoritative
  Sterling: 'b134c304-d095-4d2b-a77a-914f5e8e84e7', // deep, commanding, dignified
  Grant: 'd46abd1d-2d02-43e8-819f-51fb652c1c61', // plain, clear
  Ruth: '11af83e2-23eb-452f-956e-7fee218ccb5c', // plain, firm
  Jace: '6776173b-fd72-460d-89b3-d85812ee518d', // plain, easy-going
} as const;

/** The narrator's voice on Cartesia when none is set: Clyde, a storyteller. */
export const CARTESIA_NARRATOR = CARTESIA_LIBRARY.Clyde;

const ca = (...names: (keyof typeof CARTESIA_LIBRARY)[]) =>
  names.map((name) => CARTESIA_LIBRARY[name]);

/** The engines whose characters have voices of their own. */
export type CastEngine = 'kokoro' | 'gemini' | 'elevenlabs' | 'cartesia';

/** The voices a story's characters speak in, by engine and by kind: never the narrator's own. */
export const CHARACTER_VOICES: Record<
  CastEngine,
  Record<StoryVoice, string[]>
> = {
  kokoro: {
    girl: ['af_sky', 'af_nova', 'bf_lily'],
    boy: ['am_puck', 'am_echo', 'am_liam'],
    woman: ['af_bella', 'bf_emma', 'af_sarah', 'af_jessica'],
    man: ['am_michael', 'am_eric', 'bm_lewis', 'am_adam'],
    'old woman': ['bf_alice', 'bf_isabella', 'af_aoede'],
    'old man': ['bm_george', 'am_santa', 'bm_daniel'],
    creature: ['bm_fable', 'am_fenrir', 'am_onyx'],
    // Blends, evenly: voices no one character has. God's is deep and calm;
    // a crowd's is a man and a woman as one.
    divine: ['am_onyx,bm_george', 'am_onyx,bm_daniel', 'am_fenrir,bm_george'],
    crowd: ['am_michael,af_bella', 'am_eric,af_sarah', 'bm_lewis,bf_emma'],
  },
  gemini: {
    girl: ['Leda', 'Aoede', 'Laomedeia'],
    boy: ['Puck', 'Zubenelgenubi', 'Sadachbia'],
    woman: ['Kore', 'Despina', 'Callirrhoe', 'Erinome'],
    man: ['Charon', 'Iapetus', 'Orus', 'Alnilam'],
    'old woman': ['Gacrux', 'Vindemiatrix', 'Achernar'],
    'old man': ['Algenib', 'Schedar', 'Rasalgethi'],
    creature: ['Fenrir', 'Enceladus', 'Umbriel'],
    divine: ['Algieba', 'Sadaltager', 'Achird'],
    crowd: ['Zephyr', 'Autonoe', 'Pulcherrima'],
  },
  // Voice ids: ElevenLabs has no blends, so God's is the deepest and
  // calmest, and a crowd's the plainest.
  elevenlabs: {
    girl: el('Jessica', 'Laura', 'Sarah'),
    boy: el('Liam', 'Will', 'Charlie'),
    woman: el('Matilda', 'Bella', 'Alice'),
    man: el('Eric', 'Chris', 'Harry'),
    'old woman': el('Lily', 'Alice', 'Matilda'),
    'old man': el('Bill', 'Daniel', 'Roger'),
    creature: el('Callum', 'Harry', 'River'),
    divine: el('Brian', 'Daniel', 'Bill'),
    crowd: el('River', 'Roger', 'Chris'),
  },
  // Voice ids from Cartesia's library: no blends either, so God's is the
  // echoing, mystical one and the deepest, and a crowd's the plainest.
  cartesia: {
    girl: ca('Daisy', 'Dottie', 'Lulu'),
    boy: ca('Child', 'Zeke', 'Casper'),
    woman: ca('Tessa', 'Maya', 'Lauren', 'Dana'),
    man: ca('Leo', 'Clint', 'Kyle', 'Gavin'),
    'old woman': ca('Edith', 'Marge', 'Marian'),
    'old man': ca('Griffin', 'Trevor', 'Alaric'),
    creature: ca('Elias', 'Thistle', 'Matt'),
    divine: ca('Caspian', 'James', 'Sterling'),
    crowd: ca('Grant', 'Ruth', 'Jace'),
  },
};

/**
 * The engines with a list of voices to choose from (ElevenLabs', Cartesia's):
 * the admin page gives the narrator and each kind of character one of them.
 */
export const LISTED_ENGINES = ['elevenlabs', 'cartesia'] as const;
export type ListedEngine = (typeof LISTED_ENGINES)[number];

export const isListedEngine = (value: unknown): value is ListedEngine =>
  LISTED_ENGINES.includes(value as ListedEngine);

/**
 * Who the admin may give a voice of their own on an engine with a list to
 * choose from (ElevenLabs): the narrator, and each kind of character.
 */
export const VOICE_ROLES = ['narrator', ...STORY_VOICES] as const;
export type VoiceRole = (typeof VOICE_ROLES)[number];
/** The admin's voices by role, where chosen; the rest keep the palette's. */
export type VoiceCast = Partial<Record<VoiceRole, string>>;

export const isVoiceRole = (value: unknown): value is VoiceRole =>
  VOICE_ROLES.includes(value as VoiceRole);

/** An ElevenLabs voice id as the admin may set one: letters and digits only. */
export const isElevenLabsVoiceId = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9]{12,40}$/.test(value);

/** A Cartesia voice id as the admin may set one: a UUID. */
export const isCartesiaVoiceId = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

/** Whether a value could be one of an engine's voice ids. */
export const isVoiceIdOf = (engine: ListedEngine, value: unknown): boolean =>
  engine === 'cartesia' ? isCartesiaVoiceId(value) : isElevenLabsVoiceId(value);

/** How quickly each kind speaks, against the sentence's own pace. */
export const CHARACTER_PACE: Record<StoryVoice, number> = {
  girl: 1.06,
  boy: 1.06,
  woman: 1,
  man: 0.98,
  'old woman': 0.93,
  'old man': 0.92,
  creature: 1,
  divine: 0.88,
  crowd: 1,
};

/** How each kind is asked to sound, for a voice that takes direction. */
const CHARACTER_MANNER: Partial<Record<StoryVoice, string>> = {
  divine: 'deep, calm and unhurried, a voice from above',
  crowd: 'many voices speaking as one, a crowd',
};

/** Who says a sentence's quoted words, and how. */
export interface Speaker {
  voice: string;
  /** Against the sentence's pace. */
  pace: number;
  /** Direction, for a voice that takes it. */
  style: string;
}

/**
 * The voice a character speaks in, the same every page: the next of their
 * kind's voices in the order the book met them, never the narrator's.
 * Null for a character with no voice of their own, or an engine with no
 * palette: the narrator says their lines.
 */
export function characterVoice(
  bible: StoryBible,
  character: StoryCharacter,
  engine: CastEngine | null,
  narrator: string,
  /** The admin's voice for a kind, first of its kind's; the rest follow. */
  chosen: VoiceCast = {},
): Speaker | null {
  // Someone the text's tradition never draws is never voiced either: the
  // narrator says their words.
  if (!engine || !character.voice || character.presence === 'light')
    return null;
  const own = new Set(narrator.toLowerCase().split(','));
  const first = chosen[character.voice];
  const palette = [
    ...new Set([
      ...(first ? [first] : []),
      ...CHARACTER_VOICES[engine][character.voice],
    ]),
  ].filter((voice) => !own.has(voice.toLowerCase()));
  if (!palette.length) return null;
  const before = bible.characters.filter(
    (c) => c.voice === character.voice && c.met < character.met,
  ).length;
  const kind = character.voice;
  // A voice someone chose is theirs; else the next of their kind's.
  const pick =
    character.voicePick !== undefined &&
    character.voicePick !== null &&
    character.voicePick >= 0
      ? character.voicePick
      : before;
  return {
    voice: palette[pick % palette.length],
    pace: CHARACTER_PACE[kind],
    style: `as ${character.name}, ${CHARACTER_MANNER[kind] ?? (kind === 'creature' ? 'a creature' : `${/^[aeiou]/.test(kind) ? 'an' : 'a'} ${kind}`)}${character.traits.length ? `, ${character.traits.join(', ')}` : ''}, saying their own line`,
  };
}

/**
 * One of the cast telling the story (a Studio show's "character"
 * narrator): their own voice, at their pace, directed as telling it in
 * the first person. Null when they have no voice of their own: the
 * narrator's own says it.
 */
export function narratingSpeaker(speaker: Speaker | null): Speaker | null {
  return speaker
    ? {
        ...speaker,
        style: `${speaker.style.replace(/, saying their own line$/u, '')}, telling the story in their own words`,
      }
    : null;
}

/** A breath between the narrator and a character within one sentence. */
export const TURN_S = 0.12;

/** One piece of narration as the voice is sent it, and the sentence it is part of. */
export interface VoicedPiece {
  text: string;
  speed: number;
  pauseAfter: number;
  style?: string;
  /** Another voice than the narrator's: a character's. */
  voice?: string;
  beat: number;
}

/**
 * The narration as the voice is sent it: a piece a sentence, at its pace
 * with its silence after; and a sentence that quotes the story's
 * characters parted at each quotation, each line in its own speaker's
 * voice at their own pace, the narrator saying the rest. Two characters
 * in one sentence each say their own. Every piece says words: a mark with
 * none of its own goes with the words after it.
 */
export function voicedPieces(input: {
  texts: string[];
  delivered: { speed: number; pauseAfter: number }[];
  styles: string[];
  /** Each sentence's lines said by a character: where in its text, and by whom. */
  lines: { span: [number, number]; speaker: Speaker }[][];
}): VoicedPiece[] {
  const out: VoicedPiece[] = [];
  input.texts.forEach((text, beat) => {
    const { speed, pauseAfter } = input.delivered[beat];
    const style = input.styles[beat];
    const lines = [...(input.lines[beat] ?? [])].sort(
      (a, b) => a.span[0] - b.span[0],
    );
    if (!lines.length) {
      out.push({ text, speed, pauseAfter, style, beat });
      return;
    }
    // The sentence cut at each line's edges, the narrator's words between.
    const parts: { text: string; speaker: Speaker | null }[] = [];
    let carried = '';
    const part = (piece: string, speaker: Speaker | null) => {
      const joined = `${carried}${piece}`;
      if (!/\p{L}|\p{N}/u.test(joined)) {
        carried = joined;
        return;
      }
      carried = '';
      parts.push({ text: joined.trim(), speaker });
    };
    let at = 0;
    for (const { span, speaker } of lines) {
      if (span[0] < at) continue;
      if (span[0] > at) part(text.slice(at, span[0]), null);
      part(text.slice(span[0], span[1]), speaker);
      at = span[1];
    }
    if (at < text.length) part(text.slice(at), null);
    if (carried && parts.length)
      parts[parts.length - 1].text =
        `${parts[parts.length - 1].text}${carried}`.trim();
    parts.forEach(({ text: said, speaker }, i) => {
      const last = i === parts.length - 1;
      out.push({
        text: said,
        speed: speaker ? Math.round(speed * speaker.pace * 100) / 100 : speed,
        pauseAfter: last ? pauseAfter : TURN_S,
        style: speaker ? speaker.style : style,
        ...(speaker ? { voice: speaker.voice } : {}),
        beat,
      });
    });
  });
  return out;
}

/** Where each sentence starts on the audio: where its first piece does. */
export function sentenceStarts(
  pieces: { beat: number }[],
  pieceStartsMs: number[] | undefined,
  count: number,
): number[] | undefined {
  if (!pieceStartsMs || pieceStartsMs.length !== pieces.length)
    return undefined;
  const starts: number[] = [];
  for (let beat = 0; beat < count; beat += 1) {
    const first = pieces.findIndex((piece) => piece.beat === beat);
    if (first < 0) return undefined;
    starts.push(pieceStartsMs[first]);
  }
  return starts;
}

/**
 * Visualize's voice engines: Google's Gemini, our own Kokoro server on
 * Railway, OpenAI's, ElevenLabs' or Cartesia's. The admin picks one while
 * the app runs.
 */
export const SCENE_VOICE_ENGINES = [
  'gemini',
  'kokoro',
  'openai',
  'elevenlabs',
  'cartesia',
] as const;
export type SceneVoiceEngine = (typeof SCENE_VOICE_ENGINES)[number];

export const isSceneVoiceEngine = (value: unknown): value is SceneVoiceEngine =>
  SCENE_VOICE_ENGINES.includes(value as SceneVoiceEngine);

/**
 * The engine the deployment names for itself, before any choice:
 * SCENE_VOICE_ENGINE when it names one that is ready, else our own
 * server when it is set up, else OpenAI.
 */
export function deploymentEngine(
  named: string | undefined,
  ready: Record<SceneVoiceEngine, boolean>,
): SceneVoiceEngine {
  const wanted = named?.trim().toLowerCase();
  if (isSceneVoiceEngine(wanted) && ready[wanted]) return wanted;
  return ready.kokoro ? 'kokoro' : 'openai';
}

/** The engine a page is voiced by: the admin's choice while it is ready, else the deployment's. */
export function sceneEngine(
  chosen: SceneVoiceEngine | null,
  named: string | undefined,
  ready: Record<SceneVoiceEngine, boolean>,
): SceneVoiceEngine {
  return chosen && ready[chosen] ? chosen : deploymentEngine(named, ready);
}

/** What of a sentence its voice is made from: its words, who says them and how, and the quiet after. */
const voicedOf = (beat: SceneBeat) => [
  beat.say,
  beat.pause,
  beat.delivery,
  beat.kind ?? null,
  beat.pace ?? null,
  beat.from ?? null,
  beat.holdS ?? null,
  beat.speaker ?? null,
  beat.lines ?? null,
];

/**
 * Whether two scripts are voiced alike: the same sentences said the same
 * way by the same people, with the same quiet after each and before the
 * first. A scene staged again that is voiced alike is composed on the
 * voice it was made with, never voiced again.
 */
export function voicedAlike(
  a: Pick<SceneScript, 'beats' | 'mood' | 'lead' | 'opening' | 'narrator'>,
  b: Pick<SceneScript, 'beats' | 'mood' | 'lead' | 'opening' | 'narrator'>,
): boolean {
  const said = (script: typeof a) =>
    JSON.stringify([
      script.mood,
      script.lead ?? 0,
      script.opening?.show.length ? 1 : 0,
      script.beats.map(voicedOf),
      // Who tells it: the narrator's own voice, or one of the cast's.
      ...(script.narrator ? [script.narrator] : []),
    ]);
  return said(a) === said(b);
}
