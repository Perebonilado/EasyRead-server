/**
 * The editor's working file as the app sees it (contracts: StudioEditorDto,
 * StudioEditorialDto, StudioPackageDto): the show's question, research,
 * plan and world; an episode's acts, two-column script, fact check and
 * package, its chapters worked out by code from the film's own clock.
 */
import type {
  StudioClaimDto,
  StudioEditorDto,
  StudioEditorialDto,
  StudioPackageDto,
  StudioPlayDto,
} from '../../../contracts';
import type { OutlineScene } from './studio';
import { ERA_WORDS, type StudioEditor } from './studio-editor';
import type { StudioEditorial } from './studio-editorial';
import { sceneOfRow } from './studio-editor-cut';
import { readMapBase } from '../scene-map';
import { mapCredits, withCredits } from '../shots/terrain-tiles';

/** The show's planning as the maker sees it; null for a show the editor has not begun (or never plans). */
export function editorDto(
  editor: StudioEditor | null | undefined,
): StudioEditorDto | null {
  if (!editor?.stage) return null;
  const research = editor.research;
  const plan = editor.plan;
  const world = editor.world;
  return {
    stage: editor.stage,
    question: editor.question,
    angles: editor.angles.map((a) => ({
      question: a.question,
      pitch: a.pitch,
      scores: { ...a.scores },
      total: a.total,
      verdict: a.verdict,
    })),
    takeaway: editor.takeaway,
    research: research
      ? {
          claims: research.claims.map((c): StudioClaimDto => ({
            id: c.id,
            text: c.text,
            kind: c.kind,
            confidence: c.confidence,
            sources: c.sources.map((s) => ({ ...s })),
            status: c.status,
            who: c.who,
          })),
          timeline: research.timeline.map((e) => ({
            date: e.date,
            event: e.event,
          })),
          myths: research.myths.map((m) => ({
            belief: m.belief,
            truth: m.truth,
          })),
          searched: research.searched,
        }
      : null,
    plan: plan
      ? {
          spine: [...plan.spine],
          episodes: plan.episodes.map((e) => ({
            number: e.number,
            title: e.title,
            question: e.question,
            endsOn: e.endsOn,
            minutes: e.minutes,
            episodeId: e.episodeId,
          })),
          leftOut: [...plan.leftOut],
        }
      : null,
    world: world
      ? {
          era: ERA_WORDS[world.era],
          palette: world.palette.map((p) => ({
            thing: p.thing,
            colour: p.token,
          })),
          held: world.held
            ? { colour: world.held.token, for: world.held.for }
            : null,
          places: world.places.map((p) => ({
            id: p.id,
            name: p.name,
            look: p.look,
          })),
          people: world.people.map((p) => ({
            id: p.id,
            name: p.name,
            role: p.role,
            likeness: p.likeness,
          })),
        }
      : null,
  };
}

/** A scene of the episode's film as the clock reads it: its place, and how long it runs once made. */
export interface FilmScene {
  id: string;
  position: number;
  durationMs: number | null;
  /** Made: its length is the film's own. */
  made: boolean;
}

/**
 * Where each scene starts on the film's clock: its made length, else its
 * planned seconds, so chapters stand before the film is made and land
 * exactly once it is.
 */
function startsOf(
  outline: readonly Pick<OutlineScene, 'seconds'>[],
  film: readonly FilmScene[],
): number[] {
  const starts: number[] = [];
  let at = 0;
  outline.forEach((scene, k) => {
    starts.push(at);
    const made = film.find((f) => f.position === k);
    at +=
      made?.made && made.durationMs ? made.durationMs : scene.seconds * 1000;
  });
  return starts;
}

/**
 * An editor's package as the app sees it: its chapters at the acts, its
 * thumbnail's frame, and its description with the credits the film owes
 * after it (the map's sources: terrain-tiles' mapCredits).
 */
export function packageDto(
  editorial: StudioEditorial,
  outline: readonly Pick<OutlineScene, 'seconds' | 'rows'>[],
  film: readonly FilmScene[],
  credits: readonly string[] = [],
): StudioPackageDto | null {
  const pack = editorial.package;
  if (!pack) return null;
  const starts = startsOf(outline, film);
  const acts = editorial.beats?.acts ?? [];
  const chapters = acts.flatMap((act, k) => {
    const row = editorial.rows.findIndex((r) => r.act === k + 1);
    const scene = row < 0 ? null : sceneOfRow(outline, row);
    return scene === null
      ? []
      : [{ atMs: Math.round(starts[scene] ?? 0), title: act.title }];
  });
  // The thumbnail's frame: the scene its row is in, and how far through it.
  const row = pack.thumbnail.row;
  const scene = row === null ? null : sceneOfRow(outline, row);
  const span = scene === null ? null : outline[scene].rows;
  const madeScene =
    scene === null ? null : film.find((f) => f.position === scene);
  const length =
    scene === null
      ? 0
      : madeScene?.made && madeScene.durationMs
        ? madeScene.durationMs
        : outline[scene].seconds * 1000;
  const through =
    span && row !== null && span[1] > span[0]
      ? (row - span[0]) / (span[1] - span[0] + 1)
      : 0.4;
  return {
    title: pack.title,
    titles: pack.titles.map((t) => t.text),
    description: withCredits(pack.description, credits),
    chapters,
    thumbnail: {
      words: pack.thumbnail.words,
      sceneId: madeScene?.id ?? null,
      atMs:
        scene === null
          ? null
          : Math.round((starts[scene] ?? 0) + length * through),
    },
    hashtags: [...pack.hashtags],
    pinned: pack.pinned,
  };
}

/** An episode as the editor wrote it, as the app sees it. */
export function editorialDto(
  editorial: StudioEditorial,
  outline: readonly Pick<OutlineScene, 'seconds' | 'rows'>[] = [],
  film: readonly FilmScene[] = [],
  credits: readonly string[] = [],
): StudioEditorialDto {
  const facts = editorial.facts;
  return {
    number: editorial.number,
    question: editorial.question,
    stage: editorial.stage,
    acts: (editorial.beats?.acts ?? []).map((a) => ({
      title: a.title,
      seconds: a.seconds,
    })),
    hook: editorial.hook,
    rows: editorial.rows.map((r) => ({
      say: r.say,
      visual: r.visual,
      show: r.show,
      claims: [...r.claims],
      act: r.act,
    })),
    facts: facts
      ? {
          checked: facts.length,
          softened: facts.filter((f) => f.verdict === 'soften').length,
          cut: facts.filter((f) => f.verdict === 'cut').length,
        }
      : null,
    package: packageDto(editorial, outline, film, credits),
  };
}

/** The questions of the plan's episodes not begun yet: an editor's film's "What next?". */
export function planNext(editor: StudioEditor | null | undefined): string[] {
  return (editor?.plan?.episodes ?? [])
    .filter((e) => !e.episodeId)
    .map((e) => e.question || e.title)
    .filter(Boolean)
    .slice(0, 4);
}

/**
 * The credits an editor's episode owes for its map: none for a show with
 * no map; the borders' source; and the terrain's lines when a scene of it
 * is drawn by the shots engine, whose map is shaded from the terrain.
 */
export function editorCredits(
  editor: StudioEditor | null | undefined,
  shots: boolean,
): string[] {
  return mapCredits(Boolean(readMapBase(editor?.world?.base)), shots);
}

/** What an editor's episode adds to its player: the planned questions next, and its package. */
export function editorPlay(
  editor: StudioEditor | null | undefined,
  editorial: StudioEditorial | null | undefined,
  outline: readonly Pick<OutlineScene, 'seconds' | 'rows'>[],
  film: readonly FilmScene[],
  credits: readonly string[] = [],
): Pick<StudioPlayDto, 'next' | 'package'> {
  if (!editor || !editorial) return {};
  const next = planNext(editor);
  const pack = packageDto(editorial, outline, film, credits);
  return {
    ...(next.length ? { next } : {}),
    ...(pack ? { package: pack } : {}),
  };
}
