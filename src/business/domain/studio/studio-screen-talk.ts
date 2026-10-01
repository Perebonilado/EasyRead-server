/**
 * An explainer's voice talking about the screen instead of teaching
 * (Richard, 2026-10-01): "on the left is a sad face, on the right a happy
 * one" tells the learner what they can already see, and is wrong where
 * the film is vertical, as a left-and-right pair stands top and bottom
 * there on the same voice. The voice says what a thing means; the layout
 * engine decides where it stands, and the picture shows it.
 */

/** Where something is on the screen: never the voice's to say. */
const WHERE: readonly RegExp[] = [
  // "on the right track", "the right way", "to the left of centre" in a road's sense are left alone.
  /\b(?:on|to|at|in) the (?:far |upper |lower |top |bottom )?(?:left|right)\b(?!\s+(?:track|path|way|answer|thing|time|foot|lane|of the road|side of (?:the law|history)))/i,
  /\b(?:left|right)[- ]hand side\b/i,
  /\b(?:at|on|in) the (?:top|bottom)(?: half| corner| of the (?:screen|picture|page))?\b(?!\s+of (?:the|a|their|his|her|its) (?:class|food chain|league|list|hill|stairs|sea|ocean|pyramid))/i,
  /\b(?:upper|lower|top|bottom) (?:left|right)(?: corner)?\b/i,
  /\bin the (?:middle|centre|center) of the (?:screen|picture|stage|page)\b/i,
];

/** Telling the learner what they are looking at. */
const LOOKING: readonly RegExp[] = [
  /\b(?:as )?you can (?:now )?see\b/i,
  /\bhere (?:we|you) (?:can )?(?:see|have)\b/i,
  /\b(?:on|in) (?:the|this|our) (?:screen|picture|image|diagram|drawing|slide|graphic|infographic)\b/i,
  /\blook at (?:the|this) (?:picture|drawing|diagram|screen|image|chart)\b/i,
  /\bthis (?:picture|drawing|diagram|image|chart|graphic) shows\b/i,
];

/** The words in one spoken line that talk about the screen, or null when it teaches. */
export function screenTalk(say: string): string | null {
  for (const pattern of [...WHERE, ...LOOKING]) {
    const found = pattern.exec(say);
    if (found) return found[0];
  }
  return null;
}

/** Each line of a scene that talks about the screen, by its place in the scene and the words that do. */
export function screenTalkIn(
  beats: readonly { say: string }[],
): { beat: number; words: string }[] {
  return beats.flatMap((beat, i) => {
    const words = screenTalk(beat.say);
    return words ? [{ beat: i, words }] : [];
  });
}
