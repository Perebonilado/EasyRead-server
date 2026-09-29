/**
 * The animation style presets and the pace (studio-story-plan §2, §2.1),
 * as data: what each does to the look (a tint over the set's palette,
 * the weight of its ink), to the camera (how soon it cuts in close again,
 * whether it pushes in on a feeling), to how much action a scene may
 * have, and to the music it leans toward. Each is a small nudge on the
 * hooks the film already has; S6 tunes the numbers by eye.
 */
import type { SceneMusic } from '../scene-script';
import type {
  StudioBrief,
  StudioGenre,
  StudioPace,
  StudioStyle,
} from './studio';

export interface StylePreset {
  /** For the writers: what the style is. */
  words: string;
  /** A colour the set's palette leans toward, and how far (0 to 1, a little). */
  tint: string;
  tintK: number;
  /** The set's ink, as a share of its usual weight. */
  ink: number;
  /** How long the camera waits before it goes in close again, as a share of its usual. */
  cut: number;
  /** How much it pushes in on a feeling: 0 never, 1 as usual. */
  push: number;
  /** The big action moves a scene may have (a leap, a sprint, a hard fall). */
  moves: number;
  /** The music it leans toward: a scene's music, where the style would not play it, played as this. */
  music: Partial<Record<SceneMusic, SceneMusic>>;
}

export const STYLE_PRESETS: Record<StudioStyle, StylePreset> = {
  'picture-book': {
    words:
      'picture book: soft colours, thicker ink, a gentle haze; slow pushes, few cuts, gentle moves',
    tint: '#f3e3c8',
    tintK: 0.06,
    ink: 1.25,
    cut: 1.4,
    push: 0.6,
    moves: 1,
    music: { tense: 'curious', motion: 'playful' },
  },
  'bold-cartoon': {
    words:
      'bold cartoon: saturated colours, crisp ink; snappy cuts, squash and stretch, more action',
    tint: '#ff6a3d',
    tintK: 0.03,
    ink: 0.9,
    cut: 0.7,
    push: 1,
    moves: 3,
    music: { calm: 'playful', curious: 'playful' },
  },
  sitcom: {
    words:
      'sitcom: flat colours, simple sets, deep staging; dialogue-led, over-the-shoulder and reverse shots, little camera movement',
    tint: '#9fb4c8',
    tintK: 0.02,
    ink: 1,
    cut: 1.2,
    push: 0.2,
    moves: 1,
    music: { calm: 'playful', solemn: 'curious' },
  },
  adventure: {
    words:
      'adventure: richer, wider scenery; tracking and low angles, action moves allowed more often',
    tint: '#e0a44a',
    tintK: 0.03,
    ink: 1,
    cut: 0.85,
    push: 1,
    moves: 3,
    music: { calm: 'curious', bright: 'motion' },
  },
  cosy: {
    words:
      'calm and cosy: warm light, dusk and dawn; long holds, slow pans, soft music',
    tint: '#f0b27a',
    tintK: 0.07,
    ink: 1.1,
    cut: 1.5,
    push: 0.6,
    moves: 1,
    music: { motion: 'calm', tense: 'curious', bright: 'calm' },
  },
};

/** What the pace does to the cuts and the action: a share of the style's. */
export const PACE_ENERGY: Record<StudioPace, { cut: number; moves: number }> = {
  gentle: { cut: 1.25, moves: -1 },
  lively: { cut: 1, moves: 0 },
  snappy: { cut: 0.8, moves: 1 },
};

/** What the film does for a brief: its camera's energy and the big moves a scene may have; null when the maker chose neither. */
export function energyOf(
  brief: Pick<StudioBrief, 'style' | 'pace'>,
): { cut: number; push: number; moves: number } | null {
  if (!brief.style && !brief.pace) return null;
  const style = brief.style ? STYLE_PRESETS[brief.style] : null;
  const pace = brief.pace ? PACE_ENERGY[brief.pace] : PACE_ENERGY.lively;
  return {
    cut: Math.round((style?.cut ?? 1) * pace.cut * 100) / 100,
    push: style?.push ?? 1,
    moves: Math.max(1, Math.min(4, (style?.moves ?? 2) + pace.moves)),
  };
}

/** How a set is drawn for a brief's style: its tint and its ink; null for the house look. */
export function setLookOf(
  brief: Pick<StudioBrief, 'style'>,
): { tint: string; tintK: number; ink: number } | null {
  if (!brief.style) return null;
  const { tint, tintK, ink } = STYLE_PRESETS[brief.style];
  return { tint, tintK, ink };
}

/** A scene's music as the style leans it. */
export function leanedMusic(
  music: SceneMusic,
  style: StudioStyle | null | undefined,
): SceneMusic {
  return (style && STYLE_PRESETS[style].music[music]) || music;
}

/** What each genre brings, for the writers. */
const GENRE_WORDS: Record<StudioGenre, string> = {
  comedy:
    'comedy: setups and punchlines, the rule of three, a running gag, comic timing',
  adventure: 'adventure: escalating set pieces, a chase, a daring choice',
  mystery: 'mystery: a clue plan, a red herring, a reveal',
  drama: 'drama: quiet scenes, long looks, a turn of heart',
  fable: 'fable: simple, clear, a lesson shown by what happens',
  'slice-of-life': 'slice of life: small everyday moments that matter',
  romance:
    'romance, age-appropriate: a meet-cute, a misunderstanding, an almost-moment; never sexual',
  'dark-comedy':
    'dark comedy: irony, absurd escalation, deadpan reactions; targets are situations and types, never real private people',
  spooky:
    'spooky: creaks and shadows, a jump-scare-lite with a laugh after; gentle for children',
};

/** The maker's controls in words, for the writers: genre, ending, pace, style, and the action a scene may have. */
export function controlWords(brief: StudioBrief): string[] {
  const out: string[] = [];
  if (brief.genre) out.push(`Genre: ${GENRE_WORDS[brief.genre]}.`);
  if (brief.ending) out.push(`Ending: ${brief.ending}.`);
  if (brief.pace)
    out.push(
      `Pace: ${brief.pace}${brief.pace === 'snappy' ? ' (short scenes, quick exchanges, jokes land fast)' : brief.pace === 'gentle' ? ' (room to breathe, fewer cuts, soft action)' : ''}.`,
    );
  if (brief.style)
    out.push(`Animation style: ${STYLE_PRESETS[brief.style].words}.`);
  const energy = energyOf(brief);
  if (energy)
    out.push(
      `Big action moves (a leap, a sprint, a hard fall, a pose): at most ${energy.moves} a scene unless the maker asks for more.`,
    );
  return out;
}

/**
 * What is safe for this audience and genre (§3C), for the writers: the
 * house rule holds throughout; this says what the genre may do here.
 */
export function safetyWords(
  brief: Pick<StudioBrief, 'audience' | 'genre'>,
): string {
  const young =
    brief.audience === 'young children' || brief.audience === 'children';
  if (brief.genre === 'romance')
    return young
      ? 'Romance here is a crush or a friendship, sweet and innocent.'
      : brief.audience === 'teens'
        ? 'Romance here is sweet: a crush, a held look, holding hands.'
        : 'Romance here may be grown-up, but never sexual.';
  if (brief.genre === 'dark-comedy')
    return brief.audience === 'teens'
      ? 'Dark comedy here is mild: irony and absurdity, no cruelty, nothing grim shown.'
      : 'Dark comedy for adults: no hate, no sexual content, nothing that encourages self-harm; slapstick consequences stay cartoonish.';
  if (brief.genre === 'spooky' && young)
    return 'Spooky here is gentle: a shiver, then a laugh; nothing truly frightening.';
  if (young) return 'Peril stays cartoon peril, gentle and quickly resolved.';
  return '';
}
