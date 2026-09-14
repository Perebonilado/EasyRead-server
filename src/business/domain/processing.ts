import type { ProcessingChannel, ProcessingChannels } from '../../contracts';
import type { LlmTask } from '../ports/llm.port';

/**
 * Where a school's processing runs: OpenAI, or our own open models on
 * Modal, chosen separately for text and for audio. Read per job, so a
 * switch on the admin page reaches the next page, not the next deploy.
 */
export const PROCESSING_CHANNELS: readonly ProcessingChannel[] = [
  'openai',
  'modal',
];

/** What a fresh deployment does: text at OpenAI, the catalogue voice on the rented GPU, as before. */
export const DEFAULT_CHANNELS: ProcessingChannels = {
  text: 'openai',
  audio: 'modal',
};

export function isChannel(value: unknown): value is ProcessingChannel {
  return (
    typeof value === 'string' &&
    (PROCESSING_CHANNELS as readonly string[]).includes(value)
  );
}

/**
 * The tasks that follow the text channel: what preparing a school's
 * documents runs. Reading a page (Mistral), embeddings (OpenAI) and every
 * learner-facing task keep the models named for them.
 */
const TEXT_CHANNEL_TASKS: ReadonlySet<LlmTask> = new Set<LlmTask>([
  'summarize',
  'topics_outline',
  'topics_page_tag',
  'topics_prereqs',
  'simplify_standard',
  'simplify_easiest',
  'lecture_outline',
  'lecture_segment',
  'lecture_verify',
  'lecture_board',
  'lecture_diagram',
  'lecture_sketch',
  'sketch_judge',
]);

export function followsTextChannel(task: LlmTask): boolean {
  return TEXT_CHANNEL_TASKS.has(task);
}

/**
 * The channels one job runs on. A learner's own document never leaves
 * OpenAI; a school's takes the run's own choice where it named one, and
 * the admin's setting otherwise.
 */
export function channelsForJob(input: {
  school: boolean;
  override?: Partial<ProcessingChannels> | null;
  setting: ProcessingChannels;
}): ProcessingChannels {
  if (!input.school) return { text: 'openai', audio: 'openai' };
  return {
    text: input.override?.text ?? input.setting.text,
    audio: input.override?.audio ?? input.setting.audio,
  };
}

/** Both channels named, the run's own choice over the setting. */
export function resolveChannels(
  setting: ProcessingChannels,
  override?: Partial<ProcessingChannels> | null,
): ProcessingChannels {
  return {
    text: override?.text ?? setting.text,
    audio: override?.audio ?? setting.audio,
  };
}
