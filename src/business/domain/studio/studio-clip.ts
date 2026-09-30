/**
 * Story clips inside explainers (studio-explainer-plan, Ask 5). A concept
 * that is really about people and a moment (a nurse reading a child's
 * thermometer, to explain a fever) is shown as a short acted scene of 6 to
 * 20 seconds, made by the Studio's story pipeline, between the lesson's
 * own scenes. Richard, 2026-09-30: the outline writer decides where a clip
 * helps; there is no switch for the maker, and code holds every limit.
 *
 * All of it is code, and pure:
 *
 *  - the outline's gate (gateClips): at most two clips an episode, one a
 *    minute and a half, a quarter of the film at most, each 6 to 20
 *    seconds, never at the end nor after another; one that breaks a limit
 *    is quietly a lesson scene, and every clip gets a hook line;
 *  - the explainer's cast (clipBible): three people at most, each one the
 *    kits draw, and two places, only one of them painted by the model;
 *    the rest built from a layout code already has (presetLayout);
 *  - the clip's sheet, put right (mendClip): its title the idea's label,
 *    lines of twelve words, one narration, an insert on the key thing and
 *    a 600 ms hold at the idea's moment;
 *  - the film: the freeze at the idea (clipFreeze), the next lesson's card
 *    of the clip's last frame (withClipCard, withStill), its first line the
 *    hook (hookFirst), and the joins in and out (clipJoin).
 *
 * Studio code only: nothing here reaches into the reader or the library.
 */
import type {
  SceneDto,
  SceneFreezeDto,
  StudioJoinName,
  StudioJoinWithDto,
} from '../../../contracts';
import type { GatedDrawing } from '../scene-svg';
import {
  MAX_ON_STAGE,
  type SceneLayout,
  type SceneScript,
} from '../scene-script';
import type { SetLook } from '../scene-set-layout';
import type { StoryBible } from '../scene-story';
import { THEMES, type ThemeId } from '../scene-themes';
import {
  CLIP_SECONDS,
  SCENE_SECONDS,
  type ExplainerSheet,
  type OutlineScene,
  type SceneSheet,
  type SheetBeat,
  type StorySheet,
  type StudioBible,
  type StudioBrief,
  type StudioCharacter,
  type StudioOutline,
  type StudioSet,
} from './studio';
import { characterId, setId } from './studio-check';

export { CLIP_SECONDS };

/** The most clips an episode has, and the runtime each one needs (one a minute and a half). */
export const CLIP_MOST = 2;
export const CLIP_EVERY_S = 90;
/** The most of an episode's runtime its clips may take. */
export const CLIP_SHARE = 0.25;
/** An explainer's cast for its clips: people, and places. */
export const CLIP_CAST_MOST = 3;
export const CLIP_SETS_MOST = 2;
/** A clip's beats that act or speak, least and most (reactions and quiet aside). */
export const CLIP_BEATS = [2, 6] as const;
/** The most words a line of a clip has. */
export const CLIP_LINE_WORDS = 12;
/** The hold at the idea's moment: a quiet of this long, the picture frozen over it. */
export const CLIP_HOLD_S = 0.6;
export const FREEZE_MS = Math.round(CLIP_HOLD_S * 1000);
/** The most words the idea's label has on the stage. */
export const LABEL_WORDS = 6;
/** The card the clip becomes on the next lesson's stage: its id there. */
export const CLIP_CARD = 'clip-card';
/** The looks whose way into a clip is an iris, not a dissolve. */
const IRIS_LOOKS: ReadonlySet<ThemeId> = new Set(['sunny', 'chalkboard']);

/** Whether an outline's scene is a story clip. */
export const isClip = (scene: Pick<OutlineScene, 'kind'> | null | undefined) =>
  scene?.kind === 'clip';

const words = (text: string) => text.split(/\s+/).filter(Boolean);
const lowerFirst = (text: string) =>
  text ? `${text.charAt(0).toLowerCase()}${text.slice(1)}` : text;

/** The line the lesson after a clip opens with, pointing back to it: the writer's, else one made from what it shows. */
export function hookOf(
  scene: Pick<OutlineScene, 'hook' | 'teach' | 'summary'>,
): string {
  const said = scene.hook?.trim();
  if (said) return said;
  const shows = (scene.teach || scene.summary || '').trim().replace(/\.+$/, '');
  return shows
    ? `Think about what we just saw: ${lowerFirst(shows)}.`
    : 'Think about what we just saw.';
}

/** A clip made a lesson scene: what it shows is what it teaches, and nothing of a clip is kept. */
function asLesson(scene: OutlineScene): OutlineScene {
  const teach = [scene.teach, scene.summary]
    .filter((one): one is string => Boolean(one?.trim()))
    .filter((one, k, all) => all.indexOf(one) === k)
    .join(' ');
  return {
    title: scene.title,
    summary: scene.summary,
    set: null,
    cast: [],
    seconds: Math.max(SCENE_SECONDS[0], scene.seconds),
    teach: teach || null,
    points: scene.points,
    ...(scene.pages ? { pages: scene.pages } : {}),
    ...(scene.into ? { into: scene.into } : {}),
  };
}

/**
 * An explainer's outline held to the clips' limits, silently: each clip
 * 6 to 20 seconds, in a place of the show's with its people, at most one
 * new face a clip after the first; and a clip that would be one too many
 * (two an episode, one a minute and a half), take more than a quarter of
 * the film, end it, or follow another clip, is a lesson scene instead.
 * Every clip kept has its hook. What was put right, for the log.
 */
export function gateClips(
  outline: StudioOutline,
  bible: StudioBible,
): { outline: StudioOutline; fixed: string[] } {
  const fixed: string[] = [];
  const seconds = (scene: OutlineScene) =>
    isClip(scene)
      ? Math.min(CLIP_SECONDS[1], Math.max(CLIP_SECONDS[0], scene.seconds))
      : scene.seconds;
  const total = outline.scenes.reduce((n, s) => n + seconds(s), 0);
  const allowed = Math.min(
    CLIP_MOST,
    Math.max(1, Math.floor(total / CLIP_EVERY_S)),
  );
  let clips = 0;
  let clipSeconds = 0;
  const met = new Set<string>();
  const scenes: OutlineScene[] = [];
  outline.scenes.forEach((scene, k) => {
    if (!isClip(scene)) {
      scenes.push(scene);
      return;
    }
    const n = k + 1;
    const long = seconds(scene);
    if (long !== scene.seconds)
      fixed.push(`clip ${n} runs ${long}s, not ${scene.seconds}s`);
    // In one of the show's places; with one only, there.
    const set =
      setId(scene.set, bible) ??
      (bible.sets.length === 1 ? bible.sets[0].id : null);
    let cast = [
      ...new Set(
        scene.cast
          .map((id) => characterId(id, bible))
          .filter((id): id is string => Boolean(id)),
      ),
    ].slice(0, CLIP_CAST_MOST);
    // The same faces come back: after the first clip, one new face a clip.
    if (clips > 0) {
      const fresh = cast.filter((id) => !met.has(id));
      if (fresh.length > 1) {
        cast = cast.filter((id) => met.has(id) || id === fresh[0]);
        fixed.push(
          `clip ${n} keeps one new face: ${fresh.slice(1).join(', ')} left out`,
        );
      }
    }
    const before = scenes[scenes.length - 1];
    const why = !set
      ? 'it is in none of the show’s places'
      : !cast.length
        ? 'no one of the show is in it'
        : clips >= allowed
          ? `the episode has room for ${allowed} clip${allowed === 1 ? '' : 's'}`
          : clipSeconds + long > total * CLIP_SHARE
            ? 'the clips would take more than a quarter of the film'
            : k === outline.scenes.length - 1
              ? 'it would end the film'
              : isClip(before)
                ? 'it follows another clip'
                : null;
    if (why) {
      fixed.push(`scene ${n} is a lesson, not a clip: ${why}`);
      scenes.push(asLesson({ ...scene, seconds: long }));
      return;
    }
    clips += 1;
    clipSeconds += long;
    for (const id of cast) met.add(id);
    if (!scene.hook?.trim()) fixed.push(`clip ${n} given its hook`);
    scenes.push({
      ...scene,
      kind: 'clip',
      set,
      cast,
      seconds: long,
      hook: hookOf(scene),
    });
  });
  return { outline: { ...outline, scenes }, fixed };
}

// ── The explainer's cast ──────────────────────────────────────────────────

/** Whether a kit draws them, at no cost: a person by the figure kit, an animal or a creature by its own. */
const kitDrawn = (c: StudioCharacter) =>
  c.kind === 'person'
    ? Boolean(c.figure)
    : c.kind === 'animal'
      ? Boolean(c.animal)
      : Boolean(c.creature);

/**
 * An explainer's cast for its clips, held by code: three people at most,
 * each one a kit draws; two places, the ones code has a layout for first,
 * and only one the painter paints for the show. What was left out, for
 * the log.
 */
export function clipBible(bible: StudioBible): {
  bible: StudioBible;
  dropped: string[];
} {
  const dropped: string[] = [];
  const characters = bible.characters.filter((c) => {
    if (kitDrawn(c)) return true;
    dropped.push(`${c.name} (no kit draws them)`);
    return false;
  });
  for (const c of characters.slice(CLIP_CAST_MOST))
    dropped.push(`${c.name} (three people at most)`);
  let painted = 0;
  const sets = [...bible.sets]
    .sort(
      (a, b) =>
        Number(Boolean(presetLayout(b))) - Number(Boolean(presetLayout(a))),
    )
    .filter((s) => {
      if (presetLayout(s)) return true;
      painted += 1;
      if (painted <= 1) return true;
      dropped.push(`${s.name} (one painted place a show)`);
      return false;
    });
  for (const s of sets.slice(CLIP_SETS_MOST))
    dropped.push(`${s.name} (two places at most)`);
  return {
    bible: {
      ...bible,
      characters: characters.slice(0, CLIP_CAST_MOST),
      sets: sets.slice(0, CLIP_SETS_MOST),
    },
    dropped,
  };
}

/** A room's things placed along its back wall, left to right: a layout's items. */
const along = (
  ...kinds: (string | [string, number])[]
): { kind: string; x: number; row: string; scale: number; colour: null }[] =>
  kinds.map((one, k) => {
    const [kind, scale] = typeof one === 'string' ? [one, 1] : one;
    return {
      kind,
      x: Math.round(((k + 0.5) / kinds.length) * 100) / 100,
      row: 'back',
      scale,
      colour: null,
    };
  });

/**
 * The common places a clip happens in, each with a layout code builds
 * from the kit's own pieces (scene-set-layout), no model asked: by the
 * words of the place's name and look.
 */
const PRESETS: {
  words: RegExp;
  layout: Record<string, unknown>;
}[] = [
  {
    words:
      /\b(?:clinic|surgery|doctor'?s?|nurse'?s?|hospital|ward|sick ?bay|health (?:centre|center)|pharmacy)\b/u,
    layout: {
      sky: 'day',
      ground: 'tiles',
      items: along('cupboard', 'noticeboard', 'clock', 'shelf', 'plant'),
      style: 'modern-town',
    },
  },
  {
    words: /\b(?:classroom|class|school|lecture|tutor)\b/u,
    layout: {
      sky: 'day',
      ground: 'wood',
      items: along('noticeboard', 'whiteboard', 'clock', 'bookshelf'),
      style: 'modern-town',
    },
  },
  {
    words: /\b(?:lab|laboratory|science room)\b/u,
    layout: {
      sky: 'day',
      ground: 'tiles',
      items: along('shelf', 'whiteboard', 'cupboard', 'clock'),
      style: 'modern-town',
    },
  },
  {
    words: /\b(?:kitchen|bakery|cafe|café|canteen)\b/u,
    layout: {
      sky: 'day',
      ground: 'tiles',
      items: along('cupboard', 'shelf', 'clock', 'plant'),
      style: 'modern-town',
    },
  },
  {
    words: /\b(?:office|workplace|bank|studio|desk)\b/u,
    layout: {
      sky: 'day',
      ground: 'carpet',
      items: along('bookshelf', 'picture', 'noticeboard', 'plant'),
      style: 'modern-town',
    },
  },
  {
    words:
      /\b(?:living ?room|lounge|bedroom|sitting room|home|house|flat|apartment)\b/u,
    layout: {
      sky: 'day',
      ground: 'carpet',
      items: along('picture', 'curtains', 'lamp', 'plant'),
      style: 'modern-town',
    },
  },
  {
    words: /\b(?:market|stall|shop|store|grocer'?s?)\b/u,
    layout: {
      sky: 'day',
      ground: 'paving',
      backdrop: 'city',
      items: along('stall', 'basket', 'cart', 'parasol'),
      style: 'modern-town',
    },
  },
  {
    words: /\b(?:street|road|town|pavement|sidewalk|bus stop)\b/u,
    layout: {
      sky: 'day',
      ground: 'paving',
      backdrop: 'city',
      items: along('lamppost', 'house', 'bin', 'lamppost'),
      style: 'modern-town',
    },
  },
  {
    words: /\b(?:park|garden|playground|field|yard)\b/u,
    layout: {
      sky: 'day',
      ground: 'grass',
      backdrop: 'hills',
      items: along('tree', 'bush', 'flowers', ['tree', 0.9]),
      style: 'nature',
    },
  },
  {
    words: /\b(?:beach|seaside|shore)\b/u,
    layout: {
      sky: 'day',
      ground: 'sand',
      backdrop: 'sea',
      items: along('parasol', 'rock', 'sandcastle'),
      style: 'nature',
    },
  },
];

/** The layout code has for a place, from its name and look; null for a place it has none for (the painter writes one, once). */
export function presetLayout(
  set: Pick<StudioSet, 'name' | 'look'> & { kind?: StudioSet['kind'] },
): Record<string, unknown> | null {
  if (set.kind === 'vessel') return null;
  const said = `${set.name} ${set.look}`.toLowerCase();
  // By its name first: "the school nurse's room" is a clinic, not a classroom.
  const named = set.name.toLowerCase();
  const found =
    PRESETS.find((p) => p.words.test(named)) ??
    PRESETS.find((p) => p.words.test(said));
  return found ? { ...found.layout, weather: 'clear' } : null;
}

/** A clip's places as the stage paints them: from code's layout where it has one, else painted once, unjudged. */
export function withPresets(story: StoryBible): StoryBible {
  return {
    ...story,
    places: story.places.map((place) => {
      const layout = presetLayout({
        name: place.name,
        look: place.look,
        ...(place.kind ? { kind: place.kind } : {}),
      });
      return layout ? { ...place, layout } : { ...place, once: true as const };
    }),
  };
}

/** A clip's sets in the explainer's look: tinted a little toward its ground. Null on paper, the house look. */
export function clipLook(theme: ThemeId | null | undefined): SetLook | null {
  if (!theme || theme === 'paper') return null;
  const look = THEMES[theme];
  return { tint: look.paper, tintK: look.dark ? 0.1 : 0.06, ink: 1 };
}

/** The brief a clip is written and staged by: the explainer's, as a story with a light narrator in the lesson's voice. */
export function clipBrief(brief: StudioBrief): StudioBrief {
  const out: StudioBrief = { ...brief, format: 'story', narrator: 'light' };
  delete out.narratorCharacter;
  delete out.genre;
  delete out.ending;
  delete out.style;
  return out;
}

// ── Writing a clip ────────────────────────────────────────────────────────

/** How a clip is written, for its writer: the clip profile. */
export const CLIP_RULES = [
  'This is a story clip inside an animated lesson: one short acted moment that shows the idea, not a story of its own.',
  `- ${CLIP_BEATS[0]} to ${CLIP_BEATS[1]} beats that speak or act, and a reaction or two. Enter late: it opens in the middle of the moment, never on hellos.`,
  `- Lines of ${CLIP_LINE_WORDS} words at most, plain words for the audience.`,
  '- A light narrator may say one short line, to open it or close it, in the lesson narrator’s voice; the people carry the rest.',
  '- At the idea’s moment someone does it on the stage (an action or business: the thermometer read, the price tag turned): the key thing is handled and seen, and inserts has one close shot of it at that beat.',
  '- Right after that beat, a pause of 0.6 seconds: the picture freezes there.',
  '- title is the idea in two to five words, as it is set on the stage at the freeze ("39 degrees is a fever"): no names.',
  '- It ends on the idea shown: its last picture becomes a card in the next lesson scene.',
].join('\n');

/** Where a clip sits in its lesson, for its writer: what it shows, and the lesson either side. */
export function clipContext(outline: StudioOutline, k: number): string {
  const scene = outline.scenes[k];
  const before = outline.scenes[k - 1];
  const after = outline.scenes[k + 1];
  return [
    `"${outline.title}": ${outline.logline}`,
    before
      ? `The lesson scene before it teaches: ${before.teach ?? before.summary}`
      : 'It opens the film: the lesson after it explains what it shows.',
    `This clip shows: ${scene?.teach ?? scene?.summary ?? ''}`,
    after
      ? `The lesson scene after it teaches: ${after.teach ?? after.summary}`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}

const PAUSE: SheetBeat = {
  kind: 'pause',
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
  seconds: CLIP_HOLD_S,
};

/** Beats that speak or act. */
const counted = (beat: SheetBeat) =>
  beat.kind === 'line' ||
  beat.kind === 'narration' ||
  beat.kind === 'action' ||
  beat.kind === 'business';

/** A line cut to its first sentence or clause within the most words, where it has one; else as it was. */
function shortLine(say: string): string {
  const all = words(say);
  if (all.length <= CLIP_LINE_WORDS) return say;
  const head = all.slice(0, CLIP_LINE_WORDS).join(' ');
  const stop = Math.max(
    ...['. ', '! ', '? ', '; ', ', ', ' - ', ' — '].map((mark) =>
      `${head} `.lastIndexOf(mark),
    ),
  );
  if (stop < head.length * 0.4) return say;
  const cut = head.slice(0, stop).replace(/[,;:\-—\s]+$/u, '');
  return /[.!?]$/u.test(cut) ? cut : `${cut}.`;
}

/** The beat a clip's idea lands on: its insert's, else the first thing handled, else the first action, else its middle. */
export function ideaBeat(sheet: StorySheet): number {
  const insert = sheet.inserts?.[0]?.beat;
  if (insert !== undefined && sheet.beats[insert]) return insert;
  const handled = sheet.beats.findIndex(
    (b) => b.kind === 'business' && Boolean(b.thing ?? b.prop),
  );
  if (handled >= 0) return handled;
  const acted = sheet.beats.findIndex((b) => b.kind === 'action');
  if (acted >= 0) return acted;
  return Math.max(0, Math.floor((sheet.beats.length - 1) / 2));
}

/**
 * The idea's label on the stage: what the outline says the clip shows,
 * after its colon ("the nurse reads the thermometer: 39 degrees is a
 * fever"), where that is a few words; else the sheet's title, cut to a
 * few words (writers title a scene by who and where more often than by
 * its idea).
 */
export function labelOf(sheet: Pick<StorySheet, 'title'>, shows = ''): string {
  const idea = shows.includes(':')
    ? shows
        .slice(shows.indexOf(':') + 1)
        .trim()
        .replace(/[.!]+$/u, '')
    : '';
  const title = sheet.title.trim();
  const from =
    idea && words(idea).length <= LABEL_WORDS
      ? idea
      : title && title !== 'A scene'
        ? title
        : (shows.split(/[:.;!?]/u)[0] ?? '').trim();
  const cut = words(from)
    .slice(0, LABEL_WORDS)
    .join(' ')
    .replace(/[,;:\-—]+$/u, '');
  return cut ? `${cut.charAt(0).toUpperCase()}${cut.slice(1)}` : cut;
}

/**
 * A clip's sheet held to its profile by code, never sent back for it:
 * its title the idea's label; one narration at most, to open or close
 * it; lines cut to twelve words where they have a clause to cut at; no
 * more than six beats that speak or act, the idea's kept; one insert on
 * the key thing at the idea's beat; and the 600 ms hold right after it.
 */
export function mendClip(
  sheet: StorySheet,
  shows = '',
): { sheet: StorySheet; fixed: string[] } {
  const fixed: string[] = [];
  let beats = [...sheet.beats];
  let inserts = [...(sheet.inserts ?? [])];
  let camera = [...sheet.camera];
  /** Takes beat `k` out, and moves what is timed after it back one. */
  const drop = (k: number) => {
    beats.splice(k, 1);
    inserts = inserts
      .filter((one) => one.beat !== k)
      .map((one) => (one.beat > k ? { ...one, beat: one.beat - 1 } : one));
    camera = camera
      .filter((one) => one.beat !== k)
      .map((one) => (one.beat > k ? { ...one, beat: one.beat - 1 } : one));
  };
  // One narration, opening or closing it.
  const told = beats.flatMap((b, k) => (b.kind === 'narration' ? [k] : []));
  if (told.length > 1) {
    const keep = told[0] === 0 ? 0 : told[told.length - 1];
    for (const k of [...told].reverse()) if (k !== keep) drop(k);
    fixed.push(
      `${told.length - 1} narration${told.length > 2 ? 's' : ''} taken out`,
    );
  }
  // Lines short.
  beats = beats.map((b) => {
    if (b.kind !== 'line' && b.kind !== 'narration') return b;
    const say = shortLine(b.say);
    if (say === b.say) return b;
    fixed.push(`a line cut to "${say}"`);
    return { ...b, say };
  });
  // No more than six that speak or act: after the idea first, then before it.
  let idea = ideaBeat({ ...sheet, beats, inserts });
  while (beats.filter(counted).length > CLIP_BEATS[1]) {
    const after = beats.findLastIndex((b, k) => k > idea && counted(b));
    const before = beats.findIndex((b, k) => k > 0 && k < idea && counted(b));
    const k = after >= 0 ? after : before;
    if (k < 0) break;
    drop(k);
    if (k < idea) idea -= 1;
    fixed.push('a beat taken out, for its length');
  }
  // One insert, on the key thing at the idea.
  const beat = beats[idea];
  const thing = beat?.thing ?? beat?.prop ?? sheet.props[0]?.prop ?? null;
  const own = inserts.find((one) => one.beat === idea) ?? inserts[0];
  const insert = own ?? (thing ? { beat: idea, thing } : null);
  if (!own && insert) fixed.push(`an insert on the ${insert.thing}`);
  if (insert) {
    inserts = [insert];
    idea = insert.beat;
  }
  // The hold, straight after the idea.
  const next = beats[idea + 1];
  if (next?.kind === 'pause') {
    if ((next.seconds ?? 0) < CLIP_HOLD_S)
      beats[idea + 1] = { ...next, seconds: CLIP_HOLD_S };
  } else {
    beats.splice(idea + 1, 0, { ...PAUSE });
    camera = camera.map((one) =>
      one.beat > idea ? { ...one, beat: one.beat + 1 } : one,
    );
    fixed.push('the hold at the idea');
  }
  const title = labelOf(sheet, shows);
  if (title !== sheet.title) fixed.push(`labelled "${title}"`);
  const out: StorySheet = { ...sheet, title, beats, camera };
  if (inserts.length) out.inserts = inserts;
  else delete out.inserts;
  return { sheet: out, fixed };
}

// ── The film ──────────────────────────────────────────────────────────────

/**
 * A made clip's freeze: 600 ms at its idea, where its insert has come in
 * on the key thing (else three fifths of the way through its words), and
 * the label set from then on. Null for a scene too short to hold.
 */
export function clipFreeze(
  scene: Pick<SceneDto, 'durationMs' | 'effects' | 'beats'>,
  label: string,
): SceneFreezeDto | null {
  if (!label || scene.durationMs < FREEZE_MS * 3) return null;
  const insert = scene.effects.find((one) => one.shot?.kind === 'insert');
  const spoken = scene.beats;
  const at = insert
    ? Math.min(insert.atMs + 900, (insert.untilMs ?? Infinity) - FREEZE_MS)
    : spoken.length
      ? spoken[Math.max(0, Math.ceil(spoken.length * 0.6) - 1)].endMs
      : scene.durationMs * 0.6;
  return {
    atMs: Math.round(
      Math.min(scene.durationMs - FREEZE_MS, Math.max(FREEZE_MS, at)),
    ),
    ms: FREEZE_MS,
    label,
  };
}

/** The card's own drawing: a frame of the clip's shape, which the player lays the clip's still over. */
export function clipCardDrawing(): GatedDrawing {
  return {
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900"><rect x="10" y="10" width="1580" height="880" rx="44" fill="#FFFFFF" stroke="#1F2A37" stroke-width="14"/></svg>',
    viewBox: [0, 0, 1600, 900],
    aspect: 16 / 9,
    parts: {},
    labels: {},
    states: {},
    moves: false,
    callouts: [],
    field: null,
  };
}

/** A layout that has room for one more thing, the card first. */
function roomFor(layout: SceneLayout, count: number): SceneLayout {
  if (count <= 1) return 'one';
  if (
    layout === 'one' ||
    layout === 'compare' ||
    layout === 'hub' ||
    layout === 'cycle'
  )
    return count <= 3 ? 'row' : 'grid';
  return layout;
}

/**
 * The lesson after a clip, opening on the clip as a card: the first thing
 * on its stage, captioned with the idea's label, the diagram built around
 * it; it stays while the hook and the next sentence are said. Its
 * drawing is code's (clipCardDrawing), passed to the make as drawn.
 */
export function withClipCard(script: SceneScript, label: string): SceneScript {
  if (script.cast.some((thing) => thing.id === CLIP_CARD)) return script;
  const cast: SceneScript['cast'] = [
    ...script.cast,
    {
      id: CLIP_CARD,
      kind: 'drawing',
      name: label,
      brief: 'the story clip before, as a card',
      motion: '',
      parts: [],
      states: [],
      shape: 'wide',
      sound: null,
    },
  ];
  const steps = [...script.steps];
  const first = steps.findIndex((step) => step.stage);
  if (first < 0 || steps[first].at.beat > 0)
    steps.splice(Math.max(0, first), 0, {
      at: { beat: 0, phrase: '' },
      word: 0,
      stage: { layout: 'one', show: [CLIP_CARD], arrows: [] },
      effects: [],
    });
  let shown = 0;
  for (const [k, step] of steps.entries()) {
    if (!step.stage) continue;
    // With the hook and the sentence after it; then the lesson's own.
    if (shown > 0 && step.at.beat > 1) break;
    shown += 1;
    if (step.stage.show.includes(CLIP_CARD)) continue;
    const show = [CLIP_CARD, ...step.stage.show].slice(0, MAX_ON_STAGE);
    steps[k] = {
      ...step,
      stage: {
        ...step.stage,
        show,
        layout: roomFor(step.stage.layout, show.length),
        arrows: step.stage.arrows.filter(
          (a) => show.includes(a.from) && show.includes(a.to),
        ),
      },
    };
  }
  return { ...script, cast, steps };
}

/** The made lesson's card, told which scene it is a still of: the player lays that scene's last frame in it. */
export function withStill(scene: SceneDto, sceneId: string): SceneDto {
  return {
    ...scene,
    things: scene.things.map((thing) =>
      thing.id === CLIP_CARD && thing.kind === 'drawing'
        ? { ...thing, still: { sceneId, atMs: null } }
        : thing,
    ),
  };
}

const LITTLE = new Set(
  'a an the and or but of to in on at by for with from is are was were be it its this that these those we you they he she his her their our what how why when just saw see seen watch think about'.split(
    ' ',
  ),
);
/** The words that carry a sentence's meaning, plain. */
const keyWords = (text: string) =>
  new Set(
    words(text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ')).filter(
      (w) => w.length > 2 && !LITTLE.has(w),
    ),
  );

/** Whether a sentence points back to a clip: it says so, or shares two of its hook's words. */
function pointsBack(say: string, hook: string): boolean {
  if (
    /\b(?:just saw|we saw|you saw|just watched|remember|in that clip|did you see|did you notice)\b/iu.test(
      say,
    )
  )
    return true;
  const mine = keyWords(say);
  return [...keyWords(hook)].filter((w) => mine.has(w)).length >= 2;
}

/**
 * The lesson after a clip opens by pointing back to it: its first or
 * second sentence does, or the hook is said first, the storyboard moved
 * on one sentence so the card stands alone while it is said.
 */
export function hookFirst(
  sheet: ExplainerSheet,
  hook: string,
): { sheet: ExplainerSheet; fixed: boolean } {
  const beats = sheet.draft.beats;
  if (!hook.trim() || beats.slice(0, 2).some((b) => pointsBack(b.say, hook)))
    return { sheet, fixed: false };
  return {
    fixed: true,
    sheet: {
      ...sheet,
      draft: {
        ...sheet.draft,
        beats: [
          {
            say: hook.trim(),
            pause: 'short',
            delivery: 'hook',
            speaker: null,
            music: null,
            energy: null,
          },
          ...beats,
        ],
        steps: sheet.draft.steps.map((step) => ({
          ...step,
          beat: step.beat + 1,
        })),
      },
    },
  };
}

/**
 * Whether the lesson after a clip names the idea it showed, in its first
 * two sentences (the clarity bench): the clip's hook, or two of the words
 * of what it shows.
 */
export function namesClip(
  after: ExplainerSheet | null,
  clip: Pick<OutlineScene, 'hook' | 'teach' | 'summary'>,
): boolean {
  if (!after) return false;
  const first = after.draft.beats
    .slice(0, 2)
    .map((b) => b.say)
    .join(' ');
  if (clip.hook && pointsBack(first, clip.hook)) return true;
  const mine = keyWords(first);
  return (
    [...keyWords(clip.teach ?? clip.summary)].filter((w) => mine.has(w))
      .length >= 2
  );
}

/**
 * How the film goes into and out of a clip, by code: into it a dissolve,
 * or an iris on a Sunny or Chalkboard look; out of it, the clip's whole
 * picture shrinks into its card on the next lesson's stage (a match).
 * Null where neither side is a clip, or where the film opens on one.
 */
export function clipJoin(
  before: SceneSheet | null,
  after: SceneSheet | null,
  format: StudioBrief['format'],
  theme: ThemeId | null,
): { join: StudioJoinName; joinWith?: StudioJoinWithDto } | null {
  if (format !== 'explainer' || !before || !after) return null;
  if (after.kind === 'story' && before.kind === 'explainer')
    return { join: theme && IRIS_LOOKS.has(theme) ? 'iris' : 'dissolve' };
  if (before.kind === 'story' && after.kind === 'explainer')
    return { join: 'match', joinWith: { whole: true, to: CLIP_CARD } };
  return null;
}
