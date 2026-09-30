/**
 * A story clip's sheet written (studio-clip, Ask 5), as a story's scene is
 * (writeStorySheet) with the clip profile: no story developed and no
 * table read, no thinking, the clip's own rules and where it sits in the
 * lesson in place of a story's plan; then held to the profile by code
 * (mendClip), never sent back for it. About half a cent a clip.
 */
import type { LlmGatewayPort, LlmUsage } from '../../ports/llm.port';
import type {
  StorySheet,
  StudioBible,
  StudioBrief,
  StudioOutline,
} from '../../domain/studio/studio';
import {
  checkSheet,
  errorsIn,
  mendSheet,
  repairSheet,
  withFound,
} from '../../domain/studio/studio-check';
import {
  CLIP_RULES,
  CLIP_SECONDS,
  clipBrief,
  clipContext,
  mendClip,
} from '../../domain/studio/studio-clip';
import { narratorRuleOf } from '../../domain/studio/studio-narrator';
import { describeOutlineScene } from '../../domain/studio/studio-words';
import { writeStorySheet, type WrittenSheet } from './studio-scenes';

export async function writeClipSheet(
  llm: Pick<LlmGatewayPort, 'studioScene'>,
  input: {
    /** The explainer's brief: the clip is written as a story with a light narrator. */
    brief: StudioBrief;
    bible: StudioBible;
    outline: StudioOutline;
    k: number;
    old?: StorySheet | null;
    request?: string;
    record?: (usage: LlmUsage) => Promise<void> | void;
    log?: (line: string) => void;
  },
): Promise<WrittenSheet> {
  const { bible, outline, k } = input;
  const scene = outline.scenes[k];
  const brief = clipBrief(input.brief);
  const planned = scene?.seconds ?? CLIP_SECONDS[1];
  const written = await writeStorySheet(llm, {
    brief,
    bible,
    outline,
    k,
    before: null,
    planned,
    old: input.old ?? null,
    ...(input.request ? { request: input.request } : {}),
    ...(input.record ? { record: input.record } : {}),
    ...(input.log ? { log: input.log } : {}),
    clip: {
      scene: [
        scene
          ? describeOutlineScene(scene, k, true)
          : `Scene ${k + 1}: the clip the maker asked for.`,
        CLIP_RULES,
      ].join('\n'),
      outline: clipContext(outline, k),
    },
  });
  const narrator = narratorRuleOf(brief, bible);
  const mended = mendClip(written.sheet, scene?.teach ?? scene?.summary ?? '');
  const judge = (sheet: StorySheet) =>
    checkSheet(
      sheet,
      withFound(bible, sheet.set, mendSheet(sheet, bible, null)),
      planned,
      null,
      narrator,
      brief.audience,
    );
  let sheet = mended.sheet;
  let problems = judge(sheet);
  // What taking beats out left unplayable is put right, as a story's is.
  if (errorsIn(problems).length) {
    sheet = repairSheet(sheet, bible, null, narrator);
    problems = judge(sheet);
  }
  if (mended.fixed.length) input.log?.(`clip: ${mended.fixed.join('; ')}`);
  return {
    ...written,
    sheet,
    problems,
    mended: [...mended.fixed, ...written.mended],
  };
}
