/**
 * Faces directed (studio-faces-plan): a made film's rigged faces given a
 * rest and a rhythm, from what the performance layer asked of them. The
 * acting asks a face for every line, every word that hits, every
 * bystander, and the sheet's own faces come as the kit's (a determined
 * line as "angry"); played as asked, a face changed every second or two,
 * and between opposites. Directed:
 *
 *  - each one rests at the scene's mood for them (SceneActingDto.rest):
 *    their opening face, their feeling in their lines (what they feel
 *    beneath what they say), the scene's mood where they show none, soft;
 *    changing only at a turn of the scene (a story moment, or two
 *    feelings running the other way);
 *  - a face changes only for a reason, each a deviation from the rest
 *    that eases back to it: the feeling of their own line, a story moment
 *    the sheet gives them, a reaction to a line said to them;
 *  - held at least FACE_HOLD_MS (longer for young children), at most one
 *    change every FACE_GAP_MS or so; never to the opposite within
 *    SWING_MS unless the story says so; a reaction like the last one
 *    reuses its face instead of trying another;
 *  - a listener's face fits the line (a tender line is met softly, never
 *    with fear); one asleep does not react;
 *  - mostly subtle, full only for a big moment; for young children fewer,
 *    clearer and gentler (furious as angry, terror as fear), and no
 *    micro-expressions.
 *
 * Pure, and a function of the made scene alone (so a scene made before it
 * is directed the same), deterministic; the player eases between keys.
 */
import type { SceneActingDto, SceneDto, SceneEffectDto } from '../../contracts';
import { RECIPE_OF_FACE, isRecipe, type FaceKey } from './scene-face-rig';
import { opposite, reactionFits, valenceOf } from './scene-face-rhythm';

/** How the faces are directed: for young children, or older. */
export interface FaceDirection {
  young: boolean;
  /** The scene's mood (SceneScript.mood): what a face shows where nothing else says. */
  mood: string | null;
}

/** The least a face is held, ms. */
export const FACE_HOLD_MS = { young: 2000, older: 1600 };
/** The least between two changes of someone's face for a reaction, ms. */
export const FACE_GAP_MS = { young: 3500, older: 3000 };
/** Opposites closer than this are a swing, ms. */
export const FACE_SWING_MS = 3000;
/** How long a reaction is held before it eases back, ms. */
const REACT_HOLD_MS = { young: 3500, older: 3000 };
/** How long a story moment's face is held, ms. */
const BEAT_HOLD_MS = { young: 3500, older: 3000 };

/** How strongly each face is shown: the rest, a line, a reaction, a story moment, a big one. */
export const FACE_STRENGTH = {
  young: { rest: 0.3, line: 0.55, react: 0.45, beat: 0.7, big: 0.85 },
  older: { rest: 0.35, line: 0.65, react: 0.5, beat: 0.8, big: 1 },
};

/** Faces that are a moment's, never a mood: a start, a thought. */
const MOMENTARY: ReadonlySet<string> = new Set([
  'surprise',
  'shock',
  'thinking',
  'curious',
  'confused',
  'suspicious',
  'sceptical',
]);
/** Faces that are a big moment: shown fuller. */
const BIG: ReadonlySet<string> = new Set([
  'delight',
  'shock',
  'surprise',
  'terror',
  'heartbroken',
  'love',
  'fear',
]);
/** A face as a young child's film shows it: the gentler of its kind. */
const GENTLER: Readonly<Record<string, string>> = {
  furious: 'angry',
  terror: 'fear',
  heartbroken: 'sad',
  disgust: 'annoyed',
  shock: 'surprise',
  smug: 'amused',
  sarcastic: 'amused',
  exasperated: 'annoyed',
  bored: 'neutral',
};
/** A face as a mood to rest at: the lasting, softer form of it. */
const AS_REST: Readonly<Record<string, string>> = {
  fear: 'worried',
  terror: 'worried',
  pain: 'worried',
  pleading: 'worried',
  furious: 'annoyed',
  angry: 'annoyed',
  heartbroken: 'sad',
  delight: 'joy',
  love: 'tender',
  amused: 'joy',
  proud: 'joy',
};
/** Where no one shows a feeling, the scene's mood as a face to rest at, and how strongly. */
const MOOD_REST: Readonly<Record<string, [string, number]>> = {
  serious: ['worried', 0.2],
  bright: ['joy', 0.25],
  playful: ['amused', 0.25],
  curious: ['curious', 0.2],
};

/** A line said, as the director reads it. */
interface Line {
  who: string;
  from: number;
  to: number;
  /** Heard by the others: not a thought or a dream. */
  heard: boolean;
}

type Kind = 'beat' | 'line' | 'react';

/** A face someone may be given, and why. */
interface Wish {
  kind: Kind;
  s: number;
  e: number;
  said: string;
  felt: string | null;
  strength: number;
  how: FaceKey[4];
  /** The line it is said with, or reacts to. */
  line?: Line;
  /** A lie's flash of what is felt, just before it. */
  flash?: FaceKey;
}

const gentle = (recipe: string, young: boolean) =>
  young ? (GENTLER[recipe] ?? recipe) : recipe;

/** A face's side for a swing: what is felt beneath, where it is felt otherwise. */
const sideOf = (w: Pick<Wish, 'said' | 'felt'>) => w.felt ?? w.said;
const sameFace = (
  a: Pick<Wish, 'said' | 'felt'>,
  b: Pick<Wish, 'said' | 'felt'>,
) => a.said === b.said && (a.felt ?? a.said) === (b.felt ?? b.said);

/** The lines of a made scene: each bubble's words, those carried on joined. */
function linesOf(scene: Pick<SceneDto, 'effects'>): Line[] {
  const out: Line[] = [];
  for (const e of [...(scene.effects ?? [])].sort((a, b) => a.atMs - b.atMs)) {
    if (e.do !== 'say' || !e.say) continue;
    const to = e.say.saidUntilMs ?? e.say.untilMs;
    const last = out[out.length - 1];
    if (e.say.continues && last?.who === e.target) {
      last.to = Math.max(last.to, to);
      continue;
    }
    out.push({
      who: e.target,
      from: e.atMs,
      to,
      heard: e.say.from !== 'thought' && e.say.from !== 'dream',
    });
  }
  return out;
}

const KIT = (e: SceneEffectDto) =>
  e.do === 'show' && Boolean(e.part) && RECIPE_OF_FACE[e.part!] !== undefined;

/**
 * The faces the sheet gives someone in a made scene, as the kit's shows:
 * the one they come on with, and the story's moments (a reaction the sheet
 * gives them in a quiet). The kit's faces the acting put on for a line, or
 * for hearing one, and the face given back after, are not the story's.
 */
function sheetFaces(
  scene: Pick<SceneDto, 'effects' | 'acting'>,
  id: string,
  lines: readonly Line[],
): { opening: string | null; beats: [number, string][] } {
  const effects = scene.effects ?? [];
  const keys = scene.acting?.[id]?.face ?? [];
  const keyAt = (t: number) => keys.some((k) => Math.abs(k[0] - t) <= 5);
  const shows = effects
    .filter((e) => e.target === id && KIT(e))
    .sort((a, b) => a.atMs - b.atMs);
  let opening: string | null = null;
  const beats: [number, string][] = [];
  for (const e of shows) {
    const recipe = RECIPE_OF_FACE[e.part!];
    if (e.filler) {
      opening ??= recipe;
      continue;
    }
    const t = e.atMs;
    // Put on for their own line, as it begins.
    if (lines.some((l) => l.who === id && t >= l.from - 450 && t <= l.from))
      continue;
    // Hearing someone else's.
    if (lines.some((l) => l.who !== id && t >= l.from && t <= l.to + 50))
      continue;
    // A reaction's, put on with its acted face.
    if (keyAt(t)) continue;
    // Given back after a reaction's.
    const given = effects.some(
      (h) =>
        h.target === id &&
        h.do === 'hide' &&
        h.atMs === t &&
        h.part !== e.part &&
        shows.some(
          (s) => s.part === h.part && s.atMs < t && keyAt(s.atMs) && !s.filler,
        ),
    );
    if (given) continue;
    beats.push([t, recipe]);
  }
  return { opening, beats };
}

/** The faces the acting asked of someone, as wishes: each line's one face, each reaction. */
function wishesOf(
  keys: readonly FaceKey[],
  id: string,
  lines: readonly Line[],
): Wish[] {
  const out: Wish[] = [];
  const own = new Map<Line, FaceKey[]>();
  const flashes = new Map<Line, FaceKey>();
  for (const key of [...keys].sort((a, b) => a[0] - b[0])) {
    const [at, said, strength, felt, how, ms] = key;
    const line = lines.find(
      (l) => l.who === id && at >= l.from - 450 && at <= l.to,
    );
    if (line) {
      if (how === 'flash') flashes.set(line, key);
      else own.set(line, [...(own.get(line) ?? []), key]);
      continue;
    }
    // The blank a moment before a double take: the take is the face.
    if (said === 'neutral' && ms <= 600) continue;
    if (how === 'flash') continue;
    const heard = [...lines]
      .reverse()
      .find(
        (l) =>
          l.who !== id && l.heard && l.from <= at + 100 && at <= l.to + 2000,
      );
    out.push({
      kind: 'react',
      s: at,
      e: at + ms,
      said,
      felt: felt && felt !== said ? felt : null,
      strength,
      how,
      ...(heard ? { line: heard } : {}),
    });
  }
  for (const [line, list] of own) {
    const full = list.reduce((a, b) => (b[2] > a[2] ? b : a));
    out.push({
      kind: 'line',
      s: Math.max(line.from - 250, Math.min(...list.map((k) => k[0]))),
      e: Math.max(...list.map((k) => k[0] + k[5])),
      said: full[1],
      felt: full[3] && full[3] !== full[1] ? full[3] : null,
      strength: full[2],
      how: list.some((k) => k[4] === 'slow') ? 'slow' : 'ease',
      line,
      ...(flashes.has(line) ? { flash: flashes.get(line)! } : {}),
    });
  }
  return out.sort((a, b) => a.s - b.s);
}

/** A reaction that fits the line it answers: its own face where it does, else the gentle one for the line's feeling; none at a line said calmly. */
function fitted(
  said: string,
  reaction: string,
  restLow: boolean,
): string | null {
  if (reactionFits(said, reaction)) return reaction;
  const v = valenceOf(said);
  if (v > 0)
    return said === 'tender' || said === 'love'
      ? 'tender'
      : restLow
        ? 'relieved'
        : 'joy';
  if (v < 0)
    return ['fear', 'terror', 'worried', 'pleading'].includes(said)
      ? 'worried'
      : 'sad';
  return null;
}

/** Someone's rest over a scene: their mood, changing at a turn. */
function restsOf(
  opening: string | null,
  wishes: readonly Wish[],
  dir: FaceDirection,
  hold: number,
): [number, string, number][] {
  const strength = FACE_STRENGTH[dir.young ? 'young' : 'older'].rest;
  const asRest = (recipe: string): string | null => {
    const soft = AS_REST[recipe] ?? recipe;
    if (soft === 'neutral' || MOMENTARY.has(soft)) return null;
    return isRecipe(soft) ? gentle(soft, dir.young) : null;
  };
  const mood = dir.mood ? MOOD_REST[dir.mood] : undefined;
  const start = opening ? asRest(opening) : null;
  const out: [number, string, number][] = [
    start
      ? [0, start, start === 'eyes closed' ? 1 : strength]
      : mood
        ? [0, mood[0], mood[1]]
        : [0, 'neutral', 1],
  ];
  // The feelings they show, as moods: what they feel beneath a line.
  const felt = wishes
    .map((w) => ({ w, rest: asRest(w.felt ?? w.said) }))
    .filter(
      (one): one is { w: Wish; rest: string } =>
        one.rest !== null && valenceOf(one.rest) !== 0,
    );
  felt.forEach(({ w, rest }, k) => {
    const now = out[out.length - 1][1];
    if (now === 'eyes closed') return;
    const v = valenceOf(rest);
    if (v === valenceOf(now)) return;
    // A turn: a story moment, or a feeling the next one agrees with.
    const next = felt[k + 1];
    const turns =
      w.kind === 'beat' || (next !== undefined && valenceOf(next.rest) === v);
    if (!turns) return;
    out.push([Math.round(Math.max(w.e, w.s + hold)), rest, strength]);
  });
  return out;
}

/** Someone's faces directed: the rest they wear, and the faces acted over it. */
export function directFaces(
  keys: readonly FaceKey[],
  id: string,
  lines: readonly Line[],
  sheet: { opening: string | null; beats: [number, string][] },
  dir: FaceDirection,
  /** What each line is said with (its speaker's face for it), where it is known. */
  saidWith: ReadonlyMap<Line, string> = new Map(),
): { face: FaceKey[]; rest: [number, string, number][] } {
  const age = dir.young ? 'young' : 'older';
  const hold = FACE_HOLD_MS[age];
  const gap = FACE_GAP_MS[age];
  const power = FACE_STRENGTH[age];
  const raw = wishesOf(keys, id, lines);
  const beats: Wish[] = sheet.beats.map(([at, recipe]) => ({
    kind: 'beat',
    s: at,
    e: at + BEAT_HOLD_MS[age],
    said: recipe,
    felt: null,
    strength: 1,
    how: MOMENTARY.has(recipe) || recipe === 'fear' ? 'take' : 'ease',
  }));
  const all = [...raw, ...beats].sort((a, b) => a.s - b.s);
  const rest = restsOf(sheet.opening, all, dir, hold);
  const restAt = (t: number) =>
    [...rest].reverse().find((r) => r[0] <= t) ?? rest[0];
  const asleep = (t: number) => restAt(t)[1] === 'eyes closed';

  // Each wish made gentle, fitting and as strong as it should be.
  const shaped = all.flatMap((w): Wish[] => {
    let said = gentle(w.said, dir.young);
    const felt = w.felt ? gentle(w.felt, dir.young) : null;
    if (w.kind === 'react') {
      if (asleep(w.s)) return [];
      const lineSaid = w.line ? saidWith.get(w.line) : undefined;
      if (lineSaid) {
        const fit = fitted(
          gentle(lineSaid, dir.young),
          said,
          valenceOf(restAt(w.s)[1]) < 0,
        );
        if (!fit) return [];
        said = fit;
      }
    }
    const big =
      w.kind === 'beat'
        ? BIG.has(said)
        : w.kind === 'react' && w.how === 'take' && BIG.has(said);
    const strength =
      Math.round(
        (big
          ? power.big
          : w.kind === 'line'
            ? power.line * Math.min(1, w.strength)
            : w.kind === 'beat'
              ? power.beat
              : power.react) * 100,
      ) / 100;
    const how: FaceKey[4] =
      w.kind === 'line'
        ? w.how === 'slow'
          ? 'slow'
          : 'ease'
        : big && (MOMENTARY.has(said) || said === 'fear' || said === 'delight')
          ? 'take'
          : 'ease';
    return [
      {
        ...w,
        said,
        felt: felt && felt !== said ? felt : null,
        strength,
        how,
        // Held long enough to be read before it eases back.
        e: Math.max(w.e, w.s + gap),
      },
    ];
  });

  /** How far a face may be held on to the next rather than eased back to the rest. */
  const reach = (w: Wish) => (MOMENTARY.has(w.said) ? 1000 : gap);

  // The story's moments and their own lines first: each held, a line
  // after a moment of the opposite feeling waiting until it has been seen.
  const placed: Wish[] = [];
  for (const w of shaped.filter((one) => one.kind !== 'react')) {
    const p = placed[placed.length - 1];
    // A story moment as they speak: felt beneath the line, where it is
    // not the line's opposite ("We will find a place", determined over
    // the pain of another door shut).
    if (
      p?.kind === 'line' &&
      w.kind === 'beat' &&
      w.s < p.e &&
      w.said !== p.said &&
      !opposite(sideOf(p), w.said) &&
      valenceOf(w.said) !== 0
    ) {
      p.felt = w.said;
      continue;
    }
    if (p && w.s < p.e + hold) {
      if (sameFace(p, w)) {
        p.e = Math.max(p.e, w.e);
        p.strength = Math.max(p.strength, w.strength);
        continue;
      }
      const least =
        p.s +
        (w.kind === 'line' && opposite(sideOf(p), sideOf(w))
          ? FACE_SWING_MS
          : hold);
      if (w.s < least) {
        if (least > w.e - hold / 2) {
          // No room: the story's moment stands, else the later line.
          if (w.kind === 'beat' && p.kind === 'line' && w.s - p.s >= hold / 2) {
            p.e = w.s;
            placed.push(w);
          } else p.e = Math.max(p.e, Math.min(w.e, p.s + 2 * hold));
          continue;
        }
        w.e = Math.max(w.e, least + (w.e - w.s));
        w.s = least;
      }
      p.e = Math.min(p.e, w.s);
    }
    placed.push(w);
  }
  // The reactions, where there is room: never over their own line or a
  // story moment, never crowding the change before, never the opposite of
  // what comes next, and like the last one of its kind.
  let lastReact: Wish | null = null;
  for (const w of shaped.filter((one) => one.kind === 'react')) {
    placed.sort((a, b) => a.s - b.s);
    const before = [...placed].reverse().find((p) => p.s <= w.s);
    const after = placed.find((p) => p.s > w.s);
    if (before && before.e > w.s) continue;
    // A face held on to the next: never a moment's face (a thought, a
    // start) held on long, its eyes darting.
    const bridged = before && w.s - before.e < reach(before);
    if (bridged && sameFace(before, w)) {
      before.e = Math.max(before.e, w.s + REACT_HOLD_MS[age]);
      continue;
    }
    const lastChange = before ? (bridged ? before.s : before.e) : -Infinity;
    if (w.s - lastChange < gap) continue;
    if (bridged && opposite(sideOf(before), sideOf(w))) continue;
    if (after) {
      if (after.s - w.s < gap) continue;
      if (opposite(sideOf(w), sideOf(after)) && after.s - w.s < FACE_SWING_MS)
        continue;
    }
    // Like the last reaction: the same face again, as people do.
    if (
      lastReact &&
      lastReact.said !== w.said &&
      valenceOf(lastReact.said) === valenceOf(w.said) &&
      w.s - lastReact.s < 20000
    ) {
      w.said = lastReact.said;
      w.how = lastReact.how;
    }
    // One with the face they rest at already only deepens it: no change.
    const resting = restAt(w.s);
    if (w.said === resting[1] && !w.felt) continue;
    w.e = Math.min(w.s + REACT_HOLD_MS[age], after?.s ?? Infinity);
    placed.push(w);
    lastReact = w;
  }
  placed.sort((a, b) => a.s - b.s);

  // As keys: each held until the next, or until it eases back to the rest
  // with time for the rest to be seen; a rest change is never under one.
  const face: FaceKey[] = [];
  placed.forEach((w, k) => {
    const next = placed[k + 1];
    let e = Math.min(w.e, next?.s ?? Infinity);
    const bridge = next !== undefined && next.s - e < reach(w);
    if (bridge) e = next.s + 1;
    // A lie's flash, only where it is one, and never for young children.
    if (w.flash && !dir.young && w.felt && valenceOf(w.said) > 0)
      face.push([
        Math.round(w.s - 130),
        w.flash[1],
        Math.round(w.flash[2] * power.line * 100) / 100,
        null,
        'flash',
        w.flash[5],
      ]);
    face.push([
      Math.round(w.s),
      w.said,
      w.strength,
      w.felt,
      w.how,
      Math.max(60, Math.round(e - w.s)),
    ]);
  });
  return { face, rest };
}

/** A made film with its rigged faces directed: each one's rest, and the faces acted over it. */
export function withFaces<
  T extends Pick<SceneDto, 'effects' | 'acting'> & {
    stage?: string;
    sound?: { mood?: string | null };
  },
>(scene: T, given: Partial<FaceDirection> = {}): T {
  const dir: FaceDirection = {
    young: given.young ?? scene.stage === 'early',
    mood: given.mood ?? scene.sound?.mood ?? null,
  };
  const lines = linesOf(scene);
  const acting: Record<string, SceneActingDto> = { ...(scene.acting ?? {}) };
  // What each line is said with: its speaker's acted face for it, else
  // the kit's face they put on for it.
  const saidWith = new Map<Line, string>();
  for (const [id, one] of Object.entries(acting))
    for (const w of wishesOf(one.face ?? [], id, lines))
      if (w.kind === 'line' && w.line) saidWith.set(w.line, w.said);
  for (const line of lines) {
    if (saidWith.has(line)) continue;
    const put = (scene.effects ?? []).find(
      (e) =>
        e.target === line.who &&
        KIT(e) &&
        e.atMs >= line.from - 450 &&
        e.atMs <= line.from,
    );
    if (put) saidWith.set(line, RECIPE_OF_FACE[put.part!]);
  }
  let changed = false;
  for (const [id, one] of Object.entries(acting)) {
    // Only those the acting gave faces: one in a lesson who only looks
    // keeps the kit's face, and the lesson stays a lesson (isLesson).
    if (!one.face?.length) continue;
    const sheet = sheetFaces(scene, id, lines);
    const directed = directFaces(
      one.face ?? [],
      id,
      lines,
      sheet,
      dir,
      saidWith,
    );
    const next: SceneActingDto = { ...one, rest: directed.rest };
    if (directed.face.length) next.face = directed.face;
    else delete next.face;
    // The brows' flicker a listener gives the word that hits them: the
    // face answers the line now. Gone for young children, and where their
    // face changes with it; their own brows as they ask are kept.
    if (one.moves?.some(([, move]) => move === 'brows'))
      next.moves = one.moves.filter(
        ([at, move]) =>
          move !== 'brows' ||
          lines.some((l) => l.who === id && at >= l.from - 400 && at <= l.to) ||
          (!dir.young &&
            !directed.face.some(([from]) => Math.abs(from - at) < 800)),
      );
    acting[id] = next;
    changed = true;
  }
  return changed ? { ...scene, acting } : scene;
}
