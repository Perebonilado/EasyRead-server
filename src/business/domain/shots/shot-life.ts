/**
 * A shot's life (explainer-animation-plan §8; research §3.6's life
 * channel): what its picture does on its own between information events,
 * never competing with them. The board names life only where a line rests
 * on a mood or a hold (wind on a stormy line, dust in a light, a crowd
 * waiting); everything a set really has comes with it by itself:
 *  - a chimney smokes (a set's stacks, a train's funnel, a works');
 *  - water carries the light (shimmer on a coast or the sea);
 *  - a town's lights waver once its windows are lit (dusk, night);
 *  - rain and snow fall nearer the camera than the set's own;
 *  - the map's clouds pass over the land (cloud shadows);
 *  - a flag stirs on its pole;
 *  - the paper's grain turns, at the look's grain, everywhere.
 *
 * Each effect is seeded by the set it is on, not the shot, so a plume or a
 * wave carries on unbroken through every shot of that set. The client
 * draws them all under the rules' cap (LIFE).
 */
import type {
  ShotAssetDto,
  ShotLifeDto,
  ShotLifeEffect,
  ShotLookDto,
  ShotSetDto,
  ShotSvgAssetDto,
  ShotTargetDto,
} from '../../../contracts';
import type { PlanSet } from './types';

/** How much of an effect when the plan only names it: the house's measure, under the cap either way. */
export const LIFE_AMOUNT = 0.5;
/** The most effects one shot carries: what the board asked for and what its set has. */
export const LIFE_MOST = 6;
/** The Lottie effects: drawn only from a file of the catalogue (LOTTIE_EFFECTS); never a stand-in. */
export const LOTTIE_LIFE: ReadonlySet<ShotLifeEffect> = new Set([
  'fire',
  'sparks',
  'splash',
]);

/**
 * The Lottie files the life layer may draw, by effect: each one's url on
 * the client (public/effects/lottie, listed with its source and licence
 * in SOURCES.md) and its main colours mapped to the look's roles. Empty
 * until the files are fetched: LottieFiles shows a human check to the
 * build's browser (see SOURCES.md), so a plan's fire, sparks or splash is
 * left out with a note rather than drawn by anything else.
 */
export const LOTTIE_EFFECTS: Readonly<
  Partial<
    Record<
      'fire' | 'sparks' | 'splash',
      { url: string; colours: Record<string, string> }
    >
  >
> = {};

/** A set part that is a smoke anchor: a chimney's top, near or far. */
const SMOKE_PART = /^smoke(?:-far)?(?:-\d+)?$/;
/** A set or piece part whose children are lights. */
const LIGHT_PART = /^(?:lights(?:-far)?|lamps|ship-lights)$/;

/** A string's FNV-1a hash: the same seed for the same set every time. */
function seedOf(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** What a shot's life is worked out from. */
export interface LifeInput {
  /** What the board named, already from the closed list. */
  planned: readonly ShotLifeEffect[];
  /** The shot's set as built, and as the plan wrote it (a drawn set's weather is only in the plan). */
  set: ShotSetDto;
  plan?: PlanSet;
  /** The set's own asset: a drawn set's parts and light. */
  asset?: ShotAssetDto | null;
  /** The light a drawn set changes to while the shot is on. */
  becomes?: string;
  /** The pieces standing on it. */
  actors: readonly { id: string; asset: string }[];
  assets: Readonly<Record<string, ShotAssetDto>>;
  look: ShotLookDto;
  /** The shot's subject: where a Lottie effect (a fire) stands. */
  focal?: ShotTargetDto;
  /** The scene's seed. */
  seed: string;
}

/**
 * The life a set has by itself: smoke from its chimneys and its pieces',
 * light on its water, its lights wavering once they are lit, its rain or
 * snow, its flag, the map's clouds; never anything the place does not have.
 */
export function lifeDefaults(input: LifeInput): ShotLifeEffect[] {
  const out: ShotLifeEffect[] = [];
  const add = (effect: ShotLifeEffect) => {
    if (!out.includes(effect)) out.push(effect);
  };
  const { set } = input;
  if (set.kind === 'map') add('cloud-shadows');
  const svg: ShotSvgAssetDto | null =
    input.asset?.kind === 'svg' ? input.asset : null;
  if (set.kind === 'set' && svg) {
    const parts = Object.keys(svg.parts);
    if (parts.some((id) => SMOKE_PART.test(id))) add('smoke');
    if (svg.parts.shimmer) add('shimmer');
    if (svg.parts.rain) add('rain');
    if (svg.parts.snow) add('snow');
    if (parts.some((id) => /^flag(?:-\d+)?$/.test(id))) add('flags');
    // Lights waver once they are lit: a set opening at dusk or night, or going there on the shot's words.
    const light = svg.scenery?.state ?? 'day';
    const lit =
      light !== 'day' ||
      (input.becomes !== undefined && input.becomes !== 'day');
    if (lit && parts.some((id) => LIGHT_PART.test(id))) add('flicker');
    const weather =
      input.plan?.kind === 'set' ? input.plan.set.weather : undefined;
    if (weather === 'storm') add('wind');
  }
  // The pieces' own: a funnel or a stack smokes; a works' or a house's windows waver at dusk.
  for (const actor of input.actors) {
    const piece = input.assets[actor.asset];
    if (piece?.kind !== 'svg') continue;
    if (Object.keys(piece.parts).some((id) => /^smoke(?:-\d+)?$/.test(id)))
      add('smoke');
    const light = svg?.scenery?.state ?? 'day';
    if (piece.parts.lights && light !== 'day') add('flicker');
    if (Object.keys(piece.parts).some((id) => /^flag(?:-\d+)?$/.test(id)))
      add('flags');
  }
  if (input.look.grain > 0) add('grain');
  return out;
}

/**
 * A shot's life as the client draws it: what the board named first (a
 * Lottie effect only where the catalogue has its file), then what its set
 * has by itself, each seeded by the set so it never jumps at a cut within
 * the set, the grain at the look's grain. Notes say what was left out.
 */
export function shotLife(
  input: LifeInput,
  notes: string[] = [],
  where = 'a shot',
): ShotLifeDto[] {
  const setKey =
    'asset' in input.set ? `${input.set.kind}:${input.set.asset}` : 'plain';
  const out: ShotLifeDto[] = [];
  const effects = [
    ...new Set([...input.planned, ...lifeDefaults(input)]),
  ].slice(0, LIFE_MOST);
  for (const effect of effects) {
    if (effect === 'eyes') continue;
    const seed = seedOf(`${input.seed}:${setKey}:${effect}`);
    if (LOTTIE_LIFE.has(effect)) {
      const file = LOTTIE_EFFECTS[effect as 'fire' | 'sparks' | 'splash'];
      if (!file || !input.focal) {
        notes.push(
          `${where}: ${file ? `no subject for the ${effect} to stand on` : `no ${effect} effect to draw yet`}; left out`,
        );
        continue;
      }
      out.push({
        effect,
        seed,
        amount: LIFE_AMOUNT,
        asset: lottieAssetId(effect),
        at: input.focal,
      });
      continue;
    }
    out.push({
      effect,
      seed,
      amount:
        effect === 'grain'
          ? Math.round(Math.max(0, Math.min(1, input.look.grain)) * 100) / 100
          : LIFE_AMOUNT,
    });
  }
  return out;
}

/** A Lottie effect's asset id in a scene: one per effect, shared by every shot that draws it. */
export const lottieAssetId = (effect: ShotLifeEffect): string =>
  `lottie-${effect}`;

/** The Lottie assets a scene's life draws, from the catalogue. */
export function lottieAssets(
  life: readonly ShotLifeDto[],
): Record<string, ShotAssetDto> {
  const out: Record<string, ShotAssetDto> = {};
  for (const one of life) {
    if (!one.asset || !LOTTIE_LIFE.has(one.effect)) continue;
    const file = LOTTIE_EFFECTS[one.effect as 'fire' | 'sparks' | 'splash'];
    if (file)
      out[one.asset] = {
        kind: 'lottie',
        url: file.url,
        colours: { ...file.colours },
      };
  }
  return out;
}
