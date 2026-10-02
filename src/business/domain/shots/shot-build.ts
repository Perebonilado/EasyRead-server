/**
 * The board's plan built into what the stage plays (explainer-animation-
 * tech.md §4.1): every name resolved to an asset, a part of one or a point
 * on the map, every set drawn, and the show's look in colours and faces.
 * The plan names; code decides geometry. Times come after (shot-time).
 *
 *  - A set that cannot be drawn (a chart the kind does not know, a photo
 *    the picture desk has not cleared, a code-drawn set before the kit
 *    has them) is a safe shot: the set before it carried on with the
 *    camera moving, or the show's map. Never words in place of a picture.
 *  - A target that cannot be resolved drops its piece of information; it
 *    never becomes text on the screen.
 *  - Actors wait for the kit (WP9): each is left out with a note, its path
 *    here kept so the kit only has to answer kitPiece().
 *
 * Pure but for the map, which is drawn before (shot-map) and handed in.
 */
import type {
  FilmShape,
  ShotAssetDto,
  ShotBox,
  ShotCreditDto,
  ShotInfoRecipe,
  ShotJoin,
  ShotLifeDto,
  ShotLookDto,
  ShotSetDto,
  ShotSvgAssetDto,
  ShotTargetDto,
} from '../../../contracts';
import { TEXT } from '../studio/explainer-rules';
import {
  nameKey,
  type PaletteEntry,
  type PaletteToken,
  tokenColour,
} from '../scene-palette';
import {
  PAPER,
  THEMES,
  type ExplainerTheme,
  type ThemeId,
} from '../scene-themes';
import { mix, paintOf } from './shot-chart-kit';
import { chartAsset } from './shot-charts';
import { WHOLE_SET } from './shot-check';
import type { ShotMapSet } from './shot-map';
import { chartPartIds, partSlug } from './shot-parts';
import { splitTarget } from './shot-registry';
import {
  CAMERA_AMOUNT,
  type UntimedActor,
  type UntimedCamera,
  type UntimedInfo,
  type UntimedShot,
} from './shot-time';
import type {
  PlanActor,
  PlanCamera,
  PlanInfo,
  PlanSet,
  RegistryEntry,
  ShotPlan,
  TargetRegistry,
} from './types';

// ── The look ──────────────────────────────────────────────────────────────

/**
 * The faces, by name, as the stage takes them: it sets each as a family
 * and puts the app's reading face (Plus Jakarta Sans, which the page loads
 * under next/font's own name) behind it. The reading face for every word;
 * the theme's display face for numbers and titles, as the client's
 * TITLE_FONTS has it (a face the page lacks falls back to the reading one).
 */
const TEXT_FACE = 'Plus Jakarta Sans';
const DISPLAY_FACE: Record<ExplainerTheme['font'], string> = {
  jakarta: TEXT_FACE,
  rounded: 'Nunito',
  'serif-display': 'Georgia',
};

/** Paper grain over every shot (the house's editorial texture). */
const GRAIN = 0.15;

/** What a build is made in and for. */
export interface BuildContext {
  shape: FilmShape;
  /** The show's sides: each recurring thing it colours (a region, a party), by name, with its token. */
  palette: readonly PaletteEntry[];
  /** The colour the show holds back for the payoff. */
  held: PaletteToken | null;
  theme: ThemeId;
  /** The show's one map as drawn for this shape (shot-map's mapSetAsset); null when it has none. */
  map: ShotMapSet | null;
  /** Everything seeded (the life layer) starts from this: the scene's own. */
  seed: string;
}

/** The show's look as the shots draw it: its theme's paper and ink, its accent, its held colour and each side's colour. */
export function shotLook(
  ctx: Pick<BuildContext, 'palette' | 'held' | 'theme'>,
): ShotLookDto {
  const theme = THEMES[ctx.theme] ?? PAPER;
  const sides: Record<string, string> = {};
  for (const entry of ctx.palette)
    if (!(entry.thing in sides))
      sides[entry.thing] = tokenColour(entry.token, theme);
  return {
    palette: {
      paper: theme.paper,
      ink: theme.ink,
      muted: theme.muted,
      accent: theme.accent,
      ...(ctx.held ? { held: tokenColour(ctx.held, theme) } : {}),
      sides,
    },
    fonts: { display: DISPLAY_FACE[theme.font], text: TEXT_FACE },
    grain: GRAIN,
    motion: 'springy',
  };
}

// ── Pieces that come later ────────────────────────────────────────────────

/** A kit piece for an actor (WP9's kit/registry). None yet: every actor is left out with a note. */
function kitPiece(
  kit: string,
  params: PlanActor['params'],
): ShotSvgAssetDto | null {
  void kit;
  void params;
  return null;
}

/** A code-drawn set (WP10's kit/sets): a kind of place, never a named one. None yet. */
function kitSet(
  set: Extract<PlanSet, { kind: 'set' }>['set'],
): ShotSvgAssetDto | null {
  void set;
  return null;
}

/** A photo, portrait or document the picture desk cleared (WP11). None yet: such a shot is a safe one. */
function pictureAsset(entry: RegistryEntry | null): {
  asset: ShotAssetDto;
  credit: ShotCreditDto;
} | null {
  void entry;
  return null;
}

// ── Building ──────────────────────────────────────────────────────────────

/** The plan built: the look, the assets by id, the shots still on their words, and what was left out or fell back. */
export interface BuiltShots {
  look: ShotLookDto;
  assets: Record<string, ShotAssetDto>;
  shots: UntimedShot[];
  notes: string[];
}

/** A map's tilt when the plan asks for one and the map can tilt (WP8). */
const MAP_TILT = 35;

/** A place pinned on a drawn map is this share of the map's shorter side across. */
const PLACE_BOX_SHARE = 0.03;

/**
 * The least the camera shows round what it is aimed at, as a share of
 * its set's shorter side: a place is a point and a chart's part a piece of
 * a whole, and framed alone either would fill the frame (a dot, a sheet's
 * band), the set's own big names cut at its edges. Half the set round it
 * says where it is.
 */
const CAMERA_CONTEXT_SHARE = 0.5;

/**
 * The kinds of part that hold others, by the prefix of their id, in the
 * order a name is matched to them: an event before its date and its dot,
 * a bar before its value and its label.
 */
const HOLDERS = [
  'event',
  'bar',
  'node',
  'item',
  'side',
  'group',
  'seats',
  'date',
  'day',
  'step',
  'point',
  'phrase',
  'value',
  'label',
  'dot',
  'path',
];

/** What the camera must not leave out of the frame when it happens: facts and a flow's ends, not a passing cue. */
const OUT_OF_VIEW: ReadonlySet<ShotInfoRecipe> = new Set<ShotInfoRecipe>([
  'fill',
  'pin',
  'seam',
  'draw',
  'count',
  'grow',
  'transfer',
  'flow',
  'enter',
]);

/**
 * What makes the picture what it is from then on: a number counted, bars
 * grown, a line drawn, a part brought on, a strike, a stamp. It stays when
 * the plan says it lets go: without it the set would be left as it was
 * (a counter with no number), the words saying what is no longer shown.
 */
const STAYS: ReadonlySet<ShotInfoRecipe> = new Set<ShotInfoRecipe>([
  'draw',
  'count',
  'grow',
  'morph',
  'strike',
  'stamp',
  'enter',
]);

/** A camera taking in this share of its set's subject or more takes in the subject whole. */
const SUBJECT_MOST = 0.5;

/** A strike's new words come in this long after the line through the old ones has landed. */
const NEW_WORDS_LAG_MS = 400;

/** The life layer's amount when the plan only names the effect: under the rules' cap either way. */
const LIFE_AMOUNT = 0.5;
const LIFE_MOST = 3;

/** Where an actor stands for a position word, as shares of its set. */
const POSITIONS: Record<string, [number, number]> = {
  left: [0.25, 0.78],
  centre: [0.5, 0.78],
  center: [0.5, 0.78],
  middle: [0.5, 0.78],
  right: [0.75, 0.78],
};

/** A string's FNV-1a hash: the life layer's seeds, the same for the same scene every time. */
function seedOf(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** At most `most` words of a text, trimmed; undefined for none. */
function wordsUpTo(text: string | undefined, most: number): string | undefined {
  const words = (text ?? '').trim().split(/\s+/).filter(Boolean);
  return words.length ? words.slice(0, most).join(' ') : undefined;
}

/** A set as built, with what it brings: its asset and its chip. */
interface BuiltSet {
  set: ShotSetDto;
  asset?: { id: string; dto: ShotAssetDto };
  chip?: ShotCreditDto;
  /** A drawn picture of a real event or place. */
  illustration?: boolean;
}

const assetOf = (set: ShotSetDto): string | null =>
  'asset' in set ? set.asset : null;

const sameSet = (a: ShotSetDto, b: ShotSetDto) =>
  a.kind === b.kind && assetOf(a) === assetOf(b);

const centre = (box: ShotBox): [number, number] => [
  box[0] + box[2] / 2,
  box[1] + box[3] / 2,
];

/** A travel's length by how far it goes (research §3.2): 300 ms and 600 ms a frame width, 0.4 to 1.2 s. */
export function travelMs(from: ShotBox, to: ShotBox, width: number): number {
  const [ax, ay] = centre(from);
  const [bx, by] = centre(to);
  const across = Math.hypot(bx - ax, by - ay) / Math.max(1, width);
  return Math.round(Math.max(400, Math.min(1200, 300 + 600 * across)));
}

/** A research claim named by its id ("c7", "claim:c7"): never words a viewer reads. */
const CLAIM_ID = /^(?:claim:)?(c\d+)$/i;

/**
 * A chart's spec as it is drawn: a source given as a claim's id is the
 * title of where that claim comes from, or no source line at all; and
 * nothing is written twice: a timeline's event named only by its own date
 * ({when: "1951", name: "1951"}) is drawn by its date alone, and a
 * calendar named only by its one date ({label: "1957", dates: ["1957"]})
 * is its sheet alone.
 */
function drawnSpec(
  kind: string,
  given: Record<string, unknown>,
  sourceOf: (claim: string) => string | undefined,
): Record<string, unknown> {
  const id =
    typeof given.source === 'string'
      ? CLAIM_ID.exec(given.source.trim())?.[1]
      : undefined;
  const spec = { ...given };
  if (id) {
    const source = sourceOf(id.toLowerCase());
    if (source) spec.source = source;
    else delete spec.source;
  }
  const key = (raw: unknown) =>
    typeof raw === 'string' || typeof raw === 'number'
      ? String(raw)
          .toLowerCase()
          .replace(/[^\p{L}\p{N}]/gu, '')
      : '';
  const each = (list: unknown, fix: (one: Record<string, unknown>) => object) =>
    (list as unknown[]).map((raw) =>
      fix(
        (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>,
      ),
    );
  if (kind === 'timeline' && Array.isArray(spec.events))
    spec.events = each(spec.events, (e) =>
      key(e.name) && key(e.name) === key(e.when) ? { ...e, name: '' } : e,
    );
  if (kind === 'calendar' && Array.isArray(spec.calendars))
    spec.calendars = each(spec.calendars, (c) =>
      Array.isArray(c.dates) &&
      c.dates.length === 1 &&
      key(c.label) &&
      key(c.label) === key(c.dates[0])
        ? { ...c, label: null }
        : c,
    );
  return spec;
}

/** A shot moved onto another copy of its set: every reference to the one asset made to the other. */
function ontoAsset<T>(value: T, from: string, to: string): T {
  return JSON.parse(JSON.stringify(value), (_key, v: unknown) =>
    v &&
    typeof v === 'object' &&
    !Array.isArray(v) &&
    (v as { asset?: unknown }).asset === from
      ? { ...v, asset: to }
      : v,
  ) as T;
}

/**
 * An asset with some of its parts drawn in a neutral colour (the land a
 * region lies on, the faint of an empty bar): the first colour each part
 * is drawn in is the one a fill turns, so before its fill it is neutral.
 */
function withNeutral(
  asset: ShotSvgAssetDto,
  parts: readonly string[],
  colour: string,
): ShotSvgAssetDto {
  let svg = asset.svg;
  for (const id of parts) {
    const at = svg.indexOf(`data-part="${id}"`);
    if (at < 0) continue;
    const fill = svg.indexOf('fill="', at);
    const next = svg.indexOf('data-part="', at + 1);
    if (fill < 0 || (next >= 0 && next < fill)) continue;
    const end = svg.indexOf('"', fill + 6);
    svg = `${svg.slice(0, fill + 6)}${colour}${svg.slice(end)}`;
  }
  return { ...asset, svg };
}

/**
 * A shot's set drawn for its picture's later state (a strike's line and
 * new words, a document's stamp, a calendar's later sheet) has those parts
 * brought on by the change they belong to: the stage shows every part an
 * asset draws unless a recipe brings it on. A strike on a chart that draws
 * its own line is that line drawn on, its new words coming in after it; a
 * stamp, a fill or any change on a later part brings it on with it; a
 * later part nothing brings on comes with the shot's last change, else as
 * it opens. What was done is said in `notes`.
 */
function bringOnLater(
  shot: UntimedShot,
  asset: ShotSvgAssetDto,
  assetId: string,
  notes: string[],
  where: string,
): UntimedShot {
  const later = Object.keys(asset.parts).filter((id) => asset.parts[id].later);
  if (!later.length) return shot;
  const part = (id: string): ShotTargetDto => ({
    kind: 'asset',
    asset: assetId,
    part: id,
  });
  const partOf = (info: UntimedInfo) =>
    info.target?.kind === 'asset' && info.target.asset === assetId
      ? info.target.part
      : undefined;
  const brought = new Set(
    shot.info
      .filter((x) => x.recipe === 'enter' || x.recipe === 'draw')
      .map(partOf)
      .filter((id): id is string => !!id),
  );
  const line = asset.parts.strike?.later && asset.parts.strike.path;
  const out: UntimedInfo[] = [];
  const bring = (id: string, after: UntimedInfo, lag = 0) => {
    if (brought.has(id) || !asset.parts[id]?.later) return;
    brought.add(id);
    out.push({
      id: `${after.id}-${id}`,
      ...(asset.parts[id].path
        ? { recipe: 'draw' as const, target: part(id) }
        : {
            recipe: 'enter' as const,
            target: part(id),
            text: after.recipe === 'stamp' ? 'scale' : 'rise',
          }),
      on: after.on,
      ...(lag ? { lag } : {}),
    });
  };
  for (const info of shot.info) {
    if (info.recipe === 'strike' && line) {
      // The chart's own line, drawn on; its new words in once it is drawn.
      const drawn: UntimedInfo = {
        id: info.id,
        recipe: 'draw',
        target: part('strike'),
        on: info.on,
      };
      out.push(drawn);
      brought.add('strike');
      bring('new', drawn, NEW_WORDS_LAG_MS);
      continue;
    }
    const target = partOf(info);
    if (info.recipe === 'stamp' && target && asset.parts[target]?.later) {
      // The chart's own stamp comes down; the recipe only lands it (its thump).
      const landed = { ...info };
      delete landed.text;
      out.push(landed);
      bring(target, landed);
      continue;
    }
    out.push(info);
    if (target && info.recipe !== 'enter' && info.recipe !== 'draw')
      bring(target, info);
  }
  const last = [...out]
    .reverse()
    .find((x) => x.recipe !== 'enter' && x.recipe !== 'draw');
  for (const id of later)
    if (!brought.has(id)) {
      bring(
        id,
        last ?? { id: `${shot.id}-open`, recipe: 'enter', on: shot.on },
        last ? NEW_WORDS_LAG_MS : 0,
      );
      notes.push(
        `${where}: ${id} brought on with ${last ? 'its last change' : 'its opening'}`,
      );
    }
  return { ...shot, info: out };
}

/**
 * The plan built into assets and untimed shots. Each shot's set is drawn
 * (or falls back to a safe shot), its targets resolved against its set,
 * its actors waiting for the kit, its life seeded; each join says how it
 * hands over, the same set carried on where two shots share one.
 */
export function buildShots(
  plan: ShotPlan,
  registry: TargetRegistry,
  ctx: BuildContext,
): BuiltShots {
  const look = shotLook(ctx);
  const assets: Record<string, ShotAssetDto> = {};
  const notes: string[] = [];
  /** Each chart drawn, by its kind and spec: drawn once, shown by every shot that asks for it. */
  const charts = new Map<string, { id: string; dto: ShotSvgAssetDto }>();
  const pictures = new Map<string, string>();

  /** A planned set drawn, or null when it cannot be. */
  const setOf = (planned: PlanSet, i: number): BuiltSet | null => {
    switch (planned.kind) {
      case 'map': {
        const map = ctx.map;
        if (!map) return null;
        return {
          set: {
            kind: 'map',
            asset: map.id,
            style: planned.style ?? 'atlas',
            tilt: !map.flat && planned.tilt === 'tilted' ? MAP_TILT : 0,
            bearing: 0,
            terrain: !map.flat && planned.terrain === true,
          },
          asset: { id: map.id, dto: map.asset },
          ...(map.chip ? { chip: map.chip } : {}),
        };
      }
      case 'chart': {
        const key = JSON.stringify([planned.chart.kind, planned.chart.spec]);
        const kept = charts.get(key);
        if (kept)
          return { set: { kind: 'chart', asset: kept.id }, asset: kept };
        const dto = chartAsset(
          planned.chart.kind,
          drawnSpec(
            planned.chart.kind,
            planned.chart.spec ?? {},
            (claim) => registry.resolve(`claim:${claim}`)?.source,
          ),
          look,
          ctx.shape,
        );
        if (!dto) {
          notes.push(`shot ${i + 1}: no ${planned.chart.kind} could be drawn`);
          return null;
        }
        const id = `chart-${charts.size + 1}`;
        charts.set(key, { id, dto });
        return { set: { kind: 'chart', asset: id }, asset: { id, dto } };
      }
      case 'photo':
      case 'portrait':
      case 'document': {
        const name =
          planned.kind === 'photo'
            ? planned.photo
            : planned.kind === 'portrait'
              ? planned.person
              : planned.document;
        const entry = registry.resolve(name);
        const picture = pictureAsset(entry);
        if (!picture) {
          notes.push(`shot ${i + 1}: no cleared picture of "${name}" yet`);
          return null;
        }
        const id = pictures.get(name) ?? `picture-${pictures.size + 1}`;
        pictures.set(name, id);
        const set: ShotSetDto =
          planned.kind === 'photo'
            ? {
                kind: 'photo',
                asset: id,
                treatment: planned.treatment ?? 'duotone',
              }
            : planned.kind === 'portrait'
              ? {
                  kind: 'portrait',
                  asset: id,
                  name: name.replace(/^[a-z]+:/i, ''),
                }
              : { kind: 'document', asset: id };
        return { set, asset: { id, dto: picture.asset }, chip: picture.credit };
      }
      case 'set': {
        const dto = kitSet(planned.set);
        if (!dto) {
          notes.push(`shot ${i + 1}: no code-drawn set yet`);
          return null;
        }
        const id = `set-${i + 1}`;
        return {
          set: { kind: 'set', asset: id },
          asset: { id, dto },
          illustration: true,
        };
      }
      case 'plain':
        return { set: { kind: 'plain' } };
    }
  };

  // Each shot's own set where it can be drawn; the first that can stands
  // in for any before it.
  const own = plan.shots.map((shot, i) => setOf(shot.set, i));
  const firstDrawn = own.find((one): one is BuiltSet => one !== null) ?? null;

  const built: { shot: UntimedShot; asset: ShotAssetDto | null }[] = [];
  /** Where the camera was last aimed, for a travel's distance on a set carried on. */
  let lastView: { asset: string | null; box: ShotBox } | null = null;
  plan.shots.forEach((planned, i) => {
    const id = `s${i + 1}`;
    let set = own[i];
    /** A safe shot's own camera move: the picture kept alive. */
    let safeMove: UntimedCamera | null = null;
    if (!set) {
      const before = built[built.length - 1];
      if (before) {
        // The set before carried on, the camera moving in on its subject.
        set = {
          set: before.shot.set,
          ...(before.asset && assetOf(before.shot.set)
            ? { asset: { id: assetOf(before.shot.set)!, dto: before.asset } }
            : {}),
          ...(before.shot.chip ? { chip: before.shot.chip } : {}),
        };
        // Where the camera last was on it: the last thing it was aimed
        // at, else the subject.
        const aim =
          [...before.shot.camera].reverse().find((c) => c.target)?.target ??
          before.shot.focal;
        safeMove = {
          move: 'push',
          on: planned.on,
          amount: CAMERA_AMOUNT.small,
          ...(aim ? { target: aim } : {}),
        };
        notes.push(
          `shot ${i + 1}: safe shot, shot ${built.length}'s set carried on`,
        );
      } else if (ctx.map) {
        set = setOf({ kind: 'map' }, i);
        safeMove = { move: 'establish', on: planned.on };
        notes.push(`shot ${i + 1}: safe shot, the show's map`);
      } else if (firstDrawn) {
        set = firstDrawn;
        notes.push(
          `shot ${i + 1}: safe shot, the first set that could be drawn`,
        );
      } else {
        set = { set: { kind: 'plain' } };
        notes.push(`shot ${i + 1}: no picture could be drawn; paper`);
      }
    }
    const shotSet = set!;
    if (shotSet.asset) assets[shotSet.asset.id] = shotSet.asset.dto;
    const asset = shotSet.asset?.dto ?? null;
    const svg = asset?.kind === 'svg' ? asset : null;
    const onMap = shotSet.set.kind === 'map' && ctx.map ? ctx.map : null;
    const assetId = assetOf(shotSet.set);
    // The chart the plan asked for, when it is the one drawn: its parts are
    // named by what they show ("part:1951"), as the board names them.
    const chart =
      own[i] && planned.set.kind === 'chart' && shotSet.set.kind === 'chart'
        ? planned.set.chart
        : null;
    const whole: ShotTargetDto | null = assetId
      ? { kind: 'asset', asset: assetId }
      : null;

    // Actors: the kit's pieces on the set. None until the kit (WP9).
    const actors: UntimedActor[] = [];
    const actorIds = new Set<string>();
    for (const one of planned.actors ?? []) {
      const piece = kitPiece(one.kit, one.params);
      if (!piece) {
        notes.push(
          `shot ${i + 1}: actor ${one.id} (${one.kit}) left out: no kit piece yet`,
        );
        continue;
      }
      const at = actorAt(one.place);
      if (!at) {
        notes.push(`shot ${i + 1}: actor ${one.id} has nowhere to stand`);
        continue;
      }
      const pieceId = `actor-${i + 1}-${actors.length + 1}`;
      assets[pieceId] = piece;
      actors.push({
        id: one.id,
        asset: pieceId,
        at,
        size: svg ? svg.box[3] * 0.4 : 0.3,
        z: actors.length + 1,
        ...(one.side && sideOf(one.side) ? { side: sideOf(one.side)! } : {}),
        moves: (one.moves ?? []).map((move) => {
          const to = move.to ? targetOf(move.to) : null;
          return { move: move.move, on: move.on, ...(to ? { to } : {}) };
        }),
      });
      actorIds.add(one.id);
    }

    /** Where an actor stands: a place or a part named, or a position word on the set. */
    function actorAt(place?: string): UntimedActor['at'] | null {
      const target = place ? targetOf(place) : null;
      if (target?.kind === 'geo') return { lng: target.lng, lat: target.lat };
      const box = target ? boxOf(target) : null;
      if (box) {
        // On its feet: at the middle of what it stands on, at its foot.
        const [x] = centre(box);
        return { x, y: box[1] + box[3] };
      }
      const word =
        POSITIONS[(place ?? 'centre').toLowerCase()] ?? POSITIONS.centre;
      if (!svg) return null;
      return {
        x: svg.box[0] + svg.box[2] * word[0],
        y: svg.box[1] + svg.box[3] * word[1],
      };
    }

    /** A colour role a piece of information may take: the look's own, or a side's by its name. */
    function sideOf(name: string): string | null {
      const bare = name.replace(/^side:/i, '').trim();
      if (['ink', 'muted', 'accent', 'held'].includes(bare)) return bare;
      const key = nameKey(bare);
      return (
        Object.keys(look.palette.sides).find((side) => nameKey(side) === key) ??
        null
      );
    }

    /** A target's box in its set's units, where it has one. */
    function boxOf(target: ShotTargetDto): ShotBox | null {
      if (target.kind === 'box') return target.box;
      if (target.kind === 'asset' && target.asset === assetId && svg)
        return target.part
          ? (svg.parts[target.part]?.box ?? null)
          : (svg.focal ?? svg.box);
      return null;
    }

    /** A place on the map: a part the map draws for it, else a small box round its point. */
    function placeOnMap(entry: RegistryEntry): ShotTargetDto | null {
      if (!onMap) return null;
      const part =
        (entry.feature && onMap.asset.parts[entry.feature.id]
          ? entry.feature.id
          : null) ?? partNamed(entry.name);
      if (part) return { kind: 'asset', asset: onMap.id, part };
      if (!entry.geo) return null;
      if (!onMap.project)
        return { kind: 'geo', lng: entry.geo.lng, lat: entry.geo.lat };
      const point = onMap.project(entry.geo.lng, entry.geo.lat);
      if (!point) return null;
      const [, , W, H] = onMap.asset.box;
      const r = (Math.min(W, H) * PLACE_BOX_SHARE) / 2;
      return {
        kind: 'box',
        box: [
          Math.round((point[0] - r) * 10) / 10,
          Math.round((point[1] - r) * 10) / 10,
          Math.round(2 * r * 10) / 10,
          Math.round(2 * r * 10) / 10,
        ],
      };
    }

    /** One of the map's regions, seams or places by the name the show gives it. */
    function partNamed(name: string): string | null {
      if (!onMap) return null;
      const key = nameKey(name.replace(/^[a-z]+:/i, ''));
      const found = Object.keys(onMap.parts).find((n) => nameKey(n) === key);
      return found ? onMap.parts[found] : null;
    }

    /**
     * A part of this shot's set by what it shows: its own id; else the
     * first id the board expects for the words that the chart has
     * (chartPartIds); else a part the charts name by the words
     * ("event-<words>", "bar-<words>"), the part that holds the rest
     * first; else a calendar's sheet by its date's place among them.
     */
    function partOf(words: string): string | null {
      if (!svg) return null;
      if (svg.parts[words]) return words;
      if (!chart) return null;
      const expected = chartPartIds(chart, words).find((p) => svg.parts[p]);
      if (expected) return expected;
      const slug = partSlug(words);
      const named = Object.keys(svg.parts).filter(
        (id) => id === slug || id.endsWith(`-${slug}`),
      );
      const rank = (id: string) => {
        const k = HOLDERS.indexOf(id.split('-')[0]);
        return k < 0 ? HOLDERS.length : k;
      };
      if (named.length) return named.sort((a, b) => rank(a) - rank(b))[0];
      if (chart.kind === 'calendar') {
        const key = partSlug(words);
        const spec = chart.spec as {
          calendars?: { dates?: unknown[] }[];
          merge?: unknown;
        };
        if (typeof spec.merge === 'string' && partSlug(spec.merge) === key)
          return svg.parts.merge ? 'merge' : null;
        const dates = (spec.calendars ?? []).flatMap((c) =>
          (c.dates ?? []).map(String),
        );
        const at = dates.findIndex((d) => partSlug(d) === key);
        if (at >= 0 && svg.parts[`date-${at + 1}`]) return `date-${at + 1}`;
      }
      return null;
    }

    /**
     * What a name points at in this shot: its whole set ("set"), a part of
     * its set, one of its actors, or what the registry says it is, on this
     * set. A place is only ever on the map; a date is a timeline's event or
     * a calendar's day; a person is their trace (their place on the map, or
     * their words on a quotation) until the picture desk has their portrait;
     * a claim is the quotation or document that shows it.
     */
    function targetOf(name: string | undefined): ShotTargetDto | null {
      if (!name?.trim()) return null;
      if (name.trim().toLowerCase() === WHOLE_SET) return whole;
      const { prefix, rest } = splitTarget(name);
      if ((prefix === 'part' || !prefix) && assetId) {
        const part = partOf(rest);
        if (part) return { kind: 'asset', asset: assetId, part };
        if (prefix === 'part') return null;
      }
      if (prefix === 'actor' || !prefix) {
        if (actorIds.has(rest)) return { kind: 'actor', actor: rest };
        if (prefix === 'actor') return null;
      }
      const entry = registry.resolve(name);
      if (!entry) {
        const part = partNamed(name);
        return part && onMap ? { kind: 'asset', asset: onMap.id, part } : null;
      }
      const words = splitTarget(entry.name).rest;
      const onAsset = (part: string | null): ShotTargetDto | null =>
        part && assetId ? { kind: 'asset', asset: assetId, part } : null;
      switch (entry.kind) {
        case 'place':
          return placeOnMap(entry);
        case 'region':
        case 'seam':
        case 'route': {
          if (!onMap) return null;
          const part =
            (entry.feature && onMap.asset.parts[entry.feature.id]
              ? entry.feature.id
              : null) ?? partNamed(entry.name);
          return part ? { kind: 'asset', asset: onMap.id, part } : null;
        }
        case 'number': {
          if (!svg) return null;
          return onAsset(
            Object.keys(svg.parts).find(
              (p) =>
                entry.value !== undefined && svg.parts[p].value === entry.value,
            ) ??
              (svg.parts.number ? 'number' : null) ??
              partOf(words),
          );
        }
        case 'date':
          return chart ? onAsset(partOf(words)) : null;
        case 'person': {
          const trace = entry.trace;
          if (trace?.kind === 'place') {
            const place = registry.resolve(trace.ref);
            return place?.kind === 'place' ? placeOnMap(place) : null;
          }
          if (trace?.kind === 'quote' && chart?.kind === 'quote')
            return (
              onAsset(
                partOf(words) ?? (svg?.parts.speaker ? 'speaker' : null),
              ) ?? whole
            );
          return null;
        }
        case 'claim':
          return chart && ['quote', 'document'].includes(chart.kind)
            ? whole
            : null;
        case 'part':
        case 'actor':
          return targetOf(words);
        default:
          return null;
      }
    }

    /**
     * What a recipe that needs no target acts on when the plan names none:
     * a strike's old words, a stamp's mark, a flow along its chart. A
     * question needs nothing; anything else with nothing to act on goes.
     */
    function ownTarget(recipe: PlanInfo['recipe']): ShotTargetDto | null {
      if (!svg || !assetId || !chart) return null;
      const part = (id: string): ShotTargetDto | null =>
        svg.parts[id] ? { kind: 'asset', asset: assetId, part: id } : null;
      if (recipe === 'strike') return part('old') ?? whole;
      if (recipe === 'stamp') return part('stamp') ?? whole;
      if (recipe === 'flow') return whole;
      return null;
    }

    // The information layer: each piece on a target that resolves, its
    // words from the plan or, for a label, the name the research gives it.
    const info: UntimedInfo[] = [];
    (planned.info ?? []).forEach((one: PlanInfo, k) => {
      const target = one.target ? targetOf(one.target) : ownTarget(one.recipe);
      if (one.recipe !== 'ask' && !target) {
        notes.push(
          `shot ${i + 1}: ${one.recipe} on "${one.target ?? ''}" dropped (nothing on this set to point at)`,
        );
        return;
      }
      const to = one.to ? targetOf(one.to) : null;
      // A flow runs along something: to where it goes, a part's own path,
      // or a whole chart's paths; with none it would run off nowhere.
      const runsAlong =
        !!to ||
        (target?.kind === 'asset' &&
          (!target.part || !!svg?.parts[target.part]?.path));
      if (one.recipe === 'flow' && !runsAlong) {
        notes.push(
          `shot ${i + 1}: flow on "${one.target ?? ''}" dropped (no path to run along and nowhere to go)`,
        );
        return;
      }
      if (one.recipe === 'transfer' && !to) {
        notes.push(
          `shot ${i + 1}: transfer to "${one.to ?? ''}" dropped (nowhere to go)`,
        );
        return;
      }
      const entry = one.target ? registry.resolve(one.target) : null;
      // What names itself is named as the voice names it, never twice: a
      // region the map draws its name for has that name brought on, and a
      // part of a chart (which writes all its own words: an event's date, a
      // side's heading) comes on itself, the chart building as it is said.
      const ownName =
        one.recipe === 'label' && target?.kind === 'asset' && target.part
          ? shotSet.set.kind === 'chart'
            ? target.part
            : `label-${target.part.replace(/^group-/, '')}`
          : null;
      if (ownName && target?.kind === 'asset' && svg?.parts[ownName]) {
        const entered = info.some(
          (x) =>
            x.recipe === 'enter' &&
            x.target?.kind === 'asset' &&
            x.target.part === ownName,
        );
        if (!entered)
          info.push({
            id: `${id}-i${k + 1}`,
            recipe: 'enter',
            target: { kind: 'asset', asset: target.asset, part: ownName },
            text: 'rise',
            on: one.on,
          });
        return;
      }
      const named =
        one.recipe === 'label' && !one.text && entry
          ? entry.name.replace(/^[a-z]+:/i, '')
          : one.text;
      const text = wordsUpTo(
        named,
        one.recipe === 'label' ? TEXT.labelWordsMax : TEXT.stageWordsMax,
      );
      const counts = one.recipe === 'count' || one.recipe === 'grow';
      const value = one.value ?? (counts ? entry?.value : undefined);
      const unit = wordsUpTo(one.unit ?? (counts ? entry?.unit : undefined), 2);
      // A fill with no colour of its own lands on its part's: a region in
      // its side's colour, never the accent the recipe would choose.
      const role =
        one.recipe === 'fill' &&
        !one.until &&
        target?.kind === 'asset' &&
        target.part
          ? svg?.parts[target.part]?.role
          : undefined;
      const colour = one.colour ? sideOf(one.colour) : (role ?? null);
      const replace = wordsUpTo(one.replace, TEXT.labelWordsMax);
      info.push({
        id: `${id}-i${k + 1}`,
        recipe: one.recipe,
        ...(target ? { target } : {}),
        ...(to ? { to } : {}),
        ...(text ? { text } : {}),
        ...(value !== undefined && Number.isFinite(value) ? { value } : {}),
        ...(one.from !== undefined && Number.isFinite(one.from)
          ? { from: one.from }
          : {}),
        ...(unit ? { unit } : {}),
        ...(colour ? { colour } : {}),
        ...(replace ? { replace } : {}),
        on: one.on,
        // What points at the picture lets go on its words; what the picture
        // becomes (a number counted, a line drawn, a part brought on) stays.
        ...(one.until && !STAYS.has(one.recipe) ? { until: one.until } : {}),
      });
    });

    /**
     * What the camera is aimed at, with room round it: a point or a small
     * box (a place) widened to a share of its set, kept inside the set.
     * The set as a whole is its own subject, the box its drawing says the
     * camera frames (on the stage the whole asset is framed edge to edge,
     * past the set's sides onto paper).
     */
    function inContext(target: ShotTargetDto): ShotTargetDto {
      if (!svg) return target;
      if (
        target.kind === 'asset' &&
        target.asset === assetId &&
        !target.part &&
        svg.focal
      )
        return { kind: 'box', box: svg.focal };
      const box =
        target.kind === 'box'
          ? target.box
          : target.kind === 'asset' && target.part
            ? boxOf(target)
            : null;
      if (!box) return target;
      const [bx, by, bw, bh] = svg.box;
      const least = Math.min(bw, bh) * CAMERA_CONTEXT_SHARE;
      const [, , w, h] = box;
      if (w >= least && h >= least) return target;
      const W = Math.max(w, least);
      const H = Math.max(h, least);
      const [cx, cy] = centre(box);
      const x0 = Math.max(bx, Math.min(bx + bw - W, cx - W / 2));
      const y0 = Math.max(by, Math.min(by + bh - H, cy - H / 2));
      const r = (n: number) => Math.round(n * 10) / 10;
      return { kind: 'box', box: [r(x0), r(y0), r(W), r(H)] };
    }

    /** The smallest box round two. */
    const around = (a: ShotBox, b: ShotBox): ShotBox => {
      const x0 = Math.min(a[0], b[0]);
      const y0 = Math.min(a[1], b[1]);
      const x1 = Math.max(a[0] + a[2], b[0] + b[2]);
      const y1 = Math.max(a[1] + a[3], b[1] + b[3]);
      return [x0, y0, x1 - x0, y1 - y0];
    };
    const inside = (outer: ShotBox, inner: ShotBox) =>
      inner[0] >= outer[0] - 1 &&
      inner[1] >= outer[1] - 1 &&
      inner[0] + inner[2] <= outer[0] + outer[2] + 1 &&
      inner[1] + inner[3] <= outer[1] + outer[3] + 1;

    // The camera: each move on what it names, with room round it, or the
    // shot's subject when what it names is not on this set; a travel as
    // long as its distance from where the camera was.
    const named = planned.focal ? targetOf(planned.focal) : null;
    const moves = (planned.camera ?? ([] as PlanCamera[])).map((planned) => {
      const target = planned.target ? targetOf(planned.target) : null;
      if (planned.target && !target)
        notes.push(
          `shot ${i + 1}: ${planned.move} on "${planned.target}" frames the subject instead`,
        );
      // A follow is of something that moves: on what stands still it is a
      // travel to it, and when a flow runs from it, to the flow's whole way.
      const still = planned.move === 'follow' && target?.kind !== 'actor';
      const one: PlanCamera = still ? { ...planned, move: 'travel' } : planned;
      const runs = still
        ? info.find(
            (x) =>
              x.recipe === 'flow' &&
              x.to &&
              JSON.stringify(x.target) === JSON.stringify(target),
          )
        : undefined;
      const starts = target ? boxOf(target) : null;
      const ends = runs?.to ? boxOf(runs.to) : null;
      return {
        one,
        target:
          starts && ends
            ? inContext({ kind: 'box', box: around(starts, ends) })
            : target
              ? inContext(target)
              : null,
      };
    });
    // A shot that travels to its subject opens where the camera was, not
    // already there: its subject is where the travel ends.
    const opensOnTravel =
      named &&
      moves[0]?.one.move === 'travel' &&
      JSON.stringify(moves[0].target) === JSON.stringify(inContext(named));
    const focal = named && !opensOnTravel ? inContext(named) : null;
    const carried =
      lastView && assetId !== null && lastView.asset === assetId
        ? lastView.box
        : null;
    let from: ShotBox | null =
      (focal ? boxOf(focal) : null) ??
      carried ??
      svg?.focal ??
      svg?.box ??
      null;
    const camera: UntimedCamera[] = safeMove ? [safeMove] : [];
    /** Where the camera was aimed before each of its moves. */
    const before: (ShotBox | null)[] = safeMove ? [from] : [];
    for (const { one, target } of moves) {
      before.push(from);
      const amount =
        one.move === 'push' ||
        one.move === 'pull' ||
        one.move === 'zoom-through'
          ? CAMERA_AMOUNT[one.amount ?? (target ? 'medium' : 'small')]
          : undefined;
      const to = target ? boxOf(target) : null;
      camera.push({
        move: one.move,
        on: one.on,
        ...(target ? { target } : {}),
        ...(amount !== undefined ? { amount } : {}),
        ...(one.move === 'travel' && from && to && svg
          ? { durMs: travelMs(from, to, svg.box[2]) }
          : {}),
      });
      if (to) from = to;
    }
    // What the shot shows that the camera would leave out of the frame (a
    // region filled away from the one it is on, the far end of a flow):
    // the camera travels once to take it in with what it was showing, on
    // the words it is shown on; a move already on those words becomes that
    // travel, never two moves landing at once.
    const view = from;
    if (svg && view) {
      const out = info.flatMap((x) => {
        if (!OUT_OF_VIEW.has(x.recipe)) return [];
        const boxes = [x.target, x.to]
          .map((t) => (t ? boxOf(t) : null))
          .filter((b): b is ShotBox => !!b && !inside(view, b));
        return boxes.length ? [{ x, boxes }] : [];
      });
      if (out.length) {
        const whole = out
          .flatMap((o) => o.boxes)
          .reduce((a, b) => around(a, b), view);
        // Most of the set's subject: the subject whole, never a slice of it
        // with its last part at the frame's edge.
        const subject = svg.focal ?? svg.box;
        const most =
          whole[2] * whole[3] >= subject[2] * subject[3] * SUBJECT_MOST;
        const target = inContext({
          kind: 'box',
          box: (most ? around(subject, whole) : whole).map(
            (n) => Math.round(n * 10) / 10,
          ) as ShotBox,
        });
        const wholeBox = boxOf(target) ?? whole;
        const on = out[0].x.on;
        const same = camera.findIndex((c) => c.on === on && c !== safeMove);
        const travel = (was: ShotBox | null): UntimedCamera => ({
          move: 'travel',
          on,
          target,
          durMs: travelMs(was ?? view, wholeBox, svg.box[2]),
        });
        const taken = same >= 0 || camera.length < 3;
        if (same >= 0) camera[same] = travel(before[same]);
        else if (taken) camera.push(travel(view));
        if (taken) {
          // Taken in at the last move, it is where the camera ends.
          if (same < 0 || same === camera.length - 1) from = wholeBox;
          notes.push(
            `shot ${i + 1}: the camera takes in ${out.length === 1 ? 'what it would leave out' : `${out.length} things it would leave out`}`,
          );
        }
      }
    }
    if (from) lastView = { asset: assetId, box: from };

    const life: ShotLifeDto[] = [...new Set(planned.life ?? [])]
      .slice(0, LIFE_MOST)
      .map((effect) => ({
        effect,
        seed: seedOf(`${ctx.seed}:${i}:${effect}`),
        amount: LIFE_AMOUNT,
      }));

    built.push({
      shot: {
        id,
        on: planned.on,
        set: shotSet.set,
        actors,
        info,
        life,
        camera,
        ...(focal ? { focal } : {}),
        join: planned.join,
        ...(shotSet.chip ? { chip: shotSet.chip } : {}),
        ...(shotSet.illustration ? { illustration: true } : {}),
      },
      asset,
    });
  });

  // Each set's later state brought on by the change it belongs to.
  built.forEach((one, i) => {
    const id = assetOf(one.shot.set);
    if (id && one.asset?.kind === 'svg')
      one.shot = bringOnLater(one.shot, one.asset, id, notes, `shot ${i + 1}`);
  });

  // A part a lasting fill turns starts neutral in the run of shots it is
  // first filled in (that run's own copy of the set), and keeps its colour
  // in every run after; a run is shots one after another on one set. A
  // highlight that lets go (a fill with until) leaves the part as it is
  // drawn. A lasting fill of a part already in that colour is left out: it
  // shows nothing, and on the stage it would hold the colour back.
  const filled = new Map<string, string>();
  const paint = paintOf(look);
  const lasting = (x: UntimedInfo) =>
    x.recipe === 'fill' &&
    !x.until &&
    x.target?.kind === 'asset' &&
    !!x.target.part;
  for (let k = 0; k < built.length;) {
    const id = assetOf(built[k].shot.set);
    let end = k + 1;
    while (end < built.length && id && assetOf(built[end].shot.set) === id)
      end += 1;
    const asset = id ? assets[id] : undefined;
    if (id && asset?.kind === 'svg') {
      const first: string[] = [];
      for (let j = k; j < end; j += 1) {
        const shot = built[j].shot;
        const info = shot.info.filter((x) => {
          if (!lasting(x) || x.target?.kind !== 'asset') return true;
          const part = x.target.part!;
          const colour = x.colour ?? '';
          if (filled.get(part) === colour) {
            notes.push(
              `shot ${j + 1}: fill of ${part} left out (already that colour)`,
            );
            return false;
          }
          if (!filled.has(part) && asset.parts[part]?.role) first.push(part);
          filled.set(part, colour);
          return true;
        });
        if (info.length !== shot.info.length) built[j].shot = { ...shot, info };
      }
      // A region's own name comes on with it: one the run fills before the
      // plan names it is named as it fills, never left off a region the
      // voice has already named.
      const fillOf = new Map<string, { j: number; on: string }>();
      for (let j = k; j < end; j += 1)
        for (const x of built[j].shot.info)
          if (
            x.recipe === 'fill' &&
            x.target?.kind === 'asset' &&
            x.target.part &&
            !fillOf.has(x.target.part)
          )
            fillOf.set(x.target.part, { j, on: x.on });
      for (let j = k; j < end; j += 1)
        for (const x of built[j].shot.info) {
          const part =
            x.recipe === 'enter' && x.target?.kind === 'asset'
              ? x.target.part
              : undefined;
          const fill = part?.startsWith('label-')
            ? fillOf.get(`group-${part.slice('label-'.length)}`)
            : undefined;
          if (!fill || fill.j >= j) continue;
          built[j].shot = {
            ...built[j].shot,
            info: built[j].shot.info.filter((y) => y !== x),
          };
          const into = built[fill.j].shot;
          built[fill.j].shot = {
            ...into,
            info: [
              ...into.info,
              { ...x, id: `${into.id}-n${into.info.length + 1}`, on: fill.on },
            ],
          };
          notes.push(
            `shot ${j + 1}: ${part} brought on with its region's fill in shot ${fill.j + 1}`,
          );
        }
      if (first.length) {
        const parts = [...new Set(first)].sort();
        const copy = `${id}~${seedOf(parts.join('+')).toString(36)}`;
        const neutral =
          built[k].shot.set.kind === 'map'
            ? paint.dark
              ? mix(paint.paper, paint.ink, 0.1)
              : mix(paint.paper, '#FFFFFF', 0.8)
            : paint.faint;
        assets[copy] ??= withNeutral(asset, parts, neutral);
        for (let j = k; j < end; j += 1)
          built[j].shot = ontoAsset(built[j].shot, id, copy);
      }
    }
    k = end;
  }

  // Only what the shots show is kept: a set every run of it has its own
  // copy of is not sent.
  const used = new Set(
    built.flatMap(({ shot }) => [
      ...(assetOf(shot.set) ? [assetOf(shot.set)!] : []),
      ...shot.actors.map((a) => a.asset),
    ]),
  );
  for (const id of Object.keys(assets)) if (!used.has(id)) delete assets[id];

  // Each join as the shots stand: one set carried on is a continue; a
  // continue onto another set is a cut; the last hands over to the next
  // scene as the film's edit does.
  const shots = built.map(({ shot }, i) => {
    const next = built[i + 1]?.shot;
    const join: ShotJoin = !next
      ? 'cut'
      : sameSet(shot.set, next.set)
        ? 'continue'
        : shot.join === 'continue'
          ? 'cut'
          : shot.join;
    return { ...shot, join };
  });
  return { look, assets, shots, notes };
}
