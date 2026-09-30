/**
 * Story development, fast (Richard, 2026-09-30: "Cut the rewrites"):
 * what code can put right in the writer's premise, beats and scene plan
 * is put right here, and only what breaks the story's structure is worth
 * sending an answer back for (at most once a story, studio-develop). The
 * rest (a stock trait, a flat curve, a scene with no remembered moment,
 * a running gag in one beat) is noted in the log and left.
 */
import type { StudioBible } from './studio';
import { characterId } from './studio-check';
import { joinsSeconds } from './studio-edit';
import type {
  BeatRole,
  BeatSheet,
  Premise,
  ScenePlan,
  SetupPiece,
} from './studio-story';

/** What code put right, and the value as it is now. */
export interface Fixed<T> {
  value: T;
  fixed: string[];
}

const wordsIn = (said: string) => said.split(/\s+/u).filter(Boolean);

/**
 * The first clause of a line that says more than one thing: "A locked
 * machine; Raj wants to lock up" is "A locked machine"; "A self-locking
 * door, and Sal one floor down…" is "A self-locking door". At most
 * `most` words.
 */
export function firstClause(said: string, most = 15): string {
  const parts = said
    .split(
      /\s*(?:;|\s[—–-]\s|—|–|,\s*(?:and|but|while|who|which|so)\s|\.\s)\s*/u,
    )
    .map((p) => p.trim())
    .filter(Boolean);
  const first = parts.find((p) => wordsIn(p).length >= 2) ?? parts[0] ?? said;
  const words = wordsIn(first);
  return (words.length > most ? words.slice(0, most).join(' ') : first).replace(
    /[,;:.]+$/u,
    '',
  );
}

/**
 * A premise with what code can put right put right: one obstacle, a
 * short want, and the hero as the id of a main character where the
 * writer named them otherwise.
 */
export function fixPremise(
  premise: Premise,
  bible: StudioBible,
): Fixed<Premise> {
  const fixed: string[] = [];
  let value = premise;
  if (
    value.obstacle &&
    (/;/u.test(value.obstacle) || wordsIn(value.obstacle).length > 15)
  ) {
    const one = firstClause(value.obstacle);
    if (one && one !== value.obstacle) {
      fixed.push(`the obstacle is its first part: "${one}"`);
      value = { ...value, obstacle: one };
    }
  }
  if (value.want && wordsIn(value.want).length > 15) {
    const one = firstClause(value.want);
    if (one && one !== value.want) {
      fixed.push(`the want is its first part: "${one}"`);
      value = { ...value, want: one };
    }
  }
  const mains = bible.characters.filter((c) => c.role === 'main');
  const hero = bible.characters.find((c) => c.id === value.hero);
  if (!hero || hero.role !== 'main') {
    // Only a main character the writer named otherwise: never someone else made the hero.
    const named = characterId(value.hero, bible);
    const found = mains.find((c) => c.id === named);
    if (found && found.id !== value.hero) {
      fixed.push(`the hero is ${found.name} (${found.id})`);
      value = { ...value, hero: found.id };
    }
  }
  return { value, fixed };
}

/** What in a premise's problems breaks the story: no hero, no want, nothing in the way. */
export const premiseHard = (problems: readonly string[]): string[] =>
  problems.filter((p) =>
    /^(?:Say whose story it is|hero "|Say the want:|Say the obstacle:)/u.test(
      p,
    ),
  );

/** What in the characters' problems breaks the story: someone who matters with no sheet at all. */
export const charactersHard = (problems: readonly string[]): string[] =>
  problems.filter((p) => /^Give .+ a full sheet/u.test(p));

const firstOf = (sheet: BeatSheet, ...roles: BeatRole[]) =>
  sheet.beats.findIndex((b) => roles.includes(b.role));
const lastOf = (sheet: BeatSheet, ...roles: BeatRole[]) => {
  for (let k = sheet.beats.length - 1; k >= 0; k -= 1)
    if (roles.includes(sheet.beats[k].role)) return k;
  return -1;
};

/**
 * A beat sheet with what code can put right put right: a beat after the
 * first with no link follows "therefore"; and the first beat after the
 * climax, where none resolves it, is its resolution.
 */
export function fixBeats(sheet: BeatSheet): Fixed<BeatSheet> {
  const fixed: string[] = [];
  let beats = sheet.beats;
  const unlinked = beats
    .map((b, k) => (k > 0 && !b.link ? k : -1))
    .filter((k) => k > 0);
  if (unlinked.length) {
    beats = beats.map((b, k) =>
      unlinked.includes(k) ? { ...b, link: 'therefore' as const } : b,
    );
    fixed.push(
      `beat${unlinked.length > 1 ? 's' : ''} ${unlinked.map((k) => k + 1).join(', ')} follow${unlinked.length > 1 ? '' : 's'} "therefore"`,
    );
  }
  if (sheet.template !== 'short') {
    const climax = lastOf({ ...sheet, beats }, 'climax');
    const resolved = firstOf({ ...sheet, beats }, 'resolution', 'payoff') >= 0;
    if (climax >= 0 && !resolved && climax < beats.length - 1) {
      const at = climax + 1;
      beats = beats.map((b, k) =>
        k === at ? { ...b, role: 'resolution' as const } : b,
      );
      fixed.push(`beat ${at + 1}, after the climax, is its resolution`);
    }
  }
  return { value: { ...sheet, beats }, fixed };
}

/** What in a beat sheet's problems breaks the story: too few beats, no problem, no climax, nothing after it. */
export function beatsHard(
  sheet: BeatSheet,
  problems: readonly string[],
): string[] {
  const hard = problems.filter((p) =>
    /^(?:Give it (?:a problem beat|a twist|an inciting incident|a climax|a resolution)|End on the payoff)/u.test(
      p,
    ),
  );
  if (sheet.beats.length < 3)
    hard.unshift(
      problems.find((p) => /^A film this long has/u.test(p)) ??
        'A film needs at least three beats.',
    );
  return hard;
}

/**
 * A scene plan with what code can put right put right: every scene
 * after the first linked ("therefore" where it had none); only the
 * show's characters in each scene's cast; scene 1's setup lines said by
 * and to people in it (the hero first), and none given to a narrator;
 * scene 1 long enough to set it all up; and the scenes' seconds scaled
 * to the film's length, the joins between them counted.
 */
export function fixPlan(
  plan: ScenePlan,
  bible: StudioBible,
  opts: { hero?: string | null; minutes?: number | null } = {},
): Fixed<ScenePlan> {
  const fixed: string[] = [];
  let scenes = plan.scenes.map((scene, k) => {
    let one = scene;
    if (k > 0 && !one.link) {
      one = { ...one, link: 'therefore' as const };
      fixed.push(`scene ${k + 1} follows "therefore"`);
    }
    // The cast by the show's ids; a stranger left out, where anyone is left.
    const known = one.cast.map((id) => characterId(id, bible));
    const kept = [...new Set(known.filter((id): id is string => !!id))];
    if (kept.length && known.some((id, i) => id !== one.cast[i])) {
      if (known.some((id) => !id))
        fixed.push(
          `scene ${k + 1} without ${one.cast.filter((_, i) => !known[i]).join(', ')}, none of the show's characters`,
        );
      one = { ...one, cast: kept };
    }
    return one;
  });
  const first = scenes[0];
  if (first) {
    const cast = first.cast.map((id) => characterId(id, bible) ?? id);
    const hero = opts.hero && cast.includes(opts.hero) ? opts.hero : null;
    const setup = first.setup.map((piece): SetupPiece => {
      if (piece.how === 'narration') {
        fixed.push(`scene 1's ${piece.part} is an action, not narration`);
        return { ...piece, how: 'action', by: hero ?? cast[0] ?? '', to: '' };
      }
      if (piece.how !== 'line') return piece;
      const by = characterId(piece.by, bible);
      const to = characterId(piece.to, bible);
      if (by && to && cast.includes(by) && cast.includes(to) && by !== to)
        return by === piece.by && to === piece.to
          ? piece
          : { ...piece, by, to };
      const says = by && cast.includes(by) ? by : (hero ?? cast[0]);
      const hears =
        to && cast.includes(to) && to !== says
          ? to
          : cast.find((id) => id !== says);
      if (!says || !hears) {
        fixed.push(
          `scene 1's ${piece.part} is an action: no one there to say it to`,
        );
        return { ...piece, how: 'action', by: says ?? '', to: '' };
      }
      fixed.push(`scene 1's ${piece.part} is said by ${says} to ${hears}`);
      return { ...piece, by: says, to: hears };
    });
    scenes = [{ ...first, setup }, ...scenes.slice(1)];
    const least = (opts.minutes ?? 1) >= 2 ? 25 : 20;
    if (scenes[0].seconds < least) {
      fixed.push(`scene 1 runs ${least} seconds, to set it all up`);
      scenes = [{ ...scenes[0], seconds: least }, ...scenes.slice(1)];
    }
  }
  // The film's length: the scenes scaled to it, each 10 to 90 seconds.
  if (scenes.length && opts.minutes) {
    const joins = joinsSeconds(scenes.length);
    const said = scenes.reduce((n, s) => n + s.seconds, 0);
    const wanted = opts.minutes * 60;
    if (said + joins > wanted * 1.35 || said + joins < wanted * 0.65) {
      const target = Math.max(10 * scenes.length, wanted - joins);
      const scale = target / said;
      scenes = scenes.map((s, k) => ({
        ...s,
        seconds: Math.round(
          Math.min(90, Math.max(k === 0 ? 20 : 10, s.seconds * scale)),
        ),
      }));
      fixed.push(
        `the scenes' seconds scaled from ${said} to ${scenes.reduce((n, s) => n + s.seconds, 0)}, for a film of about ${wanted}`,
      );
    }
  }
  return { value: { ...plan, scenes }, fixed };
}

/**
 * What in a scene plan's problems (its own and its outline's) breaks the
 * story: no scenes, a scene in no place the show has or with no one in
 * it, someone who is none of the show's characters, a main character
 * with no part, a length far from the film's.
 */
export const planHard = (problems: readonly string[]): string[] =>
  problems.filter((p) =>
    /^(?:The outline has no scenes|Scene \d+ is set in "|Scene \d+ has .+, who are none of the show's characters|Scene \d+ has no one in it|.+ (?:is|are) in no scene: give them a part|The scenes add up to)/u.test(
      p,
    ),
  );
