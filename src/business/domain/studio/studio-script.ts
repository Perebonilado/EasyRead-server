/**
 * The whole script as a story (studio-story-plan §1.5, §1.6, §3F; S3 and
 * S4): what code sees across the scenes once they are written, and the
 * table read, a critic's read of the whole script against a rubric.
 *
 * Code checks three things the scene checks cannot, each a note for the
 * scene it is about:
 * - voice: lines any character could have said (stock lines, a pet
 *   phrase in the wrong mouth, a speaker who never sounds like their
 *   sheet, a long line from someone who talks in short ones);
 * - plants: what the beat sheet plants and pays off is in the words of
 *   the scenes that serve those beats;
 * - turns: each scene's planned turn shows in what is said and done.
 *
 * The table read scores the rubric from 0 to 10 with notes for each
 * scene; below the bar, the failing scenes are written again with their
 * notes. Nothing of it is said to the maker.
 */
import type {
  SheetBeat,
  StorySheet,
  StudioBible,
  StudioCharacter,
  StudioOutline,
} from './studio';
import {
  contextOf,
  covered,
  stemsOf,
  trackSetups,
  type Persona,
  type StudioStory,
} from './studio-story';

// ── The rubric ────────────────────────────────────────────────────────────

/** The table read's rubric (§1.6), with the production checks (§3F). */
export const RUBRIC = [
  {
    key: 'want',
    name: 'Clear want and stakes',
    test: 'by the end of the first scene we know what the hero wants and what is at risk',
  },
  {
    key: 'escalation',
    name: 'Escalation',
    test: 'each attempt is harder or costs more',
  },
  {
    key: 'turn',
    name: 'A real turn',
    test: 'something changes the direction; not just more of the same',
  },
  {
    key: 'choice',
    name: "The hero's choice",
    test: 'the climax is decided by what the hero does, not by luck or a grown-up',
  },
  {
    key: 'setups',
    name: 'Setups and payoffs',
    test: 'every plant pays off; nothing comes from nowhere',
  },
  {
    key: 'character',
    name: 'Character',
    test: 'each character acts and speaks like their sheet; the flaw shows; someone changes',
  },
  {
    key: 'dialogue',
    name: 'Dialogue',
    test: 'lines are specific to the speaker, with subtext; no speeches; no one explains their feelings outright',
  },
  {
    key: 'heart',
    name: 'Humour or heart',
    test: 'moments that land for the tone (laughs for a comedy, warmth for a gentle story, chills for a spooky one)',
  },
  {
    key: 'narration',
    name: 'Narration',
    test: "within the maker's narrator setting; the characters carry the story",
  },
  {
    key: 'show',
    name: "Show, don't tell",
    test: 'what the stage can show (actions, faces, things) is shown, not narrated or explained',
  },
  {
    key: 'fit',
    name: 'Fit',
    test: 'right for the audience, and within the length',
  },
  {
    key: 'hook',
    name: 'A hook',
    test: 'it opens with a hook: a joke, a mystery or a problem in the first seconds',
  },
  {
    key: 'build',
    name: 'A build',
    test: 'a clear build to the climax: the scenes climb toward it',
  },
  {
    key: 'low',
    name: 'A low point',
    test: 'a moment it seems lost (or, in a very short film, a clear moment of doubt) before the climax',
  },
  {
    key: 'button',
    name: 'A button',
    test: 'it ends on a button: a last laugh or a warm beat, not a summary or a moral said out loud (unless the maker asked for a moral)',
  },
] as const;
export type RubricKey = (typeof RUBRIC)[number]['key'];
export const RUBRIC_KEYS: RubricKey[] = RUBRIC.map((r) => r.key);

/**
 * The bar a script must clear, calibrated on the story bench: its
 * overall score, every rubric item, and each scene's own. Below it, the
 * failing scenes are written again.
 */
export const BAR = { overall: 7, item: 5, scene: 6 } as const;
/** Rounds of rewrites at most, after the first read. */
export const TABLE_READ_ROUNDS = 2;

/** One scene as the table read found it. */
export interface SceneRead {
  /** Which scene, from 0. */
  scene: number;
  score: number;
  /** Whether the critic scored it; one it left out has the overall, and is never sent back for it. */
  given: boolean;
  /** Specific notes for its writer; empty for none. */
  notes: string[];
}

/** A line the critic heard as anyone's. */
export interface VoiceSlip {
  scene: number;
  who: string;
  line: string;
  why: string;
}

/** The table read: the rubric's scores, the overall, and notes scene by scene. */
export interface TableRead {
  scores: Partial<Record<RubricKey, number>>;
  overall: number;
  scenes: SceneRead[];
  voice: VoiceSlip[];
  /** A sentence or two, for the log. */
  verdict: string;
}

const score = (value: unknown): number | null => {
  const n = Number(value);
  return value === null || value === undefined || !Number.isFinite(n)
    ? null
    : Math.round(Math.max(0, Math.min(10, n)) * 10) / 10;
};
const said = (value: unknown, most: number) =>
  typeof value === 'string' ? value.trim().slice(0, most) : '';

/** A table read made sound for a script of `count` scenes; every scene read, its score the overall where none was given. */
export function tableReadOf(raw: unknown, count: number): TableRead {
  const read =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const given =
    read.scores && typeof read.scores === 'object'
      ? (read.scores as Record<string, unknown>)
      : {};
  const scores: Partial<Record<RubricKey, number>> = {};
  for (const key of RUBRIC_KEYS) {
    const n = score(given[key]);
    if (n !== null) scores[key] = n;
  }
  const items = Object.values(scores);
  const mean = items.length
    ? Math.round((items.reduce((a, b) => a + b, 0) / items.length) * 10) / 10
    : 0;
  const overall = score(read.overall) ?? mean;
  const byScene = new Map<number, SceneRead>();
  for (const one of Array.isArray(read.scenes) ? read.scenes : []) {
    if (!one || typeof one !== 'object') continue;
    const s = one as Record<string, unknown>;
    const k = Math.round(Number(s.scene)) - 1;
    if (!Number.isFinite(k) || k < 0 || k >= count || byScene.has(k)) continue;
    byScene.set(k, {
      scene: k,
      score: score(s.score) ?? overall,
      given: score(s.score) !== null,
      notes: (Array.isArray(s.notes) ? s.notes : [])
        .map((n) => said(n, 400))
        .filter(Boolean)
        .slice(0, 6),
    });
  }
  const scenes = Array.from(
    { length: count },
    (_, k) =>
      byScene.get(k) ?? { scene: k, score: overall, given: false, notes: [] },
  );
  const voice = (Array.isArray(read.voice) ? read.voice : [])
    .flatMap((one: unknown): VoiceSlip[] => {
      if (!one || typeof one !== 'object') return [];
      const v = one as Record<string, unknown>;
      const k = Math.round(Number(v.scene)) - 1;
      const line = said(v.line, 200);
      if (!line || !Number.isFinite(k) || k < 0 || k >= count) return [];
      return [{ scene: k, who: said(v.who, 40), line, why: said(v.why, 200) }];
    })
    .slice(0, 12);
  return { scores, overall, scenes, voice, verdict: said(read.verdict, 600) };
}

/** Why a read is below the bar, in words; empty when it clears it. */
export function belowBar(read: TableRead): string[] {
  const out: string[] = [];
  if (read.overall < BAR.overall) out.push(`overall ${read.overall}`);
  for (const r of RUBRIC) {
    const n = read.scores[r.key];
    if (n !== undefined && n < BAR.item) out.push(`${r.key} ${n}`);
  }
  return out;
}

/**
 * The scenes to write again, from 0 and in order: those scoring below
 * the bar, the lowest first; the first when the hook fails and the last
 * when the button does; else the lowest with notes. At most half of them
 * (at least one), so a round stays cheap and the script stays itself.
 */
export function scenesToRewrite(read: TableRead): number[] {
  const count = read.scenes.length;
  if (!count) return [];
  const most = Math.max(1, Math.ceil(count / 2));
  const low = [...read.scenes]
    .filter((s) => s.given && s.score < BAR.scene)
    .sort((a, b) => a.score - b.score)
    .map((s) => s.scene);
  const failing = (key: RubricKey) => (read.scores[key] ?? 10) < BAR.item;
  const chosen = new Set<number>();
  if (failing('hook')) chosen.add(0);
  if (failing('button')) chosen.add(count - 1);
  for (const k of low) if (chosen.size < most) chosen.add(k);
  if (!chosen.size) {
    const noted = [...read.scenes]
      .filter(
        (s) => s.notes.length || read.voice.some((v) => v.scene === s.scene),
      )
      .sort((a, b) => a.score - b.score);
    if (noted.length) chosen.add(noted[0].scene);
  }
  return [...chosen].slice(0, most).sort((a, b) => a - b);
}

/** A read in one line, for the log: "7.8 (want 8, … ; lowest dialogue 5)". */
export function describeRead(read: TableRead): string {
  const items = RUBRIC_KEYS.flatMap((key) =>
    read.scores[key] === undefined ? [] : [`${key} ${read.scores[key]}`],
  );
  const scenes = read.scenes.map((s) => s.score).join('/');
  return `${read.overall} (${items.join(', ')}; scenes ${scenes})`;
}

// ── The script in words ───────────────────────────────────────────────────

const nameIn =
  (bible: Pick<StudioBible, 'characters'>) => (id: string | null) =>
    (id && bible.characters.find((c) => c.id === id)?.name) || id || 'someone';

/** One beat as a screenplay has it. */
function beatWords(
  beat: SheetBeat,
  name: (id: string | null) => string,
): string {
  switch (beat.kind) {
    case 'line': {
      const how = [
        beat.to ? `to ${name(beat.to)}` : '',
        beat.feeling && beat.feeling !== 'neutral' ? beat.feeling : '',
        beat.pace && beat.pace !== 'calm' ? beat.pace : '',
        beat.from && beat.from !== 'here' ? beat.from : '',
      ].filter(Boolean);
      return `${name(beat.who).toUpperCase()}${how.length ? ` (${how.join('; ')})` : ''}: ${beat.say}`;
    }
    case 'narration':
      return `NARRATOR: ${beat.say}`;
    case 'reaction':
      return `[${name(beat.who)} reacts: ${[beat.feeling, beat.sign].filter(Boolean).join(', ') || 'a look'}]`;
    case 'pause':
      return `[a pause${beat.seconds ? `, ${beat.seconds}s` : ''}]`;
    default:
      return `[${beat.say || `${name(beat.who)} ${beat.doSaid ?? beat.do ?? ''} ${beat.thing ?? beat.prop ?? ''}`.trim()}]`;
  }
}

/** The spoken words of a scene: the characters' and the narrator's. */
export function spokenOf(sheet: StorySheet): {
  lines: number;
  narration: number;
} {
  const count = (s: string) => s.split(/\s+/).filter(Boolean).length;
  let lines = 0;
  let narration = 0;
  for (const b of sheet.beats)
    if (b.kind === 'line') lines += count(b.say);
    else if (b.kind === 'narration') narration += count(b.say);
  return { lines, narration };
}

/**
 * The whole script as a screenplay, for the table read: each scene with
 * its place, who is there, what it was planned to do, and every beat
 * numbered from 1; and what code measured of it.
 */
export function scriptInWords(
  sheets: readonly StorySheet[],
  bible: StudioBible,
  outline: StudioOutline,
): string {
  const name = nameIn(bible);
  return sheets
    .map((sheet, k) => {
      const plan = planned(outline, k);
      const place =
        bible.sets.find((s) => s.id === sheet.set)?.name ?? sheet.set;
      const spoken = spokenOf(sheet);
      const all = spoken.lines + spoken.narration;
      const share = all ? Math.round((spoken.narration / all) * 100) : 0;
      return [
        `SCENE ${k + 1}: "${sheet.title}", in ${place}, ${sheet.time}; ${sheet.onStage.map((p) => name(p.who)).join(', ') || 'no one'} there as it opens; about ${outline.scenes[k]?.seconds ?? '?'} seconds; ${all} spoken words, the narrator ${share}% of them.`,
        plan
          ? `  (Planned: ${[plan.purpose, plan.turn ? `turn: ${plan.turn}` : '', plan.moment ? `moment: ${plan.moment}` : ''].filter(Boolean).join('; ')})`
          : '',
        ...sheet.beats.map((b, j) => `  ${j + 1}. ${beatWords(b, name)}`),
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n\n');
}

/** A scene's plan, from the story its outline was built from: by title, else by place. */
function planned(outline: StudioOutline, k: number) {
  const scene = outline.scenes[k];
  const plan = outline.story?.plan.scenes;
  if (!scene || !plan) return null;
  return (
    plan.find((one) => one.title === scene.title) ??
    (plan.length === outline.scenes.length ? plan[k] : null)
  );
}

// ── Code's checks across the script ───────────────────────────────────────

/** A note from code for one scene. */
export interface ScriptNote {
  /** Which scene, from 0. */
  scene: number;
  kind: 'voice' | 'plant' | 'turn';
  message: string;
}

/** Lines anyone says in any story: said instead of something only this speaker would say. */
const STOCK = new Set(
  [
    'okay',
    'ok',
    'yes',
    'no',
    'what',
    'oh',
    'oh no',
    'wow',
    'whoa',
    'hey',
    'hi',
    'hello',
    'look',
    'come on',
    'lets go',
    'let us go',
    'hurry',
    'hurry up',
    'really',
    'great',
    'cool',
    'yay',
    'hooray',
    'thank you',
    'thanks',
    'sorry',
    'im sorry',
    'me too',
    'good idea',
    'good job',
    'well done',
    'we did it',
    'you did it',
    'i dont know',
    'what happened',
    'are you okay',
    'are you ok',
    'dont worry',
    'lets do it',
    'lets do this',
    'you are right',
    'youre right',
    'thats right',
    'here you go',
    'what do we do now',
    'i have an idea',
    'what was that',
    'what is that',
    'whats that',
    'i did it',
    'thank you so much',
    'no way',
    'oh my',
    'uh oh',
    'see you',
    'goodbye',
    'bye',
  ].map((s) => s.replace(/[^a-z ]/gu, '')),
);

/** A line as compared with the stock lines: lower case, letters and spaces. */
const plain = (line: string) =>
  line
    .toLowerCase()
    .replace(/[’']/gu, '')
    .replace(/[^a-z\s]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();

/** Whether a line is one anyone says: all of it, or every sentence of it, stock. */
export function isStockLine(line: string): boolean {
  const parts = line
    .split(/[.!?…]+/u)
    .map(plain)
    .filter(Boolean);
  return parts.length > 0 && parts.every((p) => STOCK.has(p));
}

/** How a character speaks, as code can hear it. */
export interface VoiceProfile {
  id: string;
  name: string;
  /** Their pet phrases, from the quotes in their voice note. */
  phrases: string[];
  /** Words of theirs: from their pet phrases and traits, stemmed. */
  stems: string[];
  /** Talks in short sentences. */
  short: boolean;
}

/** The quoted phrases of a voice note: "says 'What do we know?'". */
function quotedIn(voice: string): string[] {
  const out: string[] = [];
  const re =
    /["“]([^"”]{2,60})["”]|(?:^|[\s(])['‘]([^'’]{2,60})['’](?=[\s,.;:!?)]|$)/gu;
  for (const m of voice.matchAll(re)) {
    const phrase = (m[1] ?? m[2] ?? '').trim();
    if (phrase) out.push(phrase);
  }
  return out;
}

/** A character's voice as code can hear it; null for one with no sheet. */
export function voiceProfile(
  c: Pick<StudioCharacter, 'id' | 'name'> & { persona?: Persona },
  names: ReadonlySet<string> = new Set(),
): VoiceProfile | null {
  const p = c.persona;
  if (!p || !p.voice) return null;
  const phrases = quotedIn(p.voice);
  return {
    id: c.id,
    name: c.name,
    phrases,
    stems: stemsOf([...phrases, ...p.personality].join(' '), names),
    short:
      /\bshort\b|\bclipped\b|\bterse\b|\bfew words\b|\bone-word\b|\bchirpy\b/iu.test(
        p.voice,
      ),
  };
}

/** Whether a line has one of a profile's pet phrases in it. */
const hasPhrase = (profile: VoiceProfile, line: string) => {
  const said = ` ${plain(line)} `;
  return profile.phrases.some((phrase) => {
    const words = plain(phrase);
    return words.length > 1 && said.includes(` ${words} `);
  });
};

/**
 * The voice lint (§1.5): lines any character could have said. A pet
 * phrase in the wrong mouth; two or more stock lines making up a
 * quarter of a scene's; a long line from someone who talks in short
 * ones; and someone with several lines, none of which sounds like
 * their sheet (none of their phrases, nothing of their words).
 */
export function lintVoices(
  sheets: readonly StorySheet[],
  bible: Pick<StudioBible, 'characters'>,
): ScriptNote[] {
  const names = new Set(
    bible.characters.flatMap((c) => [c.id, ...stemsOf(c.name)]),
  );
  const profiles = new Map(
    bible.characters.flatMap((c) => {
      const profile = voiceProfile(c, names);
      return profile ? [[c.id, profile] as const] : [];
    }),
  );
  const out: ScriptNote[] = [];
  /** Each pet phrase once its owner has said it: another saying it after is a callback, never a slip. */
  const owned = new Set<string>();
  /** Per speaker: how many lines, how many their own, and where most were said. */
  const heard = new Map<
    string,
    { lines: number; own: number; at: Map<number, number> }
  >();
  sheets.forEach((sheet, k) => {
    const lines = sheet.beats.filter(
      (b) => b.kind === 'line' && b.who && b.from !== 'letter',
    );
    const stock = lines.filter((b) => isStockLine(b.say));
    if (stock.length >= 2 && stock.length / Math.max(1, lines.length) >= 0.25)
      out.push({
        scene: k,
        kind: 'voice',
        message: `Lines any character could say: ${stock
          .slice(0, 4)
          .map((b) => `"${b.say}"`)
          .join(
            ', ',
          )}. Give each one something only its speaker would say, in their way (or let a look or an action carry it).`,
      });
    let long = 0;
    for (const b of lines) {
      const profile = profiles.get(b.who!);
      if (!profile) continue;
      const own =
        hasPhrase(profile, b.say) ||
        covered(stemsOf(b.say, names), profile.stems) > 0;
      const tally = heard.get(profile.id) ?? {
        lines: 0,
        own: 0,
        at: new Map(),
      };
      tally.lines += 1;
      if (own) tally.own += 1;
      tally.at.set(k, (tally.at.get(k) ?? 0) + 1);
      heard.set(profile.id, tally);
      for (const phrase of profile.phrases)
        if (hasPhrase({ ...profile, phrases: [phrase] }, b.say))
          owned.add(phrase);
      // The last scene may hand a phrase on: the lesson learnt, said back.
      if (!own && k < sheets.length - 1)
        for (const other of profiles.values())
          if (
            other.id !== profile.id &&
            other.phrases.some(
              (phrase) =>
                !owned.has(phrase) &&
                hasPhrase({ ...other, phrases: [phrase] }, b.say),
            )
          ) {
            out.push({
              scene: k,
              kind: 'voice',
              message: `"${b.say}" is ${profile.name}'s line, but it is ${other.name}'s pet phrase: give ${profile.name} words of their own, or give the line to ${other.name}.`,
            });
            break;
          }
      const count = b.say.split(/\s+/).filter(Boolean).length;
      if (profile.short && count > 12 && long < 2) {
        long += 1;
        out.push({
          scene: k,
          kind: 'voice',
          message: `"${b.say}" is ${count} words, and ${profile.name} talks in short sentences: cut it down, or break it with a reaction.`,
        });
      }
    }
  });
  for (const [id, tally] of heard) {
    const profile = profiles.get(id)!;
    if (tally.lines < 4 || tally.own > 0) continue;
    if (!profile.phrases.length && profile.stems.length < 3) continue;
    const at = [...tally.at.entries()].sort((a, b) => b[1] - a[1])[0][0];
    out.push({
      scene: at,
      kind: 'voice',
      message: `None of ${profile.name}'s ${tally.lines} lines sounds like them: use their way of speaking${
        profile.phrases.length
          ? ` (${profile.phrases
              .slice(0, 3)
              .map((p) => `"${p}"`)
              .join(', ')})`
          : ''
      } somewhere in this scene.`,
    });
  }
  return out;
}

/** Everything a scene's words name: its lines, its narration, what its moves say, and its things. */
function sceneStems(sheet: StorySheet, names: ReadonlySet<string>): string[] {
  return stemsOf(
    [
      ...sheet.beats.flatMap((b) => [
        b.say,
        b.prop ?? '',
        b.thing ?? '',
        b.target ?? '',
        b.via ?? '',
        b.doSaid ?? '',
      ]),
      ...sheet.props.map((p) => p.prop),
      ...sheet.onStage.map((p) => p.holding ?? ''),
    ].join(' '),
    names,
  );
}

/** Which scene serves each beat, from 0: the first whose plan names it; -1 for none. */
function sceneOfBeats(story: StudioStory, outline: StudioOutline): number[] {
  const out = story.beats.beats.map(() => -1);
  story.plan.scenes.forEach((scene, j) => {
    const k =
      outline.scenes.findIndex((s) => s.title === scene.title) >= 0
        ? outline.scenes.findIndex((s) => s.title === scene.title)
        : story.plan.scenes.length === outline.scenes.length
          ? j
          : -1;
    if (k < 0) return;
    for (const b of scene.beats) if (b < out.length && out[b] < 0) out[b] = k;
  });
  return out;
}

/**
 * Plants in the words (§1.3): what a beat plants is in the words of the
 * scene that serves it (or one before), and what a beat pays off is in
 * the words of its scene. A habit or a running gag runs by itself.
 */
export function checkPlantsShown(
  story: StudioStory,
  sheets: readonly StorySheet[],
  outline: StudioOutline,
  bible: StudioBible,
): ScriptNote[] {
  const context = contextOf(bible, story.premise);
  const names = new Set((context.names ?? []).flatMap((n) => stemsOf(n)));
  const words = sheets.map((sheet) => sceneStems(sheet, names));
  const serves = sceneOfBeats(story, outline);
  const out: ScriptNote[] = [];
  /** Whether a scene's words have a plant: by its short id, or by half its words. */
  const has = (k: number, plant: { stems: string[]; idStems: string[] }) =>
    k >= 0 &&
    k < words.length &&
    (covered(plant.idStems, words[k]) >= 0.5 ||
      covered(plant.stems, words[k]) >= 0.5);
  for (const tracked of trackSetups(story.beats, context).plants) {
    if (tracked.running || !tracked.stems.length) continue;
    const k = serves[tracked.at];
    if (k < 0 || k >= sheets.length) continue;
    const planted = Array.from({ length: k + 1 }, (_, j) => j).some((j) =>
      has(j, tracked),
    );
    if (!planted)
      out.push({
        scene: k,
        kind: 'plant',
        message: `This scene plants "${tracked.plant.what}" for later, but its words never show it: let us see or hear it here (a thing handled, a line, a look at it).`,
      });
    // Paid off where the beats say (else where a later beat carries it
    // out): in the words of one of the scenes that play those beats.
    const paying = [
      ...new Set(
        (tracked.paid.length ? tracked.paid : tracked.shown)
          .map((at) => serves[at])
          .filter((j) => j > k && j < sheets.length),
      ),
    ];
    if (paying.length && !paying.some((j) => has(j, tracked)))
      out.push({
        scene: paying[paying.length - 1],
        kind: 'plant',
        message: `This scene pays off "${tracked.plant.what}", planted in scene ${k + 1}, but its words never bring it back: let it come back here, and matter.`,
      });
  }
  return out;
}

/**
 * Each scene's turn (§1.4) as written: its planned turn should show in
 * what is said and done. Code hears it by its words; a turn none of
 * whose words are in the scene is a note.
 */
export function checkTurnsShown(
  story: StudioStory,
  sheets: readonly StorySheet[],
  outline: StudioOutline,
  bible: StudioBible,
): ScriptNote[] {
  const names = new Set(
    bible.characters.flatMap((c) => [c.id, ...stemsOf(c.name)]),
  );
  const out: ScriptNote[] = [];
  sheets.forEach((sheet, k) => {
    const plan = planned(outline, k);
    if (!plan?.turn) return;
    const turn = stemsOf(plan.turn, names);
    if (turn.length < 3) return;
    const said = sceneStems(sheet, names);
    if (covered(turn, said) < 0.2)
      out.push({
        scene: k,
        kind: 'turn',
        message: `The scene's turn, as planned, does not show in what is said or done: by its end, ${plan.turn.replace(/[.!]+$/u, '')}.`,
      });
  });
  return out;
}

/** Everything code sees across a story's script, scene by scene. */
export function checkScript(
  story: StudioStory | null | undefined,
  sheets: readonly StorySheet[],
  outline: StudioOutline,
  bible: StudioBible,
): ScriptNote[] {
  return [
    ...lintVoices(sheets, bible),
    ...(story
      ? [
          ...checkPlantsShown(story, sheets, outline, bible),
          ...checkTurnsShown(story, sheets, outline, bible),
        ]
      : []),
  ];
}

/** Code's notes in words, for the table read: scene by scene. */
export function describeNotes(notes: readonly ScriptNote[]): string {
  return notes.length
    ? notes
        .map((n) => `- Scene ${n.scene + 1} (${n.kind}): ${n.message}`)
        .join('\n')
    : 'Nothing.';
}

/**
 * The notes for one scene's writer, from the read and from code: the
 * critic's notes, the lines it heard as anyone's, and what code found.
 */
export function notesFor(
  k: number,
  read: TableRead,
  code: readonly ScriptNote[],
  bible: Pick<StudioBible, 'characters'>,
): string[] {
  const voiceOf = (who: string) => {
    const c = bible.characters.find(
      (x) =>
        x.id === who.toLowerCase() ||
        x.name.toLowerCase() === who.toLowerCase(),
    );
    return c?.persona?.voice
      ? ` (${c.name} ${c.persona.voice.replace(/[.!]+$/u, '')})`
      : '';
  };
  const count = read.scenes.length;
  return [
    ...(read.scenes[k]?.notes ?? []),
    ...read.voice
      .filter((v) => v.scene === k)
      .map(
        (v) =>
          `"${v.line}" could be anyone's line${v.why ? ` (${v.why})` : ''}: say it as ${v.who || 'its speaker'} would${voiceOf(v.who)}.`,
      ),
    ...code.filter((n) => n.scene === k).map((n) => n.message),
    ...(k === 0 && (read.scores.hook ?? 10) < BAR.item
      ? [
          'Open with a hook: a joke, a mystery or a problem in the first seconds.',
        ]
      : []),
    ...(k === count - 1 && (read.scores.button ?? 10) < BAR.item
      ? ['End on a button: a last laugh or a warm beat, never a summary.']
      : []),
  ].slice(0, 10);
}
