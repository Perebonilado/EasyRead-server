/**
 * Every theme checked by code (studio-explainer-plan, Ask 2 §5): its
 * words readable on its ground (WCAG 2.x contrast), its accent and chart
 * colours seen against it (SC 1.4.11, 3:1 for what means something), and
 * its chart colours told apart by colour-blind viewers: each pair still
 * at least CHART_APART (CIEDE2000) after simulating protanopia,
 * deuteranopia and tritanopia (Machado, Oliveira and Fernandes 2009, at
 * full severity). Run in the tests for every theme, and at start-up in
 * development.
 */
import {
  THEME_IDS,
  THEMES,
  contrast,
  deltaE2000,
  hexRgb,
  labOf,
  linearRgb,
  srgbOf,
  type ExplainerTheme,
  type Rgb,
} from './scene-themes';

export type Deficiency = 'protanopia' | 'deuteranopia' | 'tritanopia';

/** Machado 2009, severity 1.0, on linear RGB. */
const MACHADO: Record<Deficiency, number[][]> = {
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};

/** A colour as a viewer with the deficiency sees it. */
export function seenWith(hex: string, deficiency: Deficiency): Rgb {
  const lin = linearRgb(hexRgb(hex) ?? [0, 0, 0]);
  const m = MACHADO[deficiency];
  return srgbOf(
    m.map((row) => row[0] * lin[0] + row[1] * lin[1] + row[2] * lin[2]) as Rgb,
  );
}

/** The least the rules allow. */
export const RULES = {
  /** Ink on paper: AAA for body text. */
  ink: 7,
  /** Muted words on paper, and a card's words on the card: AA. */
  text: 4.5,
  /** The accent and every chart colour against the paper: what means something is seen (SC 1.4.11). */
  graphic: 3,
} as const;
/** How far apart two chart colours stay for a colour-blind viewer (CIEDE2000). */
export const CHART_APART = 12;

const DEFICIENCIES: Deficiency[] = ['protanopia', 'deuteranopia', 'tritanopia'];

/** What is wrong with a theme, one line each; none when it passes. */
export function themeProblems(theme: ExplainerTheme): string[] {
  const out: string[] = [];
  const need = (what: string, a: string, b: string, least: number) => {
    const c = contrast(a, b);
    if (c < least)
      out.push(`${theme.id}: ${what} ${c.toFixed(2)}:1 (under ${least}:1)`);
  };
  need('ink on paper', theme.ink, theme.paper, RULES.ink);
  need('muted on paper', theme.muted, theme.paper, RULES.text);
  need('card ink on card', theme.cardInk, theme.card, RULES.text);
  need('accent on paper', theme.accent, theme.paper, RULES.graphic);
  need('line on paper', theme.line, theme.paper, RULES.graphic);
  need('good on paper', theme.good, theme.paper, RULES.graphic);
  need('bad on paper', theme.bad, theme.paper, RULES.graphic);
  theme.chart.forEach((c, i) =>
    need(`chart ${i + 1} on paper`, c, theme.paper, RULES.graphic),
  );
  for (const deficiency of DEFICIENCIES) {
    const labs = theme.chart.map((c) => labOf(seenWith(c, deficiency)));
    for (let i = 0; i < labs.length; i += 1)
      for (let j = i + 1; j < labs.length; j += 1) {
        const d = deltaE2000(labs[i], labs[j]);
        if (d < CHART_APART)
          out.push(
            `${theme.id}: chart ${i + 1} and ${j + 1} ${d.toFixed(1)} apart with ${deficiency} (under ${CHART_APART})`,
          );
      }
  }
  if (THEMES[theme.twin].twin !== theme.id)
    out.push(`${theme.id}: its twin ${theme.twin} is not its twin's`);
  if (THEMES[theme.twin].dark === theme.dark)
    out.push(`${theme.id}: its twin ${theme.twin} is not of the other kind`);
  if (Boolean(theme.rim) !== theme.dark)
    out.push(`${theme.id}: a rim belongs to a dark theme, and only there`);
  return out;
}

/** Every theme's problems. */
export function allThemeProblems(): string[] {
  return THEME_IDS.flatMap((id) => themeProblems(THEMES[id]));
}
