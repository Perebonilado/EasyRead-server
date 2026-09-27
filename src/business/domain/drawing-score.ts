/**
 * What "right" means for a drawing the model makes (studio-drawings-plan
 * §2): one scorecard for every character, thing and place. Code checks
 * what code can measure (drawing-checks); a vision model judges the rest
 * against the brief, and this is how its verdict is read: a score, and
 * whether it passes.
 */

/** What a drawing is, for the judge and the checks. */
export type DrawingKind = 'animal' | 'creature' | 'thing' | 'feature' | 'place';

/**
 * The vision judge's verdict on one drawing: each point of the scorecard
 * it judges, 0 to 10, and null where it does not apply.
 */
export interface DrawingVerdict {
  /** What the picture shows, in a few words: "a brown horse standing side-on". */
  sees: string;
  /** 1. It reads at a glance as what the brief says. */
  recognisable: number;
  /** 2. Its body and stance: the right legs on the ground, the view asked for, nothing floating. */
  anatomy: number;
  /** 4. Its face: the eyes and the mouth where they belong, readable. Null for a thing or a place. */
  face: number | null;
  /** 8. Drawn again: the change asked for shows. */
  change: number | null;
  /** 9. Drawn again: still the same character. */
  same: number | null;
  /** 10. A place: it reads as the place asked, its ground low and open, no loose lines. */
  place: number | null;
  /** What to change, as instructions to the artist, most important first; none when it is right. */
  problems: string[];
}

/** Every judged point must reach this for a drawing to pass. */
export const PASS_MARK = 8;

/** The points of a verdict that apply to it, by name. */
export function judgedPoints(
  verdict: DrawingVerdict,
): { name: string; score: number }[] {
  return (
    [
      ['recognisable', verdict.recognisable],
      ['anatomy', verdict.anatomy],
      ['face', verdict.face],
      ['change', verdict.change],
      ['same', verdict.same],
      ['place', verdict.place],
    ] as const
  )
    .filter(([, score]) => typeof score === 'number' && Number.isFinite(score))
    .map(([name, score]) => ({ name, score: score! }));
}

/** A verdict as one number, 0 to 10: the mean of the points that apply. */
export function verdictScore(verdict: DrawingVerdict | null): number {
  if (!verdict) return 0;
  const points = judgedPoints(verdict);
  if (!points.length) return 0;
  const mean = points.reduce((sum, one) => sum + one.score, 0) / points.length;
  return Math.round(mean * 100) / 100;
}

/** Whether every point that applies reaches the pass mark. */
export const verdictPasses = (verdict: DrawingVerdict | null): boolean =>
  Boolean(verdict) &&
  judgedPoints(verdict!).every((one) => one.score >= PASS_MARK);

/** A verdict with every score kept between 0 and 10 and its problems trimmed: a model's numbers are not trusted. */
export function cleanVerdict(raw: DrawingVerdict): DrawingVerdict {
  const score = (n: number | null) =>
    n === null || !Number.isFinite(n)
      ? null
      : Math.max(0, Math.min(10, Math.round(n * 10) / 10));
  return {
    sees: (raw.sees ?? '').trim().slice(0, 200),
    recognisable: score(raw.recognisable) ?? 0,
    anatomy: score(raw.anatomy) ?? 0,
    face: score(raw.face),
    change: score(raw.change),
    same: score(raw.same),
    place: score(raw.place),
    problems: (raw.problems ?? [])
      .map((one) => one.trim())
      .filter(Boolean)
      .slice(0, 5),
  };
}

/** What each point asks of the artist, when the judge marks it short and says nothing more. */
const SHORT: Record<string, string> = {
  recognisable:
    'Make it read at a glance as what the brief says: its shape, its colours and what it is known by.',
  anatomy:
    'Give it the body and stance of what it is: the right number of legs, all on the ground, each part joined where it belongs, seen as the brief says.',
  face: 'Put its face right: both eyes big and clear in the upper part of the head, and the mouth under them, on the muzzle or at the beak.',
  change:
    'Make the change the maker asked for plain at a glance, where they asked for it.',
  same: 'Keep it the same character as before: its kind, colours and markings, changing only what the maker asked.',
  place:
    'Make it read as the place asked, with its ground or floor across the lower part, open where people stand, and no loose lines on it.',
};

/**
 * What the artist is told of a verdict that falls short: the judge's own
 * instructions, or, when it gave none, what each point short of the mark
 * asks. None for a verdict that passes.
 */
export function verdictNotes(verdict: DrawingVerdict | null): string[] {
  if (!verdict || verdictPasses(verdict)) return [];
  if (verdict.problems.length) return verdict.problems;
  return judgedPoints(verdict)
    .filter((one) => one.score < PASS_MARK)
    .map((one) => SHORT[one.name]);
}

/**
 * What a drawing made again is told when the change the maker asked for
 * does not show, or it is no longer the same character: sent back with
 * the reason, in the maker's own words.
 */
export function redrawNotes(
  verdict: DrawingVerdict | null,
  words: string,
  name: string,
): string[] {
  if (!verdict) return [];
  const said = words.replace(/"/g, "'");
  const out: string[] = [];
  if (verdict.change !== null && verdict.change < PASS_MARK)
    out.push(
      `The change the maker asked for does not show yet: "${said}". Draw it plainly, where they asked for it.`,
    );
  if (verdict.same !== null && verdict.same < PASS_MARK)
    out.push(
      `Keep ${name} the same character as the drawing they have now: the same kind, colours and markings, changing only what the maker asked ("${said}").`,
    );
  return out;
}

/**
 * How each kind of drawing should stand, in the words the judge and the
 * artist are both given: the stance the scorecard checks.
 */
export const EXPECTED: Record<DrawingKind, string> = {
  animal:
    'An animal character, standing as the real animal stands: on all four legs on the ground (a bird on two legs, a fish swimming, a snake along the ground), seen from the side or in three-quarter view, facing right, its head turned a little to the viewer; never upright like a person and never head-on with its legs in a row. A friendly face.',
  creature:
    'A character that is neither an animal nor a person (a talking egg, a robot, a snowman, a dragon), standing, facing the viewer or in three-quarter view, with a clear friendly face in the upper part of its head.',
  thing:
    'A thing people hold, carry or wear, alone and whole, seen from the side, at rest: no people, no face, no ground or backdrop.',
  feature:
    'A fixed thing of a place (a bicycle, a signpost, a stall), alone and whole, standing on the ground at eye level: no people, no face, no backdrop.',
  place:
    'A place, seen at eye level: the whole scene from edge to edge, its ground or floor across the lower part of the picture, open where people will stand, and no people or animals in it.',
};
