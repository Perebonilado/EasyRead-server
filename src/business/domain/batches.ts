import type { BatchDto, BatchState, MaterialDto } from '../../contracts';

/** A week: a batch fully voiced and published stays on the page this long. */
const SHOWN_FOR_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * The admin's drops, each seen as one row: the files that arrived together,
 * their tallies added up, and one state for the whole. The numbers are the
 * cards' own, so the row and its cards never disagree.
 */
export function batchesOf(materials: MaterialDto[]): BatchDto[] {
  const groups = new Map<string, MaterialDto[]>();
  for (const material of materials) {
    if (!material.batchId) continue;
    const list = groups.get(material.batchId) ?? [];
    list.push(material);
    groups.set(material.batchId, list);
  }
  const batches = Array.from(groups.entries()).map(([id, files]) =>
    batchOf(id, files),
  );
  return batches.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Whether a batch still earns its row: not finished, or finished this week. */
export function batchShown(batch: BatchDto, now: Date): boolean {
  const finished = batch.state === 'voiced' && batch.published === batch.files;
  if (!finished) return true;
  return now.getTime() - new Date(batch.createdAt).getTime() < SHOWN_FOR_MS;
}

function batchOf(id: string, files: MaterialDto[]): BatchDto {
  const text = { done: 0, total: files.length };
  const scripts = { done: 0, total: 0 };
  const audio = { done: 0, total: 0 };
  let failed = 0;
  let untaught = 0;
  let costUsd = 0;
  let published = 0;
  let createdAt = '';
  for (const file of files) {
    if (file.document.status === 'ready') text.done += 1;
    for (const tally of Object.values(file.lecture)) {
      scripts.total += tally.total;
      scripts.done += tally.scripted;
      audio.total += tally.total;
      audio.done += tally.ready;
    }
    failed += file.progress.failed;
    untaught += file.progress.untaught;
    costUsd += file.costUsd;
    if (file.publishedAt) published += 1;
    const arrived = file.document.createdAt;
    if (!createdAt || arrived < createdAt) createdAt = arrived;
  }
  return {
    id,
    createdAt,
    files: files.length,
    published,
    text,
    scripts,
    audio,
    failed,
    untaught,
    costUsd: Math.round(costUsd * 100) / 100,
    state: batchState(files.map((file) => file.progress.state)),
    documentIds: files.map((file) => file.document.id),
  };
}

/**
 * One word for the drop. Anything still in its text pipeline holds the
 * batch at preparing; anything still writing holds it at writing; a
 * failure with nothing moving needs a person before the batch can be
 * voiced whole; audio being made is voicing; every file voiced is voiced;
 * otherwise the words are all there and the batch waits for Voice.
 */
export function batchState(
  states: MaterialDto['progress']['state'][],
): BatchState {
  if (states.some((s) => s === 'uploading' || s === 'preparing')) {
    return 'preparing';
  }
  if (states.some((s) => s === 'writing')) return 'writing';
  if (states.some((s) => s === 'attention' || s === 'failed'))
    return 'attention';
  if (states.some((s) => s === 'voicing')) return 'voicing';
  if (states.every((s) => s === 'ready')) return 'voiced';
  return 'written';
}
