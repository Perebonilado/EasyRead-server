/**
 * Faces built from moving parts (studio-story-plan §3B, S7): a face is no
 * longer one of a few drawings swapped behind a blink, but channels that
 * move, as a cartoon rig's do: each brow's inner and outer end, a
 * furrow, the upper and lower lids (wide, narrowed, squinting, half
 * lidded, shut), the pupils (where they look, how big, a shine), the
 * mouth (its corners up or down, open, wide, round, teeth, a smirk's
 * skew), the cheeks (a blush), the head's tilt and nod, and a few marks
 * (a sweat drop, tears, an anger vein).
 *
 *  - Expressions are recipes over those channels (joy, smug, guilty,
 *    sceptical, heartbroken, …), so two can be mixed and each worn at any
 *    strength; the kit's old faces are recipes too, drawn as they were.
 *  - A line can say one thing and feel another (saidAndFelt): the mouth
 *    and the head from what is said, the eyes, brows and cheeks from what
 *    is felt. The eyes tell the truth.
 *  - Timing (faceAt): an expression eases in on its word, the brows first,
 *    the eyes, then the mouth; a take winds up and overshoots; a slow burn
 *    builds over the line; a micro-expression flashes before a lie. The
 *    eyes blink at natural intervals and on every change of thought, dart
 *    while thinking or lying, and a shy or guilty one glances away.
 *  - Geometry (faceParts): each part's shape for a view of the face (the
 *    front, three-quarter, profile), in the kit's house line, so a face at
 *    rest is drawn as the kit's neutral face always was.
 *
 * The same file is the server's (scene-face-rig.ts) and the player's
 * (face-rig.ts), with no imports, so a face drawn in a still and on the
 * stage is the same face; FACE_RIG_PRINT is checked in both. Pure and
 * deterministic: the same channels give the same markup in every make,
 * and every moment is a function of the time alone, so a face looks the
 * same played, jumped to, or scrubbed to.
 */

// ── Channels ───────────────────────────────────────────────────────────────

/** Every channel a rigged face moves by. */
export const FACE_CHANNELS = [
  'browInL',
  'browInR',
  'browOutL',
  'browOutR',
  'brows',
  'furrow',
  'lidL',
  'lidR',
  'lidTilt',
  'lower',
  'wide',
  'lookX',
  'lookY',
  'pupil',
  'shine',
  'shut',
  'arc',
  'squeeze',
  'smile',
  'open',
  'width',
  'round',
  'teeth',
  'skew',
  'blush',
  'tilt',
  'down',
  'sweat',
  'tear',
  'vein',
] as const;
export type FaceChannel = (typeof FACE_CHANNELS)[number];
export type FaceChannels = Record<FaceChannel, number>;

/**
 * Each channel's least and most. Brows in the kit's units up (the left
 * brow is the one on the frame's left); lids 0 open to 1 closed; lidTilt
 * +1 the inner ends down (cross), -1 the outer ends down (sad); lower the
 * lower lids up, cheeks raised; wide the eyes opened past their rest;
 * look where the pupils sit in the kit's units; pupil their radius;
 * shut, arc and squeeze the eyes closed calm, closed smiling (^ ^) and
 * squeezed (> <); smile the mouth's corners up (+) or down (-); skew +1
 * the frame's right corner up (a smirk); tilt the head in degrees; down
 * its nod in units.
 */
export const CHANNEL_RANGE: Record<FaceChannel, [number, number]> = {
  browInL: [-9, 11],
  browInR: [-9, 11],
  browOutL: [-9, 11],
  browOutR: [-9, 11],
  brows: [0, 1],
  furrow: [0, 1],
  lidL: [0, 1],
  lidR: [0, 1],
  lidTilt: [-1, 1],
  lower: [0, 1],
  wide: [0, 1],
  lookX: [-7, 7],
  lookY: [-8, 8],
  pupil: [1.5, 4.8],
  shine: [0, 1],
  shut: [0, 1],
  arc: [0, 1],
  squeeze: [0, 1],
  smile: [-1, 1],
  open: [0, 1],
  width: [-1, 1],
  round: [0, 1],
  teeth: [0, 1],
  skew: [-1, 1],
  blush: [0, 1],
  tilt: [-14, 14],
  down: [-6, 8],
  sweat: [0, 1],
  tear: [0, 1],
  vein: [0, 1],
};

/** The face at rest: the kit's neutral face, the pupils a little low, the mouth a small closed curve. */
export const NEUTRAL_FACE: FaceChannels = Object.freeze(
  Object.fromEntries(
    FACE_CHANNELS.map((c) => [c, c === 'lookY' ? 2 : c === 'pupil' ? 3.4 : 0]),
  ) as FaceChannels,
);

/** The channels by part: what is felt shows in the brows, the eyes and the cheeks; what is said in the mouth and the head. */
export const BROW_CHANNELS: readonly FaceChannel[] = [
  'browInL',
  'browInR',
  'browOutL',
  'browOutR',
  'brows',
  'furrow',
];
export const EYE_CHANNELS: readonly FaceChannel[] = [
  'lidL',
  'lidR',
  'lidTilt',
  'lower',
  'wide',
  'lookX',
  'lookY',
  'pupil',
  'shine',
  'shut',
  'arc',
  'squeeze',
];
export const MOUTH_CHANNELS: readonly FaceChannel[] = [
  'smile',
  'open',
  'width',
  'round',
  'teeth',
  'skew',
];
export const HEAD_CHANNELS: readonly FaceChannel[] = ['tilt', 'down'];
export const MARK_CHANNELS: readonly FaceChannel[] = [
  'blush',
  'sweat',
  'tear',
  'vein',
];

const clamp = (n: number, lo: number, hi: number) =>
  n < lo ? lo : n > hi ? hi : n;

/** Every channel inside its range. */
export function inRange(c: FaceChannels): FaceChannels {
  const out = {} as FaceChannels;
  for (const k of FACE_CHANNELS)
    out[k] = clamp(
      Number.isFinite(c[k]) ? c[k] : NEUTRAL_FACE[k],
      CHANNEL_RANGE[k][0],
      CHANNEL_RANGE[k][1],
    );
  return out;
}

// ── Recipes ────────────────────────────────────────────────────────────────

/**
 * The expressions, as channel values (a channel left out is at rest).
 * The first nine are the kit's old faces, drawn as they were drawn; the
 * rest are new. Asymmetric ones say which side: a raised brow, a smirk.
 */
export const RECIPES = {
  neutral: {},
  // The kit's old faces, as FACES drew them.
  joy: {
    brows: 1,
    browInL: 4,
    browInR: 4,
    browOutL: 4,
    browOutR: 4,
    lower: 0.45,
    lookY: 0,
    pupil: 3.6,
    smile: 0.85,
    open: 0.62,
    width: 0.35,
    shine: 0.5,
  },
  sad: {
    brows: 1,
    browInL: 6,
    browInR: 6,
    browOutL: -3,
    browOutR: -3,
    lidL: 0.37,
    lidR: 0.37,
    lidTilt: -0.9,
    lookY: 5,
    smile: -0.75,
  },
  angry: {
    brows: 1,
    browInL: -7,
    browInR: -7,
    browOutL: 4,
    browOutR: 4,
    lidL: 0.4,
    lidR: 0.4,
    lidTilt: 1,
    lookY: 3,
    pupil: 3.2,
    smile: -0.25,
    open: 0.42,
    teeth: 1,
    width: 0.25,
  },
  fear: {
    brows: 1,
    browInL: 6,
    browInR: 6,
    browOutL: 0,
    browOutR: 0,
    wide: 0.35,
    lookY: -1,
    pupil: 2.3,
    smile: -0.35,
    open: 0.35,
    round: 0.35,
    width: -0.1,
  },
  surprise: {
    brows: 1,
    browInL: 6,
    browInR: 6,
    browOutL: 6,
    browOutR: 6,
    wide: 0.5,
    lookY: 0,
    pupil: 2.5,
    open: 0.55,
    round: 0.85,
  },
  thinking: {
    brows: 1,
    browInR: 6,
    browOutR: 6,
    lidL: 0.24,
    lookX: 5,
    lookY: -6,
    smile: 0.05,
    skew: 0.7,
    width: -0.45,
  },
  pain: {
    squeeze: 1,
    brows: 1,
    browInL: 4,
    browInR: 4,
    browOutL: -3,
    browOutR: -3,
    furrow: 0.6,
    smile: -0.3,
    open: 0.42,
    teeth: 1,
    width: 0.55,
    sweat: 0.7,
  },
  'eyes closed': {
    shut: 1,
    brows: 1,
    browInL: -2,
    browInR: -2,
    browOutL: -3,
    browOutR: -3,
  },
  // The new ones.
  delight: {
    brows: 1,
    browInL: 6,
    browInR: 6,
    browOutL: 6,
    browOutR: 6,
    arc: 1,
    smile: 1,
    open: 0.8,
    width: 0.55,
    blush: 0.55,
    tilt: 6,
    down: -2,
  },
  amused: {
    brows: 1,
    browInL: 2,
    browInR: 3,
    browOutL: 3,
    browOutR: 5,
    lidL: 0.18,
    lidR: 0.12,
    lower: 0.35,
    smile: 0.6,
    open: 0.12,
    skew: 0.3,
    width: 0.15,
    tilt: 4,
  },
  smug: {
    brows: 1,
    browInL: 1,
    browOutL: 0,
    browInR: 4,
    browOutR: 7,
    lidL: 0.45,
    lidR: 0.38,
    lookY: 1,
    smile: 0.4,
    skew: 0.8,
    width: 0.05,
    tilt: -6,
    down: -3,
  },
  embarrassed: {
    brows: 1,
    browInL: 5,
    browInR: 5,
    browOutL: -1,
    browOutR: -1,
    lower: 0.2,
    lookX: 3,
    lookY: 5,
    smile: 0.25,
    width: 0.25,
    skew: -0.25,
    blush: 1,
    tilt: 7,
    down: 3,
    sweat: 0.6,
  },
  shy: {
    brows: 1,
    browInL: 3,
    browInR: 3,
    browOutL: 0,
    browOutR: 0,
    lidL: 0.22,
    lidR: 0.22,
    lookX: -2,
    lookY: 5,
    pupil: 3.7,
    smile: 0.3,
    width: -0.25,
    blush: 0.75,
    tilt: 8,
    down: 4,
  },
  guilty: {
    brows: 1,
    browInL: 5,
    browInR: 5,
    browOutL: -2,
    browOutR: -2,
    lidL: 0.32,
    lidR: 0.32,
    lidTilt: -0.35,
    lookX: 3,
    lookY: 6,
    smile: -0.3,
    skew: -0.25,
    width: -0.2,
    down: 4,
    tilt: -3,
    sweat: 0.5,
  },
  suspicious: {
    brows: 1,
    browInL: -3,
    browOutL: 0,
    browInR: -1,
    browOutR: 2,
    furrow: 0.3,
    lidL: 0.55,
    lidR: 0.48,
    lidTilt: 0.35,
    lookX: 4.5,
    lookY: 1,
    smile: -0.15,
    skew: -0.3,
    width: -0.35,
    tilt: -4,
  },
  sceptical: {
    brows: 1,
    browInL: -3,
    browOutL: -2,
    browInR: 6,
    browOutR: 8,
    lidL: 0.4,
    lidR: 0.08,
    smile: -0.2,
    skew: -0.55,
    width: -0.2,
    tilt: 5,
  },
  annoyed: {
    brows: 1,
    browInL: -5,
    browInR: -5,
    browOutL: 2,
    browOutR: 2,
    furrow: 0.5,
    lidL: 0.38,
    lidR: 0.38,
    lidTilt: 0.55,
    lookY: 1,
    smile: -0.45,
    width: -0.3,
  },
  furious: {
    brows: 1,
    browInL: -9,
    browInR: -9,
    browOutL: 5,
    browOutR: 5,
    furrow: 1,
    lidL: 0.42,
    lidR: 0.42,
    lidTilt: 1,
    lookY: 2,
    pupil: 2.6,
    smile: -0.6,
    open: 0.65,
    teeth: 1,
    width: 0.65,
    vein: 1,
    blush: 0.35,
    down: 2,
  },
  disgust: {
    brows: 1,
    browInL: -4,
    browOutL: -1,
    browInR: -5,
    browOutR: -2,
    furrow: 0.85,
    lidL: 0.45,
    lidR: 0.55,
    lower: 0.6,
    lookX: -4,
    smile: -0.45,
    skew: -0.85,
    open: 0.25,
    teeth: 0.85,
    width: 0.2,
    tilt: -8,
    down: -2,
  },
  terror: {
    brows: 1,
    browInL: 10,
    browInR: 10,
    browOutL: 4,
    browOutR: 4,
    wide: 1,
    pupil: 1.8,
    lookY: 0,
    smile: -0.65,
    open: 1,
    width: 0.45,
    teeth: 0.35,
    sweat: 1,
    down: -3,
  },
  shock: {
    brows: 1,
    browInL: 10,
    browInR: 10,
    browOutL: 10,
    browOutR: 10,
    wide: 1,
    pupil: 1.7,
    lookY: 0,
    open: 0.9,
    round: 0.55,
    width: 0.15,
    down: -5,
  },
  heartbroken: {
    brows: 1,
    browInL: 10,
    browInR: 10,
    browOutL: -3,
    browOutR: -3,
    lidL: 0.42,
    lidR: 0.42,
    lidTilt: -1,
    lookY: 6,
    pupil: 3.9,
    shine: 0.8,
    smile: -1,
    open: 0.28,
    width: 0.2,
    tear: 1,
    tilt: 6,
    down: 4,
  },
  tender: {
    brows: 1,
    browInL: 4,
    browInR: 4,
    browOutL: 1,
    browOutR: 1,
    lidL: 0.3,
    lidR: 0.3,
    lower: 0.3,
    pupil: 3.8,
    shine: 0.5,
    smile: 0.45,
    width: -0.1,
    tilt: 8,
  },
  love: {
    brows: 1,
    browInL: 5,
    browInR: 5,
    browOutL: 3,
    browOutR: 3,
    lidL: 0.25,
    lidR: 0.25,
    lower: 0.35,
    pupil: 4.5,
    shine: 1,
    smile: 0.6,
    blush: 0.85,
    tilt: 7,
  },
  determined: {
    brows: 1,
    browInL: -5,
    browInR: -5,
    browOutL: 1,
    browOutR: 1,
    furrow: 0.45,
    lidL: 0.28,
    lidR: 0.28,
    lidTilt: 0.45,
    lookY: 1,
    smile: -0.1,
    width: -0.3,
    down: 2,
  },
  bored: {
    brows: 1,
    browInL: -1,
    browInR: -1,
    browOutL: -3,
    browOutR: -3,
    lidL: 0.62,
    lidR: 0.62,
    lookX: -4,
    lookY: 3,
    smile: -0.15,
    width: -0.1,
    tilt: -9,
    down: 3,
  },
  confused: {
    brows: 1,
    browInL: 7,
    browOutL: 2,
    browInR: -3,
    browOutR: -1,
    lidR: 0.18,
    lookX: 3,
    lookY: -3,
    smile: -0.25,
    skew: 0.45,
    width: -0.3,
    open: 0.1,
    round: 0.3,
    tilt: 10,
  },
  curious: {
    brows: 1,
    browInL: 3,
    browOutL: 3,
    browInR: 6,
    browOutR: 8,
    wide: 0.15,
    pupil: 3.9,
    shine: 0.6,
    lookX: 2,
    lookY: 0,
    open: 0.22,
    round: 0.75,
    width: -0.2,
    tilt: 9,
  },
  relieved: {
    brows: 1,
    browInL: 5,
    browInR: 5,
    browOutL: 1,
    browOutR: 1,
    lidL: 0.45,
    lidR: 0.45,
    lidTilt: -0.3,
    lower: 0.2,
    smile: 0.5,
    width: 0.2,
    open: 0.12,
    round: 0.25,
    tilt: -4,
    down: 1,
  },
  sarcastic: {
    brows: 1,
    browInL: 0,
    browOutL: 0,
    browInR: 4,
    browOutR: 6,
    lidL: 0.5,
    lidR: 0.5,
    lookY: 1,
    pupil: 3,
    smile: 0.75,
    open: 0.12,
    width: 0.45,
    teeth: 0.6,
    skew: 0.3,
  },
  worried: {
    brows: 1,
    browInL: 7,
    browInR: 7,
    browOutL: -1,
    browOutR: -1,
    lidL: 0.15,
    lidR: 0.15,
    lidTilt: -0.4,
    lookY: 2,
    smile: -0.35,
    width: -0.2,
    skew: -0.15,
  },
  proud: {
    brows: 1,
    browInL: 2,
    browInR: 2,
    browOutL: 3,
    browOutR: 3,
    lidL: 0.32,
    lidR: 0.32,
    lookY: 2,
    smile: 0.5,
    width: 0.1,
    tilt: -4,
    down: -4,
  },
  pleading: {
    brows: 1,
    browInL: 10,
    browInR: 10,
    browOutL: -3,
    browOutR: -3,
    lidL: 0.12,
    lidR: 0.12,
    lidTilt: -0.6,
    pupil: 4.6,
    shine: 1,
    lookY: -2,
    smile: -0.55,
    open: 0.1,
    round: 0.35,
    width: -0.3,
    tilt: 9,
    down: 2,
  },
  exasperated: {
    brows: 1,
    browInL: 3,
    browInR: 3,
    browOutL: 4,
    browOutR: 4,
    lidL: 0.42,
    lidR: 0.42,
    lookX: 2,
    lookY: -6.5,
    smile: -0.3,
    skew: 0.35,
    width: -0.1,
    tilt: -7,
  },
} as const satisfies Record<string, Partial<FaceChannels>>;
export type FaceRecipe = keyof typeof RECIPES;
export const RECIPE_NAMES = Object.keys(RECIPES) as FaceRecipe[];

export const isRecipe = (name: unknown): name is FaceRecipe =>
  typeof name === 'string' && Object.hasOwn(RECIPES, name);

/** A recipe's channels at a strength, 1 in full: every channel moved that far from rest. */
export function recipeFace(name: string, strength = 1): FaceChannels {
  const r: Partial<FaceChannels> = isRecipe(name) ? RECIPES[name] : {};
  const out = {} as FaceChannels;
  for (const k of FACE_CHANNELS) {
    const at = NEUTRAL_FACE[k];
    out[k] = at + strength * ((r[k] ?? at) - at);
  }
  return inRange(out);
}

/** Two faces blended: `t` of the way from `a` to `b`. */
export function blendFaces(
  a: FaceChannels,
  b: FaceChannels,
  t: number,
): FaceChannels {
  const out = {} as FaceChannels;
  for (const k of FACE_CHANNELS) out[k] = a[k] + (b[k] - a[k]) * t;
  return out;
}

/** Recipes mixed by weight ("70% joy and 30% embarrassed"): the weights as shares of their sum. */
export function mixRecipes(
  parts: readonly (readonly [string, number])[],
): FaceChannels {
  const total = parts.reduce((s, [, w]) => s + Math.max(0, w), 0);
  if (total <= 0) return { ...NEUTRAL_FACE };
  const out = Object.fromEntries(
    FACE_CHANNELS.map((k) => [k, 0]),
  ) as FaceChannels;
  for (const [name, w] of parts) {
    if (w <= 0) continue;
    const f = recipeFace(name);
    for (const k of FACE_CHANNELS) out[k] += (f[k] * w) / total;
  }
  return inRange(out);
}

/**
 * A face that says one thing and feels another: the mouth and the head
 * as said, the brows, the eyes and the cheeks as felt (a brave face over
 * fear; a smile with dead eyes). A little of what is felt leaks into the
 * mouth.
 */
export function saidAndFelt(
  said: FaceChannels,
  felt: FaceChannels,
  leak = 0.15,
): FaceChannels {
  const out = { ...said };
  for (const k of [...BROW_CHANNELS, ...EYE_CHANNELS, ...MARK_CHANNELS])
    out[k] = felt[k];
  for (const k of MOUTH_CHANNELS) out[k] = said[k] + (felt[k] - said[k]) * leak;
  return out;
}

/** The kit's old faces, by name, as the recipes that draw them: an old sheet's faces still play. */
export const RECIPE_OF_FACE: Record<string, FaceRecipe> = {
  neutral: 'neutral',
  happy: 'joy',
  sad: 'sad',
  angry: 'angry',
  afraid: 'fear',
  surprised: 'surprise',
  thinking: 'thinking',
  pain: 'pain',
  'eyes closed': 'eyes closed',
  'eyes-closed': 'eyes closed',
};

/** Each recipe's nearest old face: what a drawing with no rigged face (an animal the artist drew) wears for it. */
export const FACE_OF_RECIPE: Record<FaceRecipe, string> = {
  neutral: 'neutral',
  joy: 'happy',
  sad: 'sad',
  angry: 'angry',
  fear: 'afraid',
  surprise: 'surprised',
  thinking: 'thinking',
  pain: 'pain',
  'eyes closed': 'eyes closed',
  delight: 'happy',
  amused: 'happy',
  smug: 'happy',
  embarrassed: 'afraid',
  shy: 'neutral',
  guilty: 'sad',
  suspicious: 'thinking',
  sceptical: 'thinking',
  annoyed: 'angry',
  furious: 'angry',
  disgust: 'angry',
  terror: 'afraid',
  shock: 'surprised',
  heartbroken: 'sad',
  tender: 'happy',
  love: 'happy',
  determined: 'angry',
  bored: 'neutral',
  confused: 'thinking',
  curious: 'thinking',
  relieved: 'happy',
  sarcastic: 'happy',
  worried: 'afraid',
  proud: 'happy',
  pleading: 'sad',
  exasperated: 'neutral',
};

/** A feeling in the writer's words, as a recipe: "smirking" is smug, "scared" fear, "livid" furious. Null when none fits. */
export function recipeNamed(
  word: string | null | undefined,
): FaceRecipe | null {
  const w = (word ?? '').trim().toLowerCase();
  if (!w) return null;
  if (isRecipe(w)) return w;
  if (RECIPE_OF_FACE[w]) return RECIPE_OF_FACE[w];
  const words: [RegExp, FaceRecipe][] = [
    [/^(?:happy|glad|cheerful|pleased|smiling|content)$/u, 'joy'],
    [
      /^(?:delighted|overjoyed|ecstatic|thrilled|excited|laughing)$/u,
      'delight',
    ],
    [/^(?:amused|playful|cheeky|teasing|grinning)$/u, 'amused'],
    [/^(?:smug|smirking|sly|cocky|superior)$/u, 'smug'],
    [/^(?:embarrassed|awkward|sheepish|flustered)$/u, 'embarrassed'],
    [/^(?:shy|bashful|timid)$/u, 'shy'],
    [/^(?:guilty|ashamed|sorry)$/u, 'guilty'],
    [/^(?:suspicious|wary|distrustful)$/u, 'suspicious'],
    [/^(?:sceptical|skeptical|doubtful|unconvinced)$/u, 'sceptical'],
    [/^(?:annoyed|irritated|grumpy|cross|stern)$/u, 'annoyed'],
    [/^(?:angry|mad)$/u, 'angry'],
    [/^(?:furious|livid|raging|enraged)$/u, 'furious'],
    [/^(?:disgusted|revolted|grossed out)$/u, 'disgust'],
    [/^(?:afraid|scared|frightened|fearful|nervous|anxious)$/u, 'fear'],
    [/^(?:terrified|horrified|panicked)$/u, 'terror'],
    [/^(?:surprised|amazed|astonished)$/u, 'surprise'],
    [/^(?:shocked|stunned|aghast)$/u, 'shock'],
    [/^(?:sad|unhappy|upset|serious|solemn|grave|sorrowful|hurt)$/u, 'sad'],
    [/^(?:heartbroken|devastated|crying|tearful|grieving)$/u, 'heartbroken'],
    [/^(?:tender|gentle|kind|warm|caring|soft)$/u, 'tender'],
    [/^(?:in love|loving|love-struck|lovestruck|adoring|smitten)$/u, 'love'],
    [/^(?:determined|resolute|brave|focused|firm)$/u, 'determined'],
    [/^(?:bored|uninterested|unimpressed|weary)$/u, 'bored'],
    [/^(?:confused|puzzled|baffled|lost)$/u, 'confused'],
    [/^(?:curious|interested|intrigued)$/u, 'curious'],
    [/^(?:thinking|thoughtful|pondering|wondering)$/u, 'thinking'],
    [/^(?:relieved|calm|at ease)$/u, 'relieved'],
    [/^(?:sarcastic|mocking|ironic|fake smile)$/u, 'sarcastic'],
    [/^(?:worried|concerned|uneasy)$/u, 'worried'],
    [
      /^(?:proud|triumphant|pleased with (?:himself|herself|themselves))$/u,
      'proud',
    ],
    [/^(?:pleading|begging|hopeful|puppy-eyed)$/u, 'pleading'],
    [
      /^(?:exasperated|fed up|eye-roll|rolling (?:his|her|their) eyes)$/u,
      'exasperated',
    ],
    [/^(?:in pain|hurting|wincing)$/u, 'pain'],
  ];
  for (const [pattern, name] of words) if (pattern.test(w)) return name;
  return null;
}

/** Recipes that lift someone's mood or sink it: a said face that is one and a felt face that is the other is a mask. */
export const GLAD_RECIPES: ReadonlySet<string> = new Set([
  'joy',
  'delight',
  'amused',
  'smug',
  'tender',
  'love',
  'relieved',
  'proud',
  'sarcastic',
]);
export const LOW_RECIPES: ReadonlySet<string> = new Set([
  'sad',
  'heartbroken',
  'fear',
  'terror',
  'worried',
  'guilty',
  'embarrassed',
  'pain',
  'angry',
  'furious',
  'annoyed',
]);

/** Faces whose eyes dart about: thinking, puzzling, suspecting. And any face over a lie. */
export const DARTING: ReadonlySet<string> = new Set([
  'thinking',
  'confused',
  'suspicious',
]);
/** Faces that cannot hold a look: they glance away and back. */
export const GLANCING: ReadonlySet<string> = new Set([
  'shy',
  'guilty',
  'embarrassed',
]);

// ── Timing ─────────────────────────────────────────────────────────────────

/** How a face comes on: eased, a take (a wind-up and an overshoot), a slow burn, or a flash (a micro-expression). */
export const FACE_HOWS = ['ease', 'take', 'slow', 'flash'] as const;
export type FaceHow = (typeof FACE_HOWS)[number];

/**
 * A face worn a while over the one someone has (SceneActingDto.face): from
 * when, what is said (a recipe), how strongly, what is felt beneath it (a
 * recipe, or null for the same), how it comes on, and for how long.
 */
export type FaceKey = [
  atMs: number,
  said: string,
  strength: number,
  felt: string | null,
  how: FaceHow,
  ms: number,
];

/** How far behind the brows each part moves: the brows lead, the eyes follow, the mouth spreads last. */
export const PART_LAG_MS = { brow: 0, eye: 40, head: 60, mouth: 90, mark: 120 };
const PART_OF: Record<FaceChannel, keyof typeof PART_LAG_MS> =
  Object.fromEntries(
    FACE_CHANNELS.map((k) => [
      k,
      BROW_CHANNELS.includes(k)
        ? 'brow'
        : EYE_CHANNELS.includes(k)
          ? 'eye'
          : MOUTH_CHANNELS.includes(k)
            ? 'mouth'
            : HEAD_CHANNELS.includes(k)
              ? 'head'
              : 'mark',
    ]),
  ) as Record<FaceChannel, keyof typeof PART_LAG_MS>;

/** How long a face takes to come on, by how. */
export function easeInMs(how: FaceHow, ms: number): number {
  switch (how) {
    case 'take':
      return 300;
    case 'slow':
      return Math.max(300, Math.min(ms * 0.8, 2200));
    case 'flash':
      return 60;
    default:
      return 240;
  }
}
/** And to give way to the face beneath. */
export function easeOutMs(how: FaceHow): number {
  return how === 'flash' ? 110 : how === 'take' ? 380 : 320;
}

const easeInOut = (u: number) =>
  u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2;
/** A take: a small wind-up the other way, then over the mark and back. */
function takeCurve(u: number): number {
  if (u < 0.25) return -0.14 * Math.sin((Math.PI * u) / 0.25);
  const v = (u - 0.25) / 0.75;
  const s = 2.2;
  return 1 + (s + 1) * (v - 1) ** 3 + s * (v - 1) ** 2;
}
/** How far a face has come on, `u` of its way in. */
export function curveOf(how: FaceHow, u: number): number {
  const v = clamp(u, 0, 1);
  switch (how) {
    case 'take':
      return takeCurve(v);
    case 'slow':
      return v * v;
    case 'flash':
      return v;
    default:
      return easeInOut(v);
  }
}

/** A key's face in full: what it says over what it feels, at its strength. */
export function keyFace(key: FaceKey): FaceChannels {
  const [, said, strength, felt] = key;
  const s = recipeFace(said, strength);
  return felt && felt !== said ? saidAndFelt(s, recipeFace(felt, strength)) : s;
}

/**
 * The face someone rests at (SceneActingDto.rest): from when, a recipe,
 * how strongly. Their mood in a scene, which the faces acted over it ease
 * back to; changing only at a turn of the scene, slowly.
 */
export type RestKey = [atMs: number, recipe: string, strength: number];

/** How long a rest takes to become the next, ms: a mood changes slowly. */
export const REST_EASE_MS = 700;

/** The face a rest has at `t`: its recipe at its strength, eased from the one before as it changes. Null with none. */
export function restAt(
  rest: readonly RestKey[] | undefined,
  t: number,
): FaceChannels | null {
  if (!rest?.length) return null;
  let k = 0;
  for (let i = 0; i < rest.length; i += 1)
    if (rest[i][0] <= t) k = i;
    else break;
  const now = recipeFace(rest[k][1], rest[k][2]);
  const u = (t - rest[k][0]) / REST_EASE_MS;
  if (k === 0 || u >= 1 || u < 0) return now;
  const was = recipeFace(rest[k - 1][1], rest[k - 1][2]);
  return blendFaces(was, now, easeInOut(u));
}

/** The face a track has on at `t` over `base`, each part on its own lag, and the key on then. */
export function trackAt(
  track: readonly FaceKey[] | undefined,
  t: number,
  base: FaceChannels,
): { c: FaceChannels; on: FaceKey | null } {
  if (!track?.length) return { c: base, on: null };
  const faces = new Map<number, FaceChannels>();
  const faceOf = (k: number) => {
    let f = faces.get(k);
    if (!f) {
      f = keyFace(track[k]);
      faces.set(k, f);
    }
    return f;
  };
  const at = (tt: number) => {
    let k = -1;
    for (let i = 0; i < track.length; i += 1)
      if (track[i][0] <= tt) k = i;
      else break;
    return k;
  };
  const byPart = new Map<string, FaceChannels>();
  const partAt = (part: keyof typeof PART_LAG_MS) => {
    const kept = byPart.get(part);
    if (kept) return kept;
    const tt = t - PART_LAG_MS[part];
    const k = at(tt);
    let out = base;
    if (k >= 0) {
      const key = track[k];
      const end = key[0] + key[5];
      const prev = k > 0 && track[k - 1][0] + track[k - 1][5] > key[0];
      const from = prev ? faceOf(k - 1) : base;
      if (tt < end) {
        const u = (tt - key[0]) / easeInMs(key[4], key[5]);
        out = blendFaces(from, faceOf(k), curveOf(key[4], u));
      } else {
        const u = (tt - end) / easeOutMs(key[4]);
        out =
          u >= 1
            ? base
            : blendFaces(faceOf(k), base, easeInOut(clamp(u, 0, 1)));
      }
    }
    byPart.set(part, out);
    return out;
  };
  const c = {} as FaceChannels;
  for (const ch of FACE_CHANNELS) c[ch] = partAt(PART_OF[ch])[ch];
  const k = at(t);
  const on = k >= 0 && t < track[k][0] + track[k][5] ? track[k] : null;
  return { c, on };
}

/** A small, stable number from a name and a count: 0 to 1. */
export function hash01(seed: string, n: number): number {
  let h = 0x811c9dc5;
  const s = `${seed}:${n}`;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 0xffffffff;
}

/** How long a blink takes: the lid down, shut, and up again. */
export const BLINK_MS = { down: 55, shut: 40, up: 90 };
const BLINK_ALL = BLINK_MS.down + BLINK_MS.shut + BLINK_MS.up;
/** A blink `dt` after it began: 0 open to 1 shut. */
function blinkShape(dt: number): number {
  if (dt < 0 || dt >= BLINK_ALL) return 0;
  if (dt < BLINK_MS.down) return dt / BLINK_MS.down;
  if (dt < BLINK_MS.down + BLINK_MS.shut) return 1;
  return 1 - (dt - BLINK_MS.down - BLINK_MS.shut) / BLINK_MS.up;
}
/** One natural blink in each slot of this long, somewhere in it: 2.4 to 5.6 s apart, now and then two together. */
export const BLINK_SLOT_MS = 3600;

/**
 * How shut someone's eyes are with blinking at `t`: a natural blink in
 * each slot of their own (seeded, so no two blink together), and one as
 * each thought changes (`cues`: when their face changes). A natural blink
 * just after a cued one is left out. A function of the time alone.
 */
export function blinkAt(
  seed: string,
  t: number,
  cues: readonly number[] = [],
): number {
  let most = 0;
  let cuedLately = -Infinity;
  for (const cue of cues) {
    const from = cue - 30;
    if (from <= t) cuedLately = Math.max(cuedLately, from);
    most = Math.max(most, blinkShape(t - from));
  }
  const slot = Math.floor(t / BLINK_SLOT_MS);
  for (let k = slot - 1; k <= slot; k += 1) {
    if (k < 0) continue;
    const at = k * BLINK_SLOT_MS + 400 + hash01(seed, k) * 2600;
    const starts = [at];
    if (hash01(`${seed}:2`, k) < 0.18) starts.push(at + 260);
    for (const from of starts) {
      if (from - cuedLately < 700 && from >= cuedLately) continue;
      if (cues.some((cue) => Math.abs(cue - 30 - from) < 700)) continue;
      most = Math.max(most, blinkShape(t - from));
    }
  }
  return most;
}

/** Where darting eyes are at `t`: a new place every slot, reached in a quick flick. */
export const DART_SLOT_MS = 470;
export function dartAt(seed: string, t: number): [number, number] {
  const slot = Math.floor(t / DART_SLOT_MS);
  const place = (k: number): [number, number] => [
    (hash01(`${seed}:dx`, k) - 0.5) * 7,
    (hash01(`${seed}:dy`, k) - 0.5) * 4 - 1,
  ];
  const now = place(slot);
  const into = t - slot * DART_SLOT_MS;
  if (into >= 45) return now;
  const was = place(slot - 1);
  const u = into / 45;
  return [was[0] + (now[0] - was[0]) * u, was[1] + (now[1] - was[1]) * u];
}

/** How far a shy or guilty one has glanced away at `t`, 0 to 1: they hold the look a while, then look away and back. */
export const GLANCE_SLOT_MS = 2300;
export function glanceAt(seed: string, t: number): number {
  const slot = Math.floor(t / GLANCE_SLOT_MS);
  const from = slot * GLANCE_SLOT_MS + 600 + hash01(`${seed}:g`, slot) * 700;
  const len = 650 + hash01(`${seed}:gl`, slot) * 450;
  const dt = t - from;
  if (dt < 0 || dt > len) return 0;
  const edge = 120;
  return dt < edge ? dt / edge : dt > len - edge ? (len - dt) / edge : 1;
}

/** The mouth's shapes as someone speaks, shut to open (the kit's six, v0 to v5), as the mouth's channels. */
export const VISEMES: readonly Partial<FaceChannels>[] = [
  { open: 0, round: 0, teeth: 0 },
  { open: 0.2 },
  { open: 0.62 },
  { open: 0.3, width: 0.45, teeth: 0.75 },
  { open: 0.4, round: 0.85, width: -0.3 },
  { open: 0.18, teeth: 0.9 },
];

/** The mouth said with a shape: the face's own corners and skew kept, opened as the shape opens it. */
export function withViseme(c: FaceChannels, shape: number): FaceChannels {
  const v = VISEMES[shape];
  if (!v) return c;
  const out = { ...c };
  out.smile = c.smile * 0.8;
  out.skew = c.skew * 0.6;
  out.open = shape === 0 ? 0 : (v.open ?? 0) + c.open * 0.3;
  out.round = Math.max(v.round ?? 0, c.round * 0.5);
  out.width = c.width * 0.5 + (v.width ?? 0);
  out.teeth = shape === 0 ? 0 : Math.max(v.teeth ?? 0, c.teeth * 0.5);
  return inRange(out);
}

/** The talking mouth's flap where no shapes are planned, as the kit's keyframes open and shut it over 1.2 s. */
const TALK_OPEN: readonly [number, number][] = [
  [0, 10],
  [18, 30],
  [40, 46],
  [55, 70],
  [78, 86],
];
export function talkOpen(t: number): number {
  const at = (((t % 1200) + 1200) % 1200) / 12;
  return TALK_OPEN.some(([a, b]) => at >= a && at < b) ? 0.42 : 0;
}

/** What faceAt is given: someone's own seed, the moment, and what the stage knows of them then. */
export interface FaceMoment {
  seed: string;
  t: number;
  /** The face they wear beneath anything acted: the old faces' mix, as the stage shows them. */
  base: FaceChannels;
  /** The acted faces (SceneActingDto.face). */
  track?: readonly FaceKey[];
  /** When the face beneath changed: each a change of thought, and a blink. */
  cues?: readonly number[];
  /** The mouth's shape while a line is said, 0 to 5; null when none. */
  shape?: number | null;
  /** Talking with no shapes planned: the mouth flaps. */
  talking?: boolean;
  /** The brows' flicker the acting adds, in units up. */
  brow?: number;
}

/** Someone's face at a moment, every channel: what is worn, what is acted over it, the blinks, darts and glances, and the words' shapes. */
export function faceAt(m: FaceMoment): FaceChannels {
  const { c: acted, on } = trackAt(m.track, m.t, m.base);
  const c = { ...acted };
  // A new thought blinks: each acted face that changes the one before it.
  const cues = [...(m.cues ?? [])];
  for (let i = 0; i < (m.track?.length ?? 0); i += 1) {
    const key = m.track![i];
    const before = m.track![i - 1];
    if (key[0] > m.t + 50) break;
    if (key[4] === 'flash') continue;
    if (!before || before[1] !== key[1]) cues.push(key[0] + 20);
  }
  cues.sort((a, b) => a - b);
  const said = on?.[1] ?? null;
  const felt = on?.[3] ?? null;
  // Over a lie (a said face over another felt), and thinking, the eyes dart.
  const lying = Boolean(
    felt && said && felt !== said && GLAD_RECIPES.has(said),
  );
  if ((said && DARTING.has(felt ?? said)) || lying) {
    const [dx, dy] = dartAt(m.seed, m.t);
    const k = lying ? 0.7 : 1;
    c.lookX += dx * k;
    c.lookY += dy * k;
  }
  // The shy and the guilty glance away, down and aside, and back.
  if (said && GLANCING.has(felt ?? said)) {
    const away = glanceAt(m.seed, m.t);
    const side = hash01(m.seed, 7) < 0.5 ? -1 : 1;
    c.lookX += away * side * 3.5;
    c.lookY += away * 2.5;
    c.down += away * 1.5;
  }
  // The brows' flicker of the acting: raised, and shown while raised.
  if (m.brow) {
    c.browInL += m.brow;
    c.browInR += m.brow;
    c.browOutL += m.brow;
    c.browOutR += m.brow;
    c.brows = Math.max(c.brows, clamp(Math.abs(m.brow) / 2.5, 0, 1));
  }
  // Blinks, unless the eyes are shut already.
  const closed = Math.max(c.shut, c.arc, c.squeeze);
  if (closed < 0.5) {
    const b = blinkAt(m.seed, m.t, cues);
    if (b > 0) {
      c.lidL = Math.max(c.lidL, b);
      c.lidR = Math.max(c.lidR, b);
      if (b >= 0.97) c.shut = 1;
    }
  }
  const out = inRange(c);
  if (m.shape !== undefined && m.shape !== null)
    return withViseme(out, m.shape);
  if (m.talking) {
    const open = talkOpen(m.t);
    return inRange({ ...out, open: Math.max(out.open * 0.5, open) });
  }
  return out;
}

// ── Geometry ───────────────────────────────────────────────────────────────

/** One eye of a view of the face: its middle, its size, which of the front's eyes it is (-1 the left), its width as a share of the front's, and how far forward its pupil sits (profile). */
export interface FaceEye {
  x: number;
  y: number;
  rx: number;
  ry: number;
  side: -1 | 1;
  w: number;
  fwd: number;
}
/** A view of the face: its eyes, where its mouth is across and how wide (a share of the front's), and whether half of it shows (profile). */
export interface FaceGeo {
  eyes: FaceEye[];
  /** The mouth's height. */
  my: number;
  mouth: { x: number; w: number; half: boolean } | null;
}

/** The colours a face is drawn in, the kit's. */
export const FACE_INK = '#2d2a32';
export const FACE_MOUTH = '#6b2a2e';
export const FACE_TONGUE = '#d4777a';
export const FACE_BLUSH = '#ef8a7a';
export const FACE_TEAR = '#6cb8e6';
export const FACE_VEIN = '#e0463a';

const f1 = (n: number) => Math.round(n * 10) / 10;
const f2 = (n: number) => Math.round(n * 100) / 100;
const p1 = (x: number, y: number) => `${f1(x)},${f1(y)}`;
const p2 = (x: number, y: number) => `${f2(x)},${f2(y)}`;
const num = (n: number) => String(f2(n));

/** The part of an ellipse above (or below) a line, v = a + b·u in the ellipse's own frame: as the kit's chord. */
export function faceChord(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  a: number,
  b = 0,
  side: 'top' | 'bottom' = 'top',
): string {
  const A = 1 + b * b;
  const B = 2 * a * b;
  const C = a * a - 1;
  const D = B * B - 4 * A * C;
  if (D <= 0) return '';
  const u1 = (-B - Math.sqrt(D)) / (2 * A);
  const u2 = (-B + Math.sqrt(D)) / (2 * A);
  const at = (u: number) => p1(cx + u * rx, cy + (a + b * u) * ry);
  return side === 'top'
    ? `M${at(u1)} A${f1(rx)},${f1(ry)} 0 ${a > 0 ? 1 : 0} 1 ${at(u2)} Z`
    : `M${at(u2)} A${f1(rx)},${f1(ry)} 0 ${a < 0 ? 1 : 0} 1 ${at(u1)} Z`;
}

/** Each part's attributes, by its key: what the markup draws, and what the player sets each frame. */
export type FaceAttrs = Record<string, Record<string, string>>;

/** The mouth's outline for its channels, about x 0 at height `my`: its two lips as curves from corner to corner. */
export function mouthPath(
  c: FaceChannels,
  my: number,
): {
  d: string;
  top: number;
  bottom: number;
  half: number;
  dx: number;
} {
  const s = c.smile;
  const up = Math.max(0, s);
  const round = c.round;
  const half =
    (9 + 4.5 * c.width + 5 * up + 1.5 * Math.max(0, -s)) * (1 - 0.32 * round);
  const dx = 2.5 * c.skew;
  const yc = my - 4.5 * s;
  const yL = yc + 1.5 * c.skew;
  const yR = yc - 4 * c.skew;
  // The closed curve's middle below the corners (a frown's above), then
  // the lips parted about it: a smile keeps its top lip, and opens down.
  const hc = 1.25 + 4 * s;
  const gap = c.open * (19 + 3 * round);
  const hu = hc - gap * 0.25 * (1 - up * 0.6);
  const hl = hc + gap * 0.75 + gap * 0.25 * up * 0.6;
  const k = (2 / 3) * (1 - 0.85 * round);
  const L: [number, number] = [dx - half, yL];
  const R: [number, number] = [dx + half, yR];
  const u1 = p2(L[0] + k * half, yL + hu / 0.75);
  const u2 = p2(R[0] - k * half, yR + hu / 0.75);
  const l2 = p2(R[0] - k * half, yR + hl / 0.75);
  const l1 = p2(L[0] + k * half, yL + hl / 0.75);
  const d = `M${p2(...L)} C${u1} ${u2} ${p2(...R)} C${l2} ${l1} ${p2(...L)} Z`;
  return {
    d,
    top: (yL + yR) / 2 + hu,
    bottom: (yL + yR) / 2 + hl,
    half,
    dx,
  };
}

/**
 * Every part of a view of the face at its channels, by key: the whites
 * opened wide, the pupils and their shine, the lower and upper lids, the
 * eyes shut (calm, smiling, squeezed), tears, the brows and the furrow,
 * the mouth (its inside, teeth, tongue and outline), a blush, sweat and a
 * vein. At rest, as the kit's neutral face draws it.
 */
export function faceParts(c: FaceChannels, g: FaceGeo): FaceAttrs {
  const out: FaceAttrs = {};
  const shown = (v: number) => (v > 0.004 ? num(Math.min(1, v)) : '0');
  const closed = Math.max(c.shut, c.arc, c.squeeze);
  const cover = closed <= 0.35 ? 0 : closed >= 0.65 ? 1 : (closed - 0.35) / 0.3;
  g.eyes.forEach((e, i) => {
    const grow = 1 + 0.18 * c.wide;
    const rx = e.rx * grow;
    const ry = e.ry * (1 + 0.14 * c.wide);
    out[`bl${i}`] = { opacity: shown(c.blush * 0.6) };
    out[`wh${i}`] = {
      rx: num(rx),
      ry: num(ry),
      opacity: c.wide > 0.01 ? '1' : '0',
    };
    // As the kit placed its pupils: to a tenth.
    const pr = f1(c.pupil * (e.w < 0.8 ? 0.9 : 1));
    const px = f1(e.x + c.lookX * e.w + e.fwd);
    const py = f1(e.y + c.lookY);
    out[`p${i}`] = { cx: String(px), cy: String(py), r: String(pr) };
    out[`sh${i}`] = {
      cx: num(px + pr * 0.38),
      cy: num(py - pr * 0.42),
      r: num(pr * 0.36),
      opacity: shown(c.shine),
    };
    // Raised cheeks push the lower lid up.
    const lower = c.lower;
    out[`lo${i}`] = {
      d:
        lower > 0.004
          ? faceChord(e.x, e.y, rx, ry, 1 - lower, 0, 'bottom')
          : '',
    };
    // The upper lid: down as far as it closes, as far again as the eyes
    // are shut, tilted cross (inner ends down) or sad (outer ends down).
    const lid = Math.max(e.side === -1 ? c.lidL : c.lidR, closed);
    const b = 0.55 * c.lidTilt * (e.side === -1 ? 1 : -1) * e.w;
    const a = -1 + 1.9 * lid;
    out[`up${i}`] = {
      d:
        lid > 0.004 || Math.abs(c.lidTilt) > 0.004
          ? faceChord(e.x, e.y, rx, ry, a, b)
          : '',
    };
    // Shut, the lid covers the eye and its outline, as the kit's closed eyes do.
    out[`cv${i}`] = {
      cx: num(e.x),
      cy: num(e.y),
      rx: num(rx + 2),
      ry: num(ry + 2),
      opacity: shown(cover),
    };
    const sum = c.shut + c.arc + c.squeeze || 1;
    out[`sc${i}`] = { opacity: shown((cover * c.shut) / sum) };
    out[`ac${i}`] = { opacity: shown((cover * c.arc) / sum) };
    out[`sq${i}`] = { opacity: shown((cover * c.squeeze) / sum) };
    out[`tr${i}`] = { opacity: shown(c.tear) };
    // The brows: the outer end, then the inner, raised as the channels
    // say; a furrow pulls the inner ends in and down.
    const by = e.y - ry - 5;
    const bIn = e.side === -1 ? c.browInL : c.browInR;
    const bOut = e.side === -1 ? c.browOutL : c.browOutR;
    const pull = c.furrow * 2.5;
    out[`b${i}`] = {
      d: `M${p1(e.x + e.side * 11 * e.w, by - bOut)} L${p1(e.x - e.side * (8 - pull) * e.w, by - bIn + pull)}`,
    };
  });
  // Brows come in quickly and stay solid: a face worn lightly has faint
  // brows' moves, not faint brows.
  out.bs = { opacity: shown(Math.min(1, c.brows * 2.5)) };
  const first = g.eyes[0];
  if (first) {
    const cx =
      g.eyes.length > 1
        ? (g.eyes[0].x + g.eyes[g.eyes.length - 1].x) / 2
        : first.x + 11 * first.w;
    const by =
      first.y -
      first.ry * (1 + 0.14 * c.wide) -
      5 -
      Math.min(c.browInL, c.browInR) * 0.3;
    out.cr = {
      d: `M${p1(cx - 2.5, by - 1)} L${p1(cx - 1.8, by + 5)} M${p1(cx + 2.5, by - 1)} L${p1(cx + 1.8, by + 5)}`,
      opacity: shown(c.furrow * c.brows),
    };
  }
  if (g.mouth) {
    const m = mouthPath(c, g.my);
    const inside = m.bottom - m.top;
    out.m = { d: m.d };
    out.mc = { d: m.d };
    out.mo = {
      d: m.d,
      // A closed mouth a line as the kit's (heavier as it curves, so a
      // smile or a frown reads small); open, outlined as its shapes are.
      'stroke-width': num(
        (3 + 0.5 * Math.abs(c.smile)) * (1 - Math.min(1, c.open * 4)) +
          2.6 * Math.min(1, c.open * 4),
      ),
    };
    // Teeth fill a mouth barely open (gritted), and show only at its top
    // as it opens.
    const band =
      c.teeth * inside * (1 - 0.6 * clamp((c.open - 0.3) / 0.5, 0, 1));
    out.t = {
      x: num(m.dx - m.half),
      y: num(m.top - 2),
      width: num(m.half * 2),
      height: num(Math.max(0, band + 2)),
      opacity: shown(c.teeth > 0.02 && inside > 0.5 ? 1 : 0),
    };
    const gritted = c.teeth > 0.7 && c.open < 0.4 ? (c.teeth - 0.7) / 0.3 : 0;
    const mid = m.top + inside / 2;
    out.tl = {
      d: `M${p1(m.dx - m.half, mid)} L${p1(m.dx + m.half, mid)}`,
      opacity: shown(gritted * Math.min(1, inside / 3)),
    };
    out.tg = {
      cx: num(m.dx),
      cy: num(m.bottom - 2.2),
      rx: num(m.half * 0.55),
      ry: '3',
      opacity: shown(clamp((c.open - 0.35) * 3, 0, 1) * (1 - c.teeth * 0.7)),
    };
  }
  out.sw = { opacity: shown(c.sweat) };
  out.vn = { opacity: shown(c.vein) };
  return out;
}

/** What a view's rigged face is drawn with: the eyes' clip (the pupils stay in the whites), half a mouth's clip (profile), its own prefix for its mouth's clip, and the skin. */
export interface FaceIds {
  eyesClip: string;
  halfClip: string;
  prefix: string;
  skin: string;
}

const attrs = (a: Record<string, string> | undefined) =>
  a
    ? Object.entries(a)
        .map(([k, v]) => ` ${k}="${v}"`)
        .join('')
    : '';

/**
 * A view's rigged face as markup, at its channels (at rest, the kit's
 * neutral face): each part marked with its key (data-k), so the player
 * finds it and sets what faceParts says each frame.
 */
export function faceMarkup(c: FaceChannels, g: FaceGeo, ids: FaceIds): string {
  const p = faceParts(c, g);
  const el = (tag: string, key: string, fixed: string) =>
    `<${tag} data-k="${key}"${fixed}${attrs(p[key])}/>`;
  const out: string[] = [];
  const eyes = g.eyes;
  // Blush on the cheeks, under everything.
  eyes.forEach((e, i) =>
    out.push(
      el(
        'ellipse',
        `bl${i}`,
        ` cx="${num(e.x + e.side * 3 * e.w)}" cy="${num(e.y + e.ry + 6)}" rx="${num(9 * e.w)}" ry="4.5" fill="${FACE_BLUSH}" stroke="none"`,
      ),
    ),
  );
  eyes.forEach((e, i) =>
    out.push(
      el(
        'ellipse',
        `wh${i}`,
        ` cx="${num(e.x)}" cy="${num(e.y)}" fill="#ffffff"`,
      ),
    ),
  );
  out.push(
    `<g clip-path="url(#${ids.eyesClip})"><g class="pupils">${eyes
      .map(
        (_, i) =>
          el('circle', `p${i}`, ` fill="${FACE_INK}" stroke="none"`) +
          el('circle', `sh${i}`, ` fill="#ffffff" stroke="none"`),
      )
      .join('')}</g></g>`,
  );
  eyes.forEach((_, i) => out.push(el('path', `lo${i}`, ` fill="${ids.skin}"`)));
  eyes.forEach((_, i) => out.push(el('path', `up${i}`, ` fill="${ids.skin}"`)));
  eyes.forEach((e, i) => {
    const w = e.w;
    const d = e.side < 0 ? 1 : -1;
    out.push(
      el('ellipse', `cv${i}`, ` fill="${ids.skin}" stroke="none"`),
      el(
        'path',
        `sc${i}`,
        ` d="M${p1(e.x - 11 * w, e.y + 1)} Q${p1(e.x, e.y + 7)} ${p1(e.x + 11 * w, e.y + 1)}" fill="none" stroke="${FACE_INK}" stroke-width="3" stroke-linecap="round"`,
      ),
      el(
        'path',
        `ac${i}`,
        ` d="M${p1(e.x - 11 * w, e.y + 4)} Q${p1(e.x, e.y - 8)} ${p1(e.x + 11 * w, e.y + 4)}" fill="none" stroke="${FACE_INK}" stroke-width="3.2" stroke-linecap="round"`,
      ),
      el(
        'path',
        `sq${i}`,
        ` d="M${p1(e.x - d * 8 * w, e.y - 7)} L${p1(e.x + d * 6 * w, e.y)} L${p1(e.x - d * 8 * w, e.y + 7)}" fill="none" stroke="${FACE_INK}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"`,
      ),
    );
  });
  eyes.forEach((e, i) => {
    const x = e.x + e.side * 4 * e.w;
    const y = e.y + e.ry + 3;
    out.push(
      el(
        'path',
        `tr${i}`,
        ` d="M${p1(x, y)} Q${p1(x + 4, y + 7)} ${p1(x, y + 10)} Q${p1(x - 4, y + 7)} ${p1(x, y)} Z M${p1(x, y + 12)} Q${p1(x + 3, y + 17)} ${p1(x, y + 19)} Q${p1(x - 3, y + 17)} ${p1(x, y + 12)} Z" fill="${FACE_TEAR}" stroke-width="1.4"`,
      ),
    );
  });
  out.push(
    `<g class="rf-brows"${attrs(p.bs)} data-k="bs">${eyes
      .map((_, i) =>
        el(
          'path',
          `b${i}`,
          ` fill="none" stroke="${FACE_INK}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"`,
        ),
      )
      .join('')}${
      eyes.length
        ? el(
            'path',
            'cr',
            ` fill="none" stroke="${FACE_INK}" stroke-width="2" stroke-linecap="round"`,
          )
        : ''
    }</g>`,
  );
  if (g.mouth) {
    const clip = `${ids.prefix}-mc`;
    const inner =
      `<clipPath id="${clip}">${el('path', 'mc', '')}</clipPath>` +
      el('path', 'm', ` fill="${FACE_MOUTH}" stroke="none"`) +
      `<g clip-path="url(#${clip})">` +
      el('rect', 't', ` rx="2" fill="#ffffff" stroke="none"`) +
      el('ellipse', 'tg', ` fill="${FACE_TONGUE}" stroke="none"`) +
      el('path', 'tl', ` fill="none" stroke="${FACE_INK}" stroke-width="1.8"`) +
      `</g>` +
      el(
        'path',
        'mo',
        ` fill="none" stroke="${FACE_INK}" stroke-linecap="round" stroke-linejoin="round"`,
      );
    const m = g.mouth;
    const moved =
      m.x || m.w !== 1
        ? `<g transform="translate(${num(m.x)} 0) scale(${num(m.w)} 1)">`
        : '<g>';
    out.push(
      m.half
        ? `${moved}<g clip-path="url(#${ids.halfClip})">${inner}</g></g>`
        : `${moved}${inner}</g>`,
    );
  }
  // Sweat at the temple on the frame's right, a vein at the forehead's left.
  const last = eyes[eyes.length - 1];
  if (last) {
    const x = last.x + last.rx * last.w + 9;
    const y = last.y - last.ry - 4;
    out.push(
      el(
        'path',
        'sw',
        ` d="M${p1(x, y - 7)} Q${p1(x + 5, y + 1)} ${p1(x, y + 4)} Q${p1(x - 5, y + 1)} ${p1(x, y - 7)} Z" fill="${FACE_TEAR}" stroke-width="1.6"`,
      ),
    );
    const v = eyes[0];
    const vx = v.x - 4 * v.w;
    const vy = v.y - v.ry - 20;
    out.push(
      el(
        'path',
        'vn',
        ` d="M${p1(vx - 6, vy - 2)} Q${p1(vx - 2, vy - 2)} ${p1(vx - 2, vy - 6)} M${p1(vx + 2, vy - 6)} Q${p1(vx + 2, vy - 2)} ${p1(vx + 6, vy - 2)} M${p1(vx + 6, vy + 2)} Q${p1(vx + 2, vy + 2)} ${p1(vx + 2, vy + 6)} M${p1(vx - 2, vy + 6)} Q${p1(vx - 2, vy + 2)} ${p1(vx - 6, vy + 2)}" fill="none" stroke="${FACE_VEIN}" stroke-width="2.4" stroke-linecap="round"`,
      ),
    );
  }
  return out.join('');
}

/** A view's geometry, written on its rigged face's group (data-rf), so the player draws it without the kit. */
export function geoAttr(g: FaceGeo): string {
  const eyes = g.eyes
    .map((e) => [e.x, e.y, e.rx, e.ry, e.side, e.w, e.fwd].map(num).join(','))
    .join(';');
  const mouth = g.mouth
    ? [g.mouth.x, g.mouth.w, g.mouth.half ? 1 : 0].map(num).join(',')
    : '';
  return `${eyes}|${num(g.my)}|${mouth}`;
}
/** And read back. */
export function geoOfAttr(attr: string): FaceGeo | null {
  const [eyes, my, mouth] = attr.split('|');
  if (my === undefined) return null;
  const list = (eyes ? eyes.split(';') : []).map((one): FaceEye => {
    const [x, y, rx, ry, side, w, fwd] = one.split(',').map(Number);
    return { x, y, rx, ry, side: side < 0 ? -1 : 1, w, fwd };
  });
  const m = mouth ? mouth.split(',').map(Number) : null;
  return {
    eyes: list,
    my: Number(my),
    mouth: m ? { x: m[0], w: m[1], half: m[2] === 1 } : null,
  };
}

/** A print of the recipes and the geometry: the same in the server's copy and the player's. */
export function faceRigPrint(): string {
  const geo: FaceGeo = {
    eyes: [
      { x: -15.5, y: -150, rx: 15, ry: 16.5, side: -1, w: 1, fwd: 0 },
      { x: 15.5, y: -150, rx: 15, ry: 16.5, side: 1, w: 1, fwd: 0 },
    ],
    my: -128,
    mouth: { x: 0, w: 1, half: false },
  };
  const all = RECIPE_NAMES.map(
    (name) => `${name}:${JSON.stringify(faceParts(recipeFace(name), geo))}`,
  ).join('\n');
  return String(hash01(all, 0));
}
