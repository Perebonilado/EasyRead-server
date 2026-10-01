/**
 * What code checks of the editor's work, and what it puts right itself
 * (infographic-editor-plan §3). The writer is told what is wrong once,
 * as the Studio's writers are; what it still gets wrong is mended here,
 * silently (Richard: checks never block the maker, never show warnings;
 * repair and move on). Code owns the numbers: the angles' totals, the
 * episodes' minutes, the acts' word budgets, how long a row is said in.
 *
 *  - the plan: its beats joined by "but" and "therefore", never "and
 *    then"; an item kept only with two yeses and an episode; at most five
 *    recurring people; every plant paid off in its own episode or a
 *    later one; each episode three to five minutes of its material,
 *    rebalanced at its edges (never padded: a small topic is one episode);
 *  - the beat sheet: word budgets at the audience's pace, slower in a
 *    grave act; no act longer than two minutes without a re-hook;
 *  - the hook: no greeting, no "in this video", every claim in it a sure
 *    one, its promise kept in the last rows;
 *  - the script: a factual row rests on a claim; a number with one source
 *    is never said as exact; a quote with no source is not shown as one;
 *    a contested claim is said to be someone's; loaded words replaced;
 *    long sentences split; no left or right, no talk of the screen, no
 *    "and then";
 *  - the fact check's verdicts applied: a softened claim's rows said
 *    again, a cut one's rows gone.
 */
import { screenTalk } from './studio-screen-talk';
import {
  distinctSources,
  type EditorAngle,
  type EditorClaim,
  type EditorPlan,
  type EditorPlanEpisode,
  type EditorResearch,
  type StudioEditor,
  ANGLES_OFFERED,
  PLAN_LIMITS,
} from './studio-editor';
import type {
  EditorialBeats,
  EditorialFact,
  EditorialRow,
} from './studio-editorial';

/** What the audience's recipe says of pace and sentences (studio-audience recipeFor). */
export interface EditorPace {
  /** The narration's words a minute. */
  wpm: number;
  /** Words a spoken sentence, fewest and most. */
  sentence: [number, number];
}

/** A grown-up's pace, where no audience is said. */
export const PLAIN_PACE: EditorPace = { wpm: 150, sentence: [8, 20] };

const wordsOf = (say: string) => say.split(/\s+/u).filter(Boolean);
const count = (say: string) => wordsOf(say).length;
const cap = (say: string) =>
  say ? `${say.charAt(0).toUpperCase()}${say.slice(1)}` : say;

// ── The angle ─────────────────────────────────────────────────────────────

/**
 * The maker's pick among the angles offered (the first three, by their
 * place), or the best when they leave it to the Studio: its question and
 * pitch, and the others kept as sub-themes, often later episodes. Null
 * when no angle was written.
 */
export function pickedAngle(
  angles: readonly EditorAngle[],
  pick: number | null,
): { angle: EditorAngle; subThemes: string[] } | null {
  if (!angles.length) return null;
  const at =
    pick !== null &&
    Number.isInteger(pick) &&
    pick >= 0 &&
    pick < Math.min(ANGLES_OFFERED, angles.length)
      ? pick
      : 0;
  return {
    angle: angles[at],
    subThemes: angles
      .filter((_, k) => k !== at)
      .slice(0, 5)
      .map((a) => a.question),
  };
}

/** The editor with the maker's angle taken: its question, the rest as sub-themes. */
export function withAngle(
  editor: StudioEditor,
  pick: number | null,
): StudioEditor | null {
  const picked = pickedAngle(editor.angles, pick);
  if (!picked) return null;
  return {
    ...editor,
    question: picked.angle.question,
    pitch: picked.angle.pitch || null,
    subThemes: picked.subThemes,
  };
}

// ── The plan ──────────────────────────────────────────────────────────────

/** An episode's length, least and most, in seconds: three to five minutes. */
export const EPISODE_SECONDS = [180, 300] as const;

/** The pace the plan's items are timed at; the audience's own stretches or shrinks them. */
export const ITEM_PACE_WPM = 150;

/** What every episode spends besides its items: its hook, and its payoff and open loop; a later one's "last time" too. */
export const OPEN_SECONDS = 15;
export const CLOSE_SECONDS = 12;
export const LAST_TIME_SECONDS = 8;

/** The most a compressed item takes. */
export const COMPRESSED_SECONDS = 20;

/** How many of the four questions an item answers yes. */
export const yeses = (item: EditorPlan['items'][number]) =>
  [item.moves, item.setsUp, item.visual, item.surprise].filter(Boolean).length;

/** How long an item runs at the audience's pace. */
export function itemSeconds(
  item: EditorPlan['items'][number],
  wpm: number,
): number {
  const said =
    item.decision === 'compress'
      ? Math.min(item.seconds, COMPRESSED_SECONDS)
      : item.seconds;
  return (said * ITEM_PACE_WPM) / Math.max(60, wpm);
}

/** What the plan's writer is told to put right, once. */
export function planProblems(plan: EditorPlan): string[] {
  const out: string[] = [];
  if (plan.spine.length !== PLAN_LIMITS.spine)
    out.push(
      `Write the spine in exactly six sentences ("Once…", "Every day…", "Until one day…", "Because of that…", "Because of that…", "Until finally…"); it has ${plan.spine.length}.`,
    );
  plan.chain.forEach((beat, k) => {
    if (beat.link === 'and then')
      out.push(
        `Beat ${k + 1} of the chain ("${beat.beat}") follows with "and then": join it to the one before with "but" or "therefore", or cut it.`,
      );
  });
  const recurring = plan.cast.filter((c) => c.recurring);
  if (recurring.length > PLAN_LIMITS.recurring)
    out.push(
      `${recurring.length} recurring people: at most five, each standing for a force in the story; make the rest one-scene people.`,
    );
  plan.items.forEach((item) => {
    if (item.decision !== 'cut' && yeses(item) < 2)
      out.push(
        `"${item.item}" is ${item.decision === 'keep' ? 'kept' : 'compressed'} with fewer than two yeses: cut it, or say how it moves the question, sets up a payoff, can be shown or will surprise.`,
      );
    if (item.decision !== 'cut' && item.episode === null)
      out.push(`"${item.item}" is kept but in no episode: give it one.`);
  });
  if (!plan.episodes.length) out.push('Map the episodes: at least one.');
  return out;
}

/** An episode's seconds: its items' at the audience's pace, and what every episode spends besides. */
export function episodeSeconds(
  plan: Pick<EditorPlan, 'items'>,
  items: readonly number[],
  number: number,
  wpm: number,
): number {
  return (
    OPEN_SECONDS +
    CLOSE_SECONDS +
    (number > 1 ? LAST_TIME_SECONDS : 0) +
    items.reduce((n, k) => n + itemSeconds(plan.items[k], wpm), 0)
  );
}

/** Minutes as the plan says them: to the half minute. */
const minutesOf = (seconds: number) => Math.round((seconds / 60) * 2) / 2;

interface Draft {
  episode: EditorPlanEpisode;
  items: number[];
  /** The plan's episode numbers it holds now: its own, and any merged in. */
  was: number[];
}

/**
 * The plan put right by code, silently: an item kept with fewer than two
 * yeses is cut (and goes to what was left out), one kept in no episode
 * joins its neighbours'; the cast keeps five recurring people at most;
 * the episodes are rebuilt from their items and rebalanced to three to
 * five minutes at their edges (an item moved to or from the next; two
 * short ones merged), never padded, so a small topic is one episode; a
 * plant is paid off in its own episode or a later one. What it did, for
 * the log.
 */
export function soundPlan(
  given: EditorPlan,
  pace: Pick<EditorPace, 'wpm'> = PLAIN_PACE,
  research: Pick<EditorResearch, 'claims'> | null = null,
): { plan: EditorPlan; fixed: string[] } {
  const fixed: string[] = [];
  const plan: EditorPlan = JSON.parse(JSON.stringify(given)) as EditorPlan;
  // An item an episode covers that says no episode of its own is that one's.
  plan.episodes.forEach((e) =>
    e.covers.forEach((k) => {
      const item = plan.items[k];
      if (item && item.decision !== 'cut' && item.episode === null)
        item.episode = e.number;
    }),
  );
  // Two yeses, or out.
  for (const item of plan.items)
    if (item.decision !== 'cut' && yeses(item) < 2) {
      item.decision = 'cut';
      item.episode = null;
      fixed.push(`"${item.item}" cut: fewer than two yeses`);
    }
  // Kept in no episode, or in one the map has not got: its neighbours'.
  const numbers = new Set(plan.episodes.map((e) => e.number));
  plan.items.forEach((item, k) => {
    if (item.decision === 'cut') return;
    if (item.episode !== null && numbers.has(item.episode)) return;
    const near = [...plan.items.slice(0, k)]
      .reverse()
      .find((one) => one.decision !== 'cut' && one.episode !== null)?.episode;
    item.episode = near ?? plan.episodes[0]?.number ?? 1;
    fixed.push(`"${item.item}" given episode ${item.episode}`);
  });
  if (!plan.episodes.length && plan.items.some((i) => i.decision !== 'cut'))
    plan.episodes.push({
      number: 1,
      title: plan.spine[0]?.slice(0, 60) || 'Episode 1',
      question: plan.spine[0] ?? '',
      covers: [],
      plants: [],
      endsOn: '',
      minutes: 0,
      episodeId: null,
    });
  // Five recurring people at most: the rest are on screen once.
  let recurring = 0;
  for (const person of plan.cast)
    if (person.recurring && (recurring += 1) > PLAN_LIMITS.recurring) {
      person.recurring = false;
      fixed.push(`${person.name} made a one-scene person`);
    }
  // The episodes as their items have them, in order, and rebalanced.
  const drafts: Draft[] = plan.episodes
    .slice()
    .sort((a, b) => a.number - b.number)
    .map((episode) => ({
      episode,
      items: plan.items.flatMap((item, k) =>
        item.decision !== 'cut' && item.episode === episode.number ? [k] : [],
      ),
      was: [episode.number],
    }));
  const live = rebalanced(
    drafts.filter((d) => d.items.length || drafts.length === 1),
    plan,
    pace.wpm,
    fixed,
  );
  // Never under three minutes while the story has more to give: its own
  // cut items with two yeses brought back, then the research's unused claims.
  const { short, restored } = filled(live, plan, pace.wpm, research, fixed);
  const renumber = new Map<number, number>();
  live.forEach((d, k) => d.was.forEach((n) => renumber.set(n, k + 1)));
  const last = Math.max(1, live.length);
  plan.episodes = live.map((d, k) => {
    const number = k + 1;
    for (const item of d.items) plan.items[item].episode = number;
    const seconds = episodeSeconds(plan, d.items, number, pace.wpm);
    const episode: EditorPlanEpisode = {
      ...d.episode,
      number,
      covers: d.items,
      minutes: minutesOf(seconds),
      // Paid off here or later, never before it is planted, nor after the show.
      plants: d.episode.plants.map((plant) => {
        const to = renumber.get(plant.paidIn) ?? plant.paidIn;
        const paidIn = Math.min(last, Math.max(number, to));
        if (paidIn !== plant.paidIn)
          fixed.push(`plant "${plant.text}" paid off in episode ${paidIn}`);
        return { ...plant, paidIn };
      }),
    };
    if (short.has(k)) episode.short = true;
    else delete episode.short;
    return episode;
  });
  // An episode the research cannot fill is said to be short, by its title.
  const notes = plan.episodes
    .filter((e) => e.short)
    .map(
      (e) =>
        `"${e.title}" runs about ${e.minutes} minutes: the research holds no more for it.`,
    );
  if (notes.length) plan.notes = notes;
  else delete plan.notes;
  // What is brought back is no longer left out.
  plan.leftOut = plan.leftOut.filter((l) => !restored.has(l.toLowerCase()));
  // Whatever was cut from the whole show is what the description leaves out.
  for (const item of plan.items)
    if (
      item.decision === 'cut' &&
      plan.leftOut.length < PLAN_LIMITS.leftOut &&
      !plan.leftOut.includes(item.item)
    )
      plan.leftOut.push(item.item);
  return { plan, fixed };
}

/**
 * Episodes rebalanced to three to five minutes at their edges: one too
 * long gives its last item to the next (a new episode after the last);
 * one too short takes the next one's first item, or the next one whole
 * when the two fit in five minutes. One still short is filled after
 * (filled), from the story's own material, never padded.
 */
function rebalanced(
  drafts: Draft[],
  plan: EditorPlan,
  wpm: number,
  fixed: string[],
): Draft[] {
  const [least, most] = EPISODE_SECONDS;
  const secs = (d: Draft, at: number) =>
    episodeSeconds(plan, d.items, at + 1, wpm);
  for (let round = 0; round < 60; round += 1) {
    let moved = false;
    for (let i = 0; i < drafts.length; i += 1) {
      const d = drafts[i];
      if (secs(d, i) > most && d.items.length > 1) {
        const item = d.items.pop()!;
        if (!drafts[i + 1])
          drafts.push({
            episode: {
              ...d.episode,
              number: d.episode.number + 100,
              title: `${d.episode.title}, part 2`.slice(0, 80),
              plants: [],
              covers: [],
              episodeId: null,
            },
            items: [],
            was: [],
          });
        drafts[i + 1].items.unshift(item);
        fixed.push(`"${plan.items[item].item}" moved to the next episode`);
        moved = true;
      }
    }
    for (let i = 0; i < drafts.length - 1; i += 1) {
      const d = drafts[i];
      const next = drafts[i + 1];
      if (secs(d, i) >= least) continue;
      const together = episodeSeconds(
        plan,
        [...d.items, ...next.items],
        i + 1,
        wpm,
      );
      if (together <= most) {
        d.items.push(...next.items);
        d.was.push(...next.was);
        d.episode = {
          ...d.episode,
          endsOn: next.episode.endsOn || d.episode.endsOn,
          plants: [...d.episode.plants, ...next.episode.plants],
        };
        drafts.splice(i + 1, 1);
        fixed.push(`episode ${i + 2} joined to episode ${i + 1}`);
        moved = true;
        break;
      }
      if (next.items.length > 1) {
        d.items.push(next.items.shift()!);
        fixed.push(
          `"${plan.items[d.items[d.items.length - 1]].item}" moved to the episode before`,
        );
        moved = true;
      }
    }
    // The last one short: what it can take from the one before, or the two together.
    const at = drafts.length - 1;
    if (at > 0 && secs(drafts[at], at) < least) {
      const before = drafts[at - 1];
      const last = drafts[at];
      const together = episodeSeconds(
        plan,
        [...before.items, ...last.items],
        at,
        wpm,
      );
      if (together <= most) {
        before.items.push(...last.items);
        before.was.push(...last.was);
        before.episode = {
          ...before.episode,
          endsOn: last.episode.endsOn || before.episode.endsOn,
          plants: [...before.episode.plants, ...last.episode.plants],
        };
        drafts.pop();
        fixed.push(`the last episode joined to the one before`);
        moved = true;
      } else if (
        before.items.length > 1 &&
        episodeSeconds(plan, before.items.slice(0, -1), at, wpm) >= least
      ) {
        last.items.unshift(before.items.pop()!);
        fixed.push(
          `"${plan.items[last.items[0]].item}" moved to the last episode`,
        );
        moved = true;
      }
    }
    if (!moved) break;
  }
  return drafts;
}

/** What a claim takes on screen as an item made of it: a line or two. */
const claimItemSeconds = (claim: Pick<EditorClaim, 'text'>) =>
  Math.max(
    5,
    Math.min(
      COMPRESSED_SECONDS,
      Math.round((count(claim.text) * 60) / ITEM_PACE_WPM) + 2,
    ),
  );

/** A claim the research stands behind: sourced, and not found wanting. */
const usable = (claim: EditorClaim) =>
  claim.sources.length > 0 &&
  claim.confidence !== 'low' &&
  claim.status !== 'cut';

/**
 * Episodes still short of three minutes filled from the story, silently:
 * first the items its writer cut in that episode's stretch of the story
 * that have two yeses (brought back as a line or two, the strongest
 * first), then the claims of the research no item uses, the surest first
 * (each a line or two), never past five minutes. One the research cannot
 * fill stays short (`short`, by position), its material its length.
 */
function filled(
  drafts: Draft[],
  plan: EditorPlan,
  wpm: number,
  research: Pick<EditorResearch, 'claims'> | null,
  fixed: string[],
): { short: Set<number>; restored: Set<string> } {
  const [least, most] = EPISODE_SECONDS;
  const secs = (d: Draft, at: number) =>
    episodeSeconds(plan, d.items, at + 1, wpm);
  const short = new Set<number>();
  const restored = new Set<string>();
  const used = new Set(plan.items.flatMap((i) => i.claims));
  drafts.forEach((d, at) => {
    if (secs(d, at) >= least) return;
    // Its stretch of the story: after the episode before's last item, up to the next one's first.
    const before = drafts[at - 1]?.items ?? [];
    const after = drafts[at + 1]?.items ?? [];
    const from = before.length ? Math.max(...before) + 1 : 0;
    const to = after.length ? Math.min(...after) : plan.items.length;
    const back = plan.items
      .map((item, k) => ({ item, k }))
      .filter(
        ({ item, k }) =>
          k >= from && k < to && item.decision === 'cut' && yeses(item) >= 2,
      )
      .sort((a, b) => yeses(b.item) - yeses(a.item) || a.k - b.k);
    for (const { item, k } of back) {
      if (secs(d, at) >= least) break;
      item.decision = 'compress';
      d.items.push(k);
      if (secs(d, at) > most) {
        d.items.pop();
        item.decision = 'cut';
        continue;
      }
      restored.add(item.item.toLowerCase());
      fixed.push(`"${item.item}" brought back for episode ${at + 1}`);
    }
    const left = (research?.claims ?? [])
      .filter((c) => usable(c) && !used.has(c.id))
      .sort(
        (a, b) =>
          Number(b.confidence === 'high') - Number(a.confidence === 'high'),
      );
    let added = 0;
    for (const claim of left) {
      if (secs(d, at) >= least || plan.items.length >= PLAN_LIMITS.items) break;
      plan.items.push({
        item: claim.text.slice(0, 300),
        claims: [claim.id],
        moves: true,
        setsUp: false,
        visual: true,
        surprise: false,
        decision: 'compress',
        episode: null,
        seconds: claimItemSeconds(claim),
        reason: 'from the research, for a full episode',
      });
      d.items.push(plan.items.length - 1);
      if (secs(d, at) > most) {
        d.items.pop();
        plan.items.pop();
        break;
      }
      used.add(claim.id);
      added += 1;
    }
    if (added)
      fixed.push(
        `${added} of the research's claims added to episode ${at + 1}`,
      );
    d.items.sort((a, b) => a - b);
    if (secs(d, at) < least) short.add(at);
  });
  return { short, restored };
}

/** The length the playbook aims an episode at: about four minutes. */
export const EPISODE_AIM_SECONDS = 240;

/**
 * What the plan's writer is told, once, when its first episode runs under
 * three minutes after code's own pulling and bringing back, while the
 * research holds more: keep more of what serves its question, and give
 * the rest of the strong material to later episodes.
 */
export function planLengthProblems(
  plan: EditorPlan,
  pace: Pick<EditorPace, 'wpm'>,
  research: Pick<EditorResearch, 'claims'> | null,
): string[] {
  const [least] = EPISODE_SECONDS;
  const sound = soundPlan(plan, pace).plan;
  const first = sound.episodes[0];
  if (!first || !research) return [];
  const seconds = Math.round(episodeSeconds(sound, first.covers, 1, pace.wpm));
  if (seconds >= least) return [];
  const used = new Set(
    sound.items.filter((i) => i.decision !== 'cut').flatMap((i) => i.claims),
  );
  const left = research.claims.filter((c) => usable(c) && !used.has(c.id));
  const more = left.reduce(
    (n, c) =>
      n + (claimItemSeconds(c) * ITEM_PACE_WPM) / Math.max(60, pace.wpm),
    0,
  );
  // The research truly holds no more: a short episode is its length.
  if (seconds + more < least) return [];
  return [
    `Episode 1 runs about ${seconds} seconds of material; an episode runs three to five minutes, about four. Keep more of the research that serves its question, as items of its own (about ${Math.max(15, EPISODE_AIM_SECONDS - seconds)} seconds more), and give the rest of the strong material to later episodes, each with its own question. Claims no kept item uses yet: ${left
      .slice(0, 30)
      .map((c) => c.id)
      .join(', ')}.`,
  ];
}

/**
 * The seconds an episode's beat sheet and script are written to: its
 * material's at the audience's pace, three to five minutes, under three
 * only when the plan says the research holds no more for it (`short`).
 */
export function episodeTarget(
  plan: EditorPlan,
  number: number,
  wpm: number,
): { seconds: number; short: boolean } | null {
  const episode = plan.episodes.find((e) => e.number === number);
  if (!episode) return null;
  const [least, most] = EPISODE_SECONDS;
  const seconds = episodeSeconds(plan, episode.covers, number, wpm);
  const short = episode.short === true;
  return {
    seconds: Math.round(
      Math.min(most, short ? seconds : Math.max(least, seconds)),
    ),
    short,
  };
}

// ── The beat sheet ────────────────────────────────────────────────────────

/**
 * A beat sheet laid out to its episode's planned length, by code: acts
 * that add up to much less than it scaled up to it together (each act
 * keeping its share), and acts past five minutes (past its material, for
 * a short episode) scaled down; within those, its seconds are its own.
 */
export function fitBeats(
  beats: EditorialBeats,
  target: { seconds: number; short: boolean } | null,
): EditorialBeats {
  if (!target || !beats.acts.length) return beats;
  const total = beats.acts.reduce((n, a) => n + a.seconds, 0);
  if (!total) return beats;
  const most = target.short ? target.seconds * 1.15 : EPISODE_SECONDS[1];
  const to =
    total < target.seconds * 0.9
      ? target.seconds
      : total > most
        ? target.short
          ? target.seconds
          : EPISODE_SECONDS[1]
        : null;
  if (to === null) return beats;
  const acts = beats.acts.map((a) => ({
    ...a,
    seconds: Math.max(10, Math.round((a.seconds * to) / total)),
  }));
  return { ...beats, acts, seconds: acts.reduce((n, a) => n + a.seconds, 0) };
}

/** A grave act is told slower: its words at this share of the pace. */
export const GRAVE_PACE = 0.85;
/** The longest an act runs before the viewer is re-hooked. */
export const REHOOK_EVERY_S = 120;

/** An act's words at the audience's pace, by code: the writer's seconds, fewer words where it is grave. */
export function budgetBeats(
  beats: EditorialBeats,
  pace: Pick<EditorPace, 'wpm'> = PLAIN_PACE,
): EditorialBeats {
  const acts = beats.acts.map((act) => ({
    ...act,
    words: Math.round(
      ((act.seconds * pace.wpm) / 60) * (act.grave ? GRAVE_PACE : 1),
    ),
  }));
  return {
    acts,
    seconds: acts.reduce((n, a) => n + a.seconds, 0),
    words: acts.reduce((n, a) => n + a.words, 0),
  };
}

/** What the beat sheet's writer is told to put right, once: its acts, re-hooks, plants and payoffs. */
export function beatProblems(
  beats: EditorialBeats,
  due: { plants: string[]; payoffs: string[] },
): string[] {
  const out: string[] = [];
  if (!beats.acts.length) out.push('Lay out the acts: two or three.');
  beats.acts.forEach((act, k) => {
    if (act.seconds > REHOOK_EVERY_S)
      out.push(
        `Act ${k + 1} runs ${act.seconds} seconds: no act runs past ${REHOOK_EVERY_S} without a re-hook; split it in two.`,
      );
    if (!act.rehook && k < beats.acts.length - 1)
      out.push(
        `Act ${k + 1} has no re-hook: end it on a line that pulls the viewer into the next.`,
      );
  });
  const planted = new Set(beats.acts.flatMap((a) => a.plants));
  const paid = new Set(beats.acts.flatMap((a) => a.payoffs));
  for (const id of due.plants)
    if (!planted.has(id))
      out.push(`Plant ${id} is planted in this episode: give it an act.`);
  for (const id of due.payoffs)
    if (!paid.has(id))
      out.push(`Plant ${id} pays off in this episode: give it an act.`);
  return out;
}

/** Acts past two minutes split in two by code, each half with its own seconds, the re-hook kept at the end. */
export function splitLongActs(beats: EditorialBeats): EditorialBeats {
  const acts = beats.acts.flatMap((act) => {
    if (act.seconds <= REHOOK_EVERY_S) return [act];
    const half = Math.round(act.seconds / 2);
    return [
      {
        ...act,
        seconds: half,
        words: Math.round(act.words / 2),
        rehook: act.rehook || '',
        payoffs: [],
      },
      {
        ...act,
        title: `${act.title}, continued`.slice(0, 80),
        seconds: act.seconds - half,
        words: act.words - Math.round(act.words / 2),
        plants: [],
      },
    ];
  });
  return {
    acts,
    seconds: acts.reduce((n, a) => n + a.seconds, 0),
    words: acts.reduce((n, a) => n + a.words, 0),
  };
}

// ── The hook ──────────────────────────────────────────────────────────────

const GREETING =
  /^(?:hi|hello|hey|welcome|greetings|good (?:morning|afternoon|evening))\b[^.!?]*[.!?]?\s*/iu;
const VIDEO_TALK =
  /\b(?:in (?:this|today'?s) (?:video|episode|film|lesson)|today,? we(?:'ll| will| are going to)|let'?s (?:talk|dive|explore|look)|(?:don'?t forget to )?(?:like and )?subscribe)\b/iu;

/** What breaks the playbook's hook rules: a greeting, talk of the video, a claim that is not sure. */
export function hookProblems(
  hook: string,
  claims: readonly string[],
  research: Pick<EditorResearch, 'claims'> | null,
): string[] {
  const out: string[] = [];
  if (GREETING.test(hook.trim()))
    out.push(
      'The hook greets the viewer: start on the picture, never a hello.',
    );
  if (VIDEO_TALK.test(hook))
    out.push(
      'The hook talks about the video ("in this video", "today we"): start inside the story instead.',
    );
  const byId = new Map((research?.claims ?? []).map((c) => [c.id, c]));
  for (const id of claims) {
    const claim = byId.get(id);
    if (claim && claim.confidence !== 'high')
      out.push(
        `The hook rests on ${id} ("${claim.text}"), which is not sure: use a fact the research is sure of.`,
      );
  }
  if (/\d/u.test(hook) && !claims.length)
    out.push('The hook states a number or a date with no claim: cite it.');
  return out;
}

/** A hook with its greeting and its talk of the video taken out, by code. */
export function mendHook(hook: string): string {
  let out = hook.trim().replace(GREETING, '');
  out = out.replace(
    /\b(?:in (?:this|today'?s) (?:video|episode|film|lesson)),?\s*/giu,
    '',
  );
  out = out.replace(/\s+/gu, ' ').trim();
  return cap(out) || hook.trim();
}

/** The words that carry a sentence's meaning: no little words. */
const LITTLE = new Set(
  'a an the of to in on at by for and or but so is are was were be been it its this that these those what why how when where who which with from as into than then they them their there here do does did not no yes can could would should will just about over after before more most much many very'.split(
    ' ',
  ),
);
const keyWords = (say: string) =>
  new Set(
    say
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/u)
      .filter((w) => w.length > 3 && !LITTLE.has(w))
      .map((w) => (w.length > 4 && w.endsWith('s') ? w.slice(0, -1) : w)),
  );

/** Whether the promise the hook (or the episode's question) makes comes back in the script's last rows. */
export function promiseReturns(
  promise: string,
  rows: readonly Pick<EditorialRow, 'say'>[],
): boolean {
  const asked = keyWords(promise);
  if (!asked.size || !rows.length) return true;
  // Its payoff, then the open loop into the next: the last three rows.
  const end = keyWords(
    rows
      .slice(-3)
      .map((r) => r.say)
      .join(' '),
  );
  const shared = [...asked].filter((w) => end.has(w)).length;
  return shared >= Math.min(2, asked.size);
}

// ── The script ────────────────────────────────────────────────────────────

/** The longest sentence a row may be, in words. */
export const MOST_SENTENCE_WORDS = 22;

/** A script, or an act, under this share of its word budget is short of its material. */
export const SHORT_SHARE = 0.85;

/** Words that say people are in a picture. */
const PEOPLE_WORDS =
  /\b(?:people|person|crowds?|man|men|woman|women|child|children|kids?|boys?|girls?|family|families|farmers?|workers?|students?|traders?|merchants?|sailors?|soldiers?|villagers?|townspeople|citizens|priests?|monks?|scholars?|astronomers?|officials?|clerks?|leaders?|king|queen|pope|emperor|doctors?|nurses?|scientists?|teachers?|crew|audience|delegates?|members?|hands?|someone|everyone|they|he|she)\b/iu;

/**
 * A script's scene rows held to what an illustrated scene is, silently: a
 * scene row shows people in a place (the world's, or anyone), never a
 * thing alone or a diagram, which is the lesson's ("why"); and a scene row
 * alone between lesson rows joins their lesson, so the film is never cut
 * into scraps.
 */
export function soundScenes(
  rows: readonly EditorialRow[],
  world: { places: { name: string }[]; people: { name: string }[] } | null,
): { rows: EditorialRow[]; fixed: number } {
  const names = [
    ...(world?.people ?? []).flatMap((p) =>
      p.name
        .toLowerCase()
        .split(/\s+/u)
        .filter((w) => w.length > 3),
    ),
  ];
  const peopled = (row: EditorialRow) => {
    const said = `${row.show} ${row.say}`.toLowerCase();
    return PEOPLE_WORDS.test(said) || names.some((n) => said.includes(n));
  };
  let fixed = 0;
  const out = rows.map((row) => {
    if (row.visual !== 'scene' || peopled(row)) return row;
    fixed += 1;
    return { ...row, visual: 'why' as const };
  });
  for (let k = 0; k < out.length; k += 1) {
    if (out[k].visual !== 'scene') continue;
    const alone =
      out[k - 1]?.visual !== 'scene' &&
      out[k + 1]?.visual !== 'scene' &&
      // At an episode's edge a lone shot opens or closes it: kept.
      k > 0 &&
      k < out.length - 1;
    if (alone) {
      out[k] = { ...out[k], visual: 'why' };
      fixed += 1;
    }
  }
  return { rows: out, fixed };
}

/**
 * Words a fair film does not use (the playbook's sensitivity read), each
 * with a plain one in its place where there is one; one with none goes
 * back to the writer, and is left only if it comes back the same.
 */
export const LOADED_WORDS: { words: RegExp; instead: string | null }[] = [
  { words: /\btribes\b/giu, instead: 'peoples' },
  { words: /\btribe\b/giu, instead: 'people' },
  { words: /\btribal\b/giu, instead: 'local' },
  { words: /\bprimitive\b/giu, instead: 'early' },
  { words: /\bexotic\b/giu, instead: 'unfamiliar' },
  { words: /\bthird[- ]world\b/giu, instead: 'lower-income' },
  { words: /\bthe natives\b/giu, instead: 'the people who lived there' },
  { words: /\bnatives\b/giu, instead: 'local people' },
  { words: /\bbackward\b/giu, instead: null },
  { words: /\bsavages?\b/giu, instead: null },
  { words: /\buncivili[sz]ed\b/giu, instead: null },
  { words: /\bdark continent\b/giu, instead: null },
  { words: /\bheathens?\b/giu, instead: null },
  { words: /\bhalf[- ]castes?\b/giu, instead: null },
  { words: /\b(?:gift|granting) of independence\b/giu, instead: null },
  {
    words: /\b(?:was|were) (?:given|granted) (?:its |their )?independence\b/giu,
    instead: null,
  },
];

/** Whether a row says something that needs a source: a number, a date, a name, a quote. */
export function isFactual(say: string): boolean {
  if (/\d/u.test(say)) return true;
  if (/["“”]/u.test(say)) return true;
  if (/\?\s*$/u.test(say)) return false;
  // A name: a capital in the middle of the sentence.
  return wordsOf(say)
    .slice(1)
    .some((w) => /^[A-Z][a-z]/u.test(w.replace(/^[("'“]/u, '')));
}

const ATTRIBUTED =
  /\b(?:according to|says?|said|argues?|argued|claims?|claimed|believes?|believed|historians?|scholars?|scientists?|critics?|supporters?|reportedly|some (?:say|think|believe)|it is (?:said|thought|believed)|in (?:his|her|their) (?:view|words)|by (?:some|many|most) accounts?|wrote|writes|recalled)\b/iu;

const HEDGED =
  /\b(?:about|around|roughly|nearly|almost|some|over|under|more than|less than|fewer than|up to|at least|approximately|close to|an estimated|perhaps|maybe)\s+$/iu;

/** A year, not a quantity: never softened. */
const YEAR = /^(?:1[0-9]{3}|20[0-9]{2})$/u;

/** A number said as not exact: "about" before its first quantity that is not a year, nor part of a word ("a 365-day year"). */
export function softened(say: string): string {
  const found = /\b\d[\d,.]*\b/gu;
  let m: RegExpExecArray | null;
  while ((m = found.exec(say))) {
    const token = m[0].replace(/[.,]$/u, '');
    if (YEAR.test(token)) continue;
    if (/^-\p{L}/u.test(say.slice(m.index + m[0].length))) continue;
    const before = say.slice(0, m.index);
    if (HEDGED.test(before)) return say;
    return `${before}about ${say.slice(m.index)}`;
  }
  return say;
}

/** The words a sentence opens with that are common words, lower-cased after "According to …,". */
const COMMON_OPENING =
  /^(?:The|A|An|This|That|These|Those|It|In|On|At|By|For|When|After|Before|Many|Most|Some|There|Its|Their|His|Her)\b/u;

/** A contested claim's row said as someone's. */
export function attributed(say: string, who: string | null): string {
  if (ATTRIBUTED.test(say)) return say;
  const rest = COMMON_OPENING.test(say)
    ? `${say.charAt(0).toLowerCase()}${say.slice(1)}`
    : say;
  return `According to ${who || 'some accounts'}, ${rest}`;
}

/** A row's words with what talks of the screen taken out, where what is left still reads; null where it does not. */
export function withoutScreenTalk(say: string): string | null {
  let out = say;
  for (let k = 0; k < 3; k += 1) {
    const talk = screenTalk(out);
    if (!talk) break;
    out = out
      .replace(talk, '')
      .replace(/^\s*,\s*/u, '')
      .replace(/,\s*,/gu, ',')
      .replace(/\s+([,.;:!?])/gu, '$1')
      .replace(/\s{2,}/gu, ' ')
      .trim();
  }
  if (screenTalk(out) || count(out) < 3) return null;
  return cap(out.replace(/^,\s*/u, ''));
}

/** Where a long sentence breaks best: near its middle, at a joint the ear hears. */
const JOINTS: [RegExp, (rest: string) => string][] = [
  [/, and /u, (rest) => `And ${rest}`],
  [/, but /u, (rest) => `But ${rest}`],
  [/, so /u, (rest) => `So ${rest}`],
  [/, because /u, (rest) => `That's because ${rest}`],
  [/; /u, (rest) => cap(rest)],
  [/ — /u, (rest) => cap(rest)],
  [/, which /u, (rest) => `That ${rest}`],
];

/** A sentence too long for the ear, in two, where it has a joint near its middle; null where it has none. */
export function splitSentence(say: string): [string, string] | null {
  const total = count(say);
  let best: {
    at: number;
    len: number;
    again: (rest: string) => string;
    score: number;
  } | null = null;
  for (const [joint, again] of JOINTS) {
    const all = new RegExp(joint.source, 'gu');
    let m: RegExpExecArray | null;
    while ((m = all.exec(say))) {
      const left = count(say.slice(0, m.index));
      if (left < 5 || total - left < 5) continue;
      const score = Math.abs(left - total / 2);
      if (!best || score < best.score)
        best = { at: m.index, len: m[0].length, again, score };
    }
  }
  if (!best) return null;
  const first = say.slice(0, best.at).replace(/[,;:\s—]+$/u, '');
  const second = best.again(say.slice(best.at + best.len).trim());
  return [/[.!?]$/u.test(first) ? first : `${first}.`, second];
}

/** The longest a row may be for this audience: its recipe's sentence and a little, never past 22 words. */
export const longestRow = (pace: Pick<EditorPace, 'sentence'>) =>
  Math.min(MOST_SENTENCE_WORDS, Math.max(12, pace.sentence[1] + 4));

/** The words a script's row runs, for its length in rows: one sentence each. */
export const rowWords = (pace: Pick<EditorPace, 'sentence'>) =>
  Math.max(8, Math.min(14, pace.sentence[1] - 2));

/** Context the script is checked in: the show's research and the audience's pace. */
export interface ScriptContext {
  research: Pick<EditorResearch, 'claims'> | null;
  pace: EditorPace;
  beats?: EditorialBeats | null;
  /** The world's people and places, by the names a script says them by. */
  world?: WorldNames | null;
}

const claimsOf = (
  row: Pick<EditorialRow, 'claims'>,
  research: Pick<EditorResearch, 'claims'> | null,
): EditorClaim[] =>
  row.claims.flatMap((id) => {
    const claim = research?.claims.find((c) => c.id === id);
    return claim ? [claim] : [];
  });

/** A quote with nothing sure behind it: quoted words, and no quote claim with a source. */
const unsourcedQuote = (
  row: EditorialRow,
  research: Pick<EditorResearch, 'claims'> | null,
) =>
  /["“][^"”]{8,}["”]/u.test(row.say) &&
  !claimsOf(row, research).some(
    (c) => c.kind === 'quote' && c.sources.length > 0,
  );

/** A number the research has not checked against two sources. */
const unsureNumber = (claim: EditorClaim) =>
  claim.kind === 'number' &&
  (distinctSources(claim.sources) < 2 || claim.confidence === 'low');

// ── Narration, never a direction ──────────────────────────────────────────

/** A world's people and places as a script names them, each with the id code knows it by. */
export interface WorldNames {
  places: readonly { id: string; name: string }[];
  people: readonly { id: string; name: string }[];
}

/** A run of words joined by hyphens, as a world's ids are: "a-calendar-user". */
const ID_LIKE = /\b[a-z0-9]+(?:-[a-z0-9]+)+\b/giu;

/** A world's ids a sentence could never say (those with a hyphen), each with its name. */
function idNames(world: WorldNames | null | undefined): Map<string, string> {
  const out = new Map<string, string>();
  for (const one of [...(world?.people ?? []), ...(world?.places ?? [])])
    if (one.id.includes('-') && one.name)
      out.set(one.id.toLowerCase(), one.name);
  return out;
}

/** The world's ids a sentence uses, as they stand in it. */
function idsIn(say: string, world: WorldNames | null | undefined): string[] {
  const names = idNames(world);
  if (!names.size) return [];
  return [...say.matchAll(ID_LIKE)]
    .map((m) => m[0])
    .filter((id) => names.has(id.toLowerCase()));
}

/**
 * Words with each world id said as its name: "a-calendar-user" is "a
 * calendar user" mid-sentence, "A calendar user" opening one.
 */
export function namedText(
  words: string,
  world: WorldNames | null | undefined,
): string {
  const names = idNames(world);
  if (!names.size) return words;
  return words.replace(ID_LIKE, (found: string, at: number, whole: string) => {
    const name = names.get(found.toLowerCase());
    if (!name) return found;
    const before = whole.slice(0, at);
    const opens = !before.trim() || /[.!?:]\s*$/u.test(before);
    return !opens && /^(?:A|An|The) \p{Ll}/u.test(name)
      ? name[0].toLowerCase() + name.slice(1)
      : name;
  });
}

/** A script's rows with every world id in what is said and seen given as its name. */
export function withNames(
  rows: readonly EditorialRow[],
  world: WorldNames | null | undefined,
): EditorialRow[] {
  if (!idNames(world).size) return [...rows];
  return rows.map((row) => {
    const say = namedText(row.say, world);
    const show = namedText(row.show, world);
    return say === row.say && show === row.show ? row : { ...row, say, show };
  });
}

/** Light and time set down as a screenplay's heading sets them: "Dawn,", "Soft afternoon light,". */
const SLUG =
  /^(?:(?:soft|bright|hard|harsh|warm|cold|grey|gray|golden|pale|dim|early|late|morning|afternoon|evening|midday|winter|summer|autumn|spring)\s+)*(?:dawn|dusk|daylight|sunlight|lamplight|candlelight|light|night|nighttime|night-time|midday|noon|midnight|morning|afternoon|evening|sunrise|sunset|interior|exterior|int\.?|ext\.?)$/iu;

/** Little words, and those that only place things, which say nothing of a row's meaning. */
const PLACING = new Set(
  'under above below beside behind through across around while same each every other some only also still even once onto upon near'.split(
    ' ',
  ),
);

/** A word as a script and its picture both say it: "unrolled" and "unroll" one word. */
const stemOf = (word: string) => {
  let w = word;
  if (w.length > 4 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1);
  if (w.length > 5 && w.endsWith('ing')) w = w.slice(0, -3);
  else if (w.length > 4 && w.endsWith('ed')) w = w.slice(0, -2);
  if (w.length > 4 && w.endsWith('e')) w = w.slice(0, -1);
  return w;
};

/** The words that carry meaning, as stems: no little words, no numbers. */
const meaningWords = (words: string) =>
  new Set(
    words
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/u)
      .filter(
        (w) =>
          w.length > 2 && !/\d/u.test(w) && !LITTLE.has(w) && !PLACING.has(w),
      )
      .map(stemOf),
  );

/** What a row's picture asks for, without the words it puts on screen ("…"). */
const unquoted = (show: string) => show.replace(/["“][^"”]*["”]/gu, ' ');

/** The opening a row sets down as a label: a place's name or its picture's first words, or the light. */
function labelIn(
  row: Pick<EditorialRow, 'say' | 'show'>,
  world: WorldNames | null | undefined,
): string | null {
  const say = row.say.trim();
  const comma = say.indexOf(',');
  if (comma <= 0) return null;
  const first = say.slice(0, comma).trim();
  const bare = (words: string) =>
    words
      .replace(/^(?:the|a|an)\s+/iu, '')
      .trim()
      .toLowerCase();
  const label = bare(first);
  if (!label) return null;
  const places = (world?.places ?? []).map((p) => bare(p.name));
  const pictured = bare(unquoted(row.show).split(',')[0] ?? '');
  return places.includes(label) || label === pictured || SLUG.test(first)
    ? first
    : null;
}

/**
 * Why a row's words are a stage direction, not what a narrator says; null
 * when they are narration. A direction names someone or somewhere by the
 * world's id ("a-calendar-user"); sets a place or the light down as a
 * label before its sentence ("Modern home office, …"); or reads out its
 * own picture: most of its words are the ones its show asks to be drawn,
 * at least two of them more than the names of the world's people and
 * places (so a name card's line, which names who is shown, is narration).
 */
export function directionIn(
  row: Pick<EditorialRow, 'say' | 'show'>,
  world: WorldNames | null | undefined,
): string | null {
  const ids = idsIn(row.say, world);
  if (ids.length)
    return `it names ${ids.map((id) => `"${id}"`).join(' and ')} by an id: say the name, as the world says it`;
  const label = labelIn(row, world);
  if (label)
    return `it opens on "${label}," set down as a label, as a direction does`;
  const said = meaningWords(row.say);
  if (said.size < 3) return null;
  const shown = meaningWords(unquoted(row.show));
  const names = meaningWords(
    [...(world?.people ?? []), ...(world?.places ?? [])]
      .map((one) => one.name)
      .join(' '),
  );
  const shared = [...said].filter((w) => shown.has(w));
  const plain = shared.filter((w) => !names.has(w));
  return shared.length * 2 >= said.size && plain.length >= 2
    ? `it reads out its own picture (${plain.join(', ')})`
    : null;
}

/** A claim's words as a sentence the narrator says. */
const sentenceOf = (words: string) => {
  const said = words.trim().replace(/\s+/gu, ' ');
  if (!said) return '';
  return cap(/[.!?]["”]?$/u.test(said) ? said : `${said}.`);
};

/**
 * A script's stage directions put right by code after the one revision,
 * silently: every world id said as its name; a row still a direction
 * said instead as the claim it rests on (one no other row says yet),
 * its picture kept; else dropped. A direction is never voiced.
 */
export function withoutDirections(
  given: readonly EditorialRow[],
  ctx: ScriptContext,
): { rows: EditorialRow[]; fixed: string[] } {
  const world = ctx.world ?? null;
  const rows = withNames(given, world);
  const fixed: string[] = [];
  const directions = new Set(
    rows.flatMap((row, k) => (directionIn(row, world) ? [k] : [])),
  );
  if (!directions.size) return { rows, fixed };
  // What the narration says already: the claims of the rows that stay.
  const said = new Set(
    rows.flatMap((row, k) => (directions.has(k) ? [] : row.claims)),
  );
  const most = longestRow(ctx.pace) + 8;
  const out = rows.flatMap((row, k): EditorialRow[] => {
    if (!directions.has(k)) return [row];
    const claim = claimsOf(row, ctx.research).find(
      (c) => !said.has(c.id) && count(c.text) <= most,
    );
    const say = claim ? sentenceOf(claim.text) : '';
    if (claim && say && !directionIn({ say, show: row.show }, world)) {
      said.add(claim.id);
      fixed.push(`row ${k + 1}: a stage direction said as what it means`);
      return [{ ...row, say, claims: [claim.id] }];
    }
    fixed.push(`row ${k + 1}: a stage direction dropped`);
    return [];
  });
  return { rows: out, fixed };
}

/**
 * What the script's writer and the editor's read are told code found,
 * for the one revision: each a note in plain words, by row.
 */
export function scriptProblems(
  rows: readonly EditorialRow[],
  ctx: ScriptContext,
): string[] {
  const out: string[] = [];
  const most = longestRow(ctx.pace);
  rows.forEach((row, k) => {
    const n = k + 1;
    if (isFactual(row.say) && !row.claims.length)
      out.push(
        `Row ${n} states a fact with no claim ("${row.say}"): cite the claim it rests on, or cut it.`,
      );
    if (count(row.say) > most)
      out.push(
        `Row ${n} is ${count(row.say)} words: ${most} at most, one idea a sentence.`,
      );
    const talk = screenTalk(row.say);
    if (talk)
      out.push(
        `Row ${n} talks about the screen ("${talk}"): say what it means, never where it stands or what can be seen.`,
      );
    if (/^and then\b/iu.test(row.say))
      out.push(
        `Row ${n} opens with "and then": join it to the row before with "but" or "so", or let it stand alone.`,
      );
    for (const { words, instead } of LOADED_WORDS) {
      words.lastIndex = 0;
      const found = words.exec(row.say);
      if (found)
        out.push(
          instead
            ? `Row ${n} says "${found[0]}": say "${instead}".`
            : `Row ${n} says "${found[0]}", a loaded word: say it plainly and fairly.`,
        );
    }
    if (unsourcedQuote(row, ctx.research))
      out.push(
        `Row ${n} quotes words no source gives exactly: paraphrase them.`,
      );
    for (const claim of claimsOf(row, ctx.research)) {
      if (claim.contested && !ATTRIBUTED.test(row.say))
        out.push(
          `Row ${n} rests on ${claim.id}, which is contested: say whose view it is${claim.who ? ` (${claim.who})` : ''}.`,
        );
      if (
        unsureNumber(claim) &&
        /\d/u.test(row.say) &&
        !/\b(?:about|around|roughly|nearly|almost|some|over|more than)\b/iu.test(
          row.say,
        )
      )
        out.push(
          `Row ${n} gives ${claim.id}'s number as exact, and only one source has it: say "about".`,
        );
    }
    if (!row.show)
      out.push(
        `Row ${n} shows nothing: write what is seen while it is said, or cut the line.`,
      );
    const direction = directionIn(row, ctx.world);
    if (direction)
      out.push(
        `Row ${n} is a stage direction, not narration ("${row.say}"): ${direction}. Say is only what the narrator speaks aloud: what the moment means and why it matters. The place, the light and what people do belong in show.`,
      );
  });
  // Each act's words against its budget, and the whole episode's: its
  // length is its material's, never cut short of what the plan gave it.
  for (const [k, act] of (ctx.beats?.acts ?? []).entries()) {
    const said = rows
      .filter((r) => r.act === k + 1)
      .reduce((n, r) => n + count(r.say), 0);
    if (act.words && said > act.words * 1.25)
      out.push(
        `Act ${k + 1} runs ${said} words; its budget is ${act.words}: keep the strongest.`,
      );
    else if (act.words && said < act.words * SHORT_SHARE)
      out.push(
        `Act ${k + 1} runs only ${said} words of its ${act.words}: write it out in full, with this act's own material from the plan, a sentence a row.`,
      );
  }
  const budget = ctx.beats?.words ?? 0;
  const total = rows.reduce((n, r) => n + count(r.say), 0);
  if (budget && total < budget * SHORT_SHARE) {
    const more = budget - total;
    out.unshift(
      `The script runs about ${total} words (${Math.round((total * 60) / Math.max(60, ctx.pace.wpm))} seconds); the beat sheet gives this episode about ${budget} (${Math.round(ctx.beats?.seconds ?? 0)} seconds). It needs about ${more} more words: about ${Math.ceil(more / rowWords(ctx.pace))} more rows of about ${rowWords(ctx.pace)} words. Write every act out in full. Cut only what is weak, and put this episode's own material from the plan in its place; never make the episode shorter than its material.`,
    );
  }
  return out;
}

/**
 * The script put right by code after its one revision, silently: a
 * sentence too long split at its joint; "and then" gone; what talks of
 * the screen taken out; loaded words replaced where a plain one fits; an
 * unsure number said "about"; a contested claim said as someone's; a
 * quote with no source no longer shown or said as exact words. What it
 * did, for the log.
 */
export function mendRows(
  given: readonly EditorialRow[],
  ctx: ScriptContext,
): { rows: EditorialRow[]; fixed: string[] } {
  const fixed: string[] = [];
  const most = longestRow(ctx.pace);
  const out: EditorialRow[] = [];
  for (const [k, original] of given.entries()) {
    const row = { ...original };
    const n = k + 1;
    const named = {
      say: namedText(row.say, ctx.world),
      show: namedText(row.show, ctx.world),
    };
    if (named.say !== row.say || named.show !== row.show) {
      Object.assign(row, named);
      fixed.push(`row ${n}: an id said as its name`);
    }
    if (/^and then,?\s+/iu.test(row.say)) {
      row.say = cap(row.say.replace(/^and then,?\s+/iu, ''));
      fixed.push(`row ${n}: "and then" taken out`);
    }
    if (screenTalk(row.say)) {
      const plain = withoutScreenTalk(row.say);
      if (plain) {
        row.say = plain;
        fixed.push(`row ${n}: talk of the screen taken out`);
      }
    }
    for (const { words, instead } of LOADED_WORDS) {
      if (!instead) continue;
      words.lastIndex = 0;
      if (!words.test(row.say)) continue;
      words.lastIndex = 0;
      row.say = row.say.replace(words, (found) =>
        /^[A-Z]/u.test(found) ? cap(instead) : instead,
      );
      fixed.push(`row ${n}: a loaded word said plainly`);
    }
    const claims = claimsOf(row, ctx.research);
    if (claims.some(unsureNumber) && /\d/u.test(row.say)) {
      const soft = softened(row.say);
      if (soft !== row.say) {
        row.say = soft;
        row.show = softened(row.show);
        fixed.push(`row ${n}: an unsure number said "about"`);
      }
    }
    const contested = claims.find((c) => c.contested);
    if (contested && !ATTRIBUTED.test(row.say)) {
      row.say = attributed(row.say, contested.who);
      fixed.push(`row ${n}: said as ${contested.who ?? 'some accounts'}'s`);
    }
    if (unsourcedQuote(row, ctx.research)) {
      row.say = row.say.replace(/["“”]/gu, '');
      if (row.visual === 'exact-words') row.visual = 'who';
      fixed.push(`row ${n}: a quote with no source no longer shown as one`);
    }
    if (count(row.say) > most) {
      const halves = splitSentence(row.say);
      if (halves) {
        out.push(
          { ...row, say: halves[0], hold: false, payoff: null },
          { ...row, say: halves[1], plant: null, music: null },
        );
        fixed.push(`row ${n}: split in two`);
        continue;
      }
    }
    out.push(row);
  }
  return { rows: out, fixed };
}

// ── The fact check ────────────────────────────────────────────────────────

/**
 * The fact check's verdicts applied: a softened claim's rows said again
 * as the checker rewrote them (else its numbers said "about"); a cut
 * claim's rows gone, unless rewritten; and every claim the script uses
 * marked with what the check found (one it did not check, unverified).
 */
export function applyFacts(
  rows: readonly EditorialRow[],
  facts: readonly EditorialFact[],
  research: EditorResearch,
): {
  rows: EditorialRow[];
  research: EditorResearch;
  softened: number;
  cut: number;
} {
  const verdict = new Map(facts.map((f) => [f.claim, f]));
  const rewritten = new Map<number, string>();
  for (const fact of facts)
    if (fact.verdict !== 'verified')
      for (const w of fact.rewrites)
        if (rows[w.row]?.claims.includes(fact.claim))
          rewritten.set(w.row, w.say);
  let softenedRows = 0;
  let cutRows = 0;
  const out = rows.flatMap((row, k): EditorialRow[] => {
    const own = row.claims.map((id) => verdict.get(id)).filter(Boolean);
    const said = rewritten.get(k);
    if (own.some((f) => f!.verdict === 'cut') && said === undefined) {
      cutRows += 1;
      return [];
    }
    if (said !== undefined) {
      softenedRows += 1;
      return [{ ...row, say: said }];
    }
    if (own.some((f) => f!.verdict === 'soften') && /\d/u.test(row.say)) {
      const soft = softened(row.say);
      if (soft !== row.say) softenedRows += 1;
      return [{ ...row, say: soft, show: softened(row.show) }];
    }
    return [row];
  });
  const used = new Set(rows.flatMap((r) => r.claims));
  return {
    rows: out,
    research: {
      ...research,
      claims: research.claims.map((claim) => {
        const fact = verdict.get(claim.id);
        if (fact)
          return {
            ...claim,
            status: fact.verdict,
            // What the check found it at, kept beside the research's own.
            sources: [
              ...claim.sources,
              ...fact.sources.filter(
                (s) => !claim.sources.some((o) => o.url === s.url),
              ),
            ].slice(0, 6),
          };
        return used.has(claim.id) && !claim.status
          ? { ...claim, status: 'unverified' as const }
          : claim;
      }),
    },
    softened: softenedRows,
    cut: cutRows,
  };
}

// ── Measures, for the bench and the log ───────────────────────────────────

/** How long a row is said in, at the audience's pace, with the breath after it. */
export const rowSeconds = (
  row: Pick<EditorialRow, 'say' | 'hold'>,
  wpm: number,
) => (count(row.say) * 60) / Math.max(60, wpm) + (row.hold ? 1.2 : 0.4);

/** The words a row puts on the screen: what its picture quotes. */
export const screenWords = (show: string) =>
  [...show.matchAll(/["“]([^"”]+)["”]/gu)].reduce((n, m) => n + count(m[1]), 0);

// ── The package ───────────────────────────────────────────────────────────

/**
 * The package put right by code, silently: the title and the thumbnail
 * say different things (where the thumbnail's words are all the title's,
 * the next title drafted takes its place), and what the show leaves out
 * is always said, in its own paragraph and at the end of the description.
 */
export function soundPackage<
  P extends {
    title: string;
    titles: { text: string; verdict: string }[];
    thumbnail: { words: string; row: number | null };
    description: string;
    leftOut: string;
  },
>(pack: P, leftOut: readonly string[]): P {
  const out = { ...pack };
  const words = (said: string) =>
    said
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/u)
      .filter(Boolean);
  const same = (title: string) => {
    const thumb = words(out.thumbnail.words);
    const named = new Set(words(title));
    return thumb.length > 0 && thumb.every((w) => named.has(w));
  };
  if (same(out.title)) {
    const other = out.titles.find((t) => t.text !== out.title && !same(t.text));
    if (other) out.title = other.text;
  }
  const missing = leftOut.length
    ? `What we left out: ${leftOut.join('; ')}.`
    : '';
  if (!out.leftOut && missing) out.leftOut = missing;
  if (out.leftOut && !/what we left out/iu.test(out.description))
    out.description = [out.description, out.leftOut]
      .filter(Boolean)
      .join('\n\n')
      .slice(0, 3000);
  return out;
}
