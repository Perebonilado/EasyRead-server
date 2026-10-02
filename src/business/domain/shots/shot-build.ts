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
import { chartAsset } from './shot-charts';
import { featureCentre, type ShotMapSet } from './shot-map';
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
 * The faces the player loads, as its stage sets them (the client's
 * lib/scene/theme.ts STAGE_FONT and TITLE_FONTS): the reading face for
 * every word, and the theme's display face for numbers and titles.
 */
const TEXT_FACE =
  'var(--font-jakarta), "Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif';
const DISPLAY_FACE: Record<ExplainerTheme['font'], string> = {
  jakarta: TEXT_FACE,
  rounded: `ui-rounded, "SF Pro Rounded", "Nunito", ${TEXT_FACE}`,
  'serif-display': 'ui-serif, "New York", Georgia, "Times New Roman", serif',
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

// ── The registry, as the build reads it ──────────────────────────────────

/**
 * A scene's stored registry entries as a TargetRegistry: a name as the
 * board wrote it ("place:Kano"), the same in other case or accents, or
 * without its kind ("Kano") where only one entry has that name.
 */
export function registryFrom(
  entries: readonly RegistryEntry[],
): TargetRegistry {
  const list = [...entries];
  const exact = new Map(list.map((e) => [e.name, e]));
  const keyed = new Map<string, RegistryEntry>();
  const bare = new Map<string, RegistryEntry[]>();
  for (const entry of list) {
    const key = nameKey(entry.name);
    if (!keyed.has(key)) keyed.set(key, entry);
    const own = nameKey(entry.name.replace(/^[a-z]+:/i, ''));
    bare.set(own, [...(bare.get(own) ?? []), entry]);
  }
  return {
    entries: () => list,
    resolve: (name) => {
      if (!name) return null;
      const found = exact.get(name) ?? keyed.get(nameKey(name));
      if (found) return found;
      const only = bare.get(nameKey(name.replace(/^[a-z]+:/i, '')));
      return only?.length === 1 ? only[0] : null;
    },
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

/** A map's tilt when the plan asks for one and the map can tilt (a geo map): the brief's 45–55°, steep enough to read as ground. */
export const MAP_TILT = 50;

/** A place pinned on a drawn map is this share of the map's shorter side across. */
const PLACE_BOX_SHARE = 0.03;

/**
 * The least the camera shows round what it is aimed at, as a share of
 * its set's shorter side: a place is a point, and framed alone it would
 * fill the frame with a dot. A third of the map round it says where it is.
 */
const CAMERA_CONTEXT_SHARE = 0.3;

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

/** Whether the show's map has a part (a drawn map) or a feature (a geo map) of this id. */
function mapHas(map: ShotMapSet, id: string): boolean {
  if (map.asset.kind === 'svg') return Boolean(map.asset.parts[id]);
  return (
    map.asset.features.features as { properties?: { id?: unknown } }[]
  ).some((one) => one.properties?.id === id);
}

/** A part of the show's map as a target: a drawn map's part, a geo map's feature. */
function mapPart(map: ShotMapSet, id: string): ShotTargetDto {
  return map.asset.kind === 'svg'
    ? { kind: 'asset', asset: map.id, part: id }
    : { kind: 'feature', asset: map.id, id };
}

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
          planned.chart.spec ?? {},
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
    /** The map the player draws itself: places stay points on the earth, regions and seams its features. */
    const geoMap = onMap && onMap.asset.kind === 'geo' ? onMap : null;
    const assetId = assetOf(shotSet.set);
    /** The set's own box, in its units: a drawing's viewBox, a geo map's frame in Web Mercator pixels. */
    const setBox: ShotBox | null = svg?.box ?? geoMap?.box ?? null;

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
      if (target?.kind === 'feature' && geoMap) {
        const middle = featureCentre(geoMap, target.id);
        if (middle) return { lng: middle[0], lat: middle[1] };
      }
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
      if (geoMap && target.kind !== 'actor')
        return geoMap.boxOf?.(target) ?? null;
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
        (entry.feature && mapHas(onMap, entry.feature.id)
          ? entry.feature.id
          : null) ?? partNamed(entry.name);
      if (part) return mapPart(onMap, part);
      if (!entry.geo) return null;
      if (!onMap.project || onMap.asset.kind !== 'svg') {
        // A geo map has land as far as its sea reaches: a place past it is off the map.
        const reach = onMap.geoBoxes?.sea;
        const { lng, lat } = entry.geo;
        if (
          reach &&
          (lng < reach[0] || lng > reach[2] || lat < reach[1] || lat > reach[3])
        )
          return null;
        return { kind: 'geo', lng, lat };
      }
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
     * What a name points at in this shot: a part of its set, one of its
     * actors, or what the registry says it is, on this set. A place is
     * only ever on the map; a person, a photo or a document is a set of
     * its own (WP11), never something pointed at in words; a claim is
     * what a shot rests on, not what it shows.
     */
    function targetOf(name: string | undefined): ShotTargetDto | null {
      if (!name) return null;
      const bare = name.replace(/^(?:part|actor):/i, '').trim();
      if (svg && assetId && svg.parts[bare])
        return { kind: 'asset', asset: assetId, part: bare };
      if (geoMap && mapHas(geoMap, bare)) return mapPart(geoMap, bare);
      if (actorIds.has(bare)) return { kind: 'actor', actor: bare };
      const entry = registry.resolve(name);
      if (!entry) {
        const part = partNamed(name);
        return part && onMap ? mapPart(onMap, part) : null;
      }
      switch (entry.kind) {
        case 'place':
          return placeOnMap(entry);
        case 'region':
        case 'seam':
        case 'route': {
          if (!onMap) return null;
          const part =
            (entry.feature && mapHas(onMap, entry.feature.id)
              ? entry.feature.id
              : null) ?? partNamed(entry.name);
          return part ? mapPart(onMap, part) : null;
        }
        case 'number': {
          if (!svg || !assetId) return null;
          const part =
            Object.keys(svg.parts).find(
              (p) =>
                entry.value !== undefined && svg.parts[p].value === entry.value,
            ) ?? (svg.parts.number ? 'number' : null);
          return part ? { kind: 'asset', asset: assetId, part } : null;
        }
        case 'part':
        case 'actor':
          return targetOf(entry.name.replace(/^[a-z]+:/i, ''));
        default:
          return null;
      }
    }

    // The information layer: each piece on a target that resolves, its
    // words from the plan or, for a label, the name the research gives it.
    const info: UntimedInfo[] = [];
    (planned.info ?? []).forEach((one: PlanInfo, k) => {
      const target = targetOf(one.target);
      if (one.recipe !== 'ask' && !target) {
        notes.push(
          `shot ${i + 1}: ${one.recipe} on "${one.target ?? ''}" dropped (nothing on this set to point at)`,
        );
        return;
      }
      const to = one.to ? targetOf(one.to) : null;
      if (one.recipe === 'transfer' && !to) {
        notes.push(
          `shot ${i + 1}: transfer to "${one.to ?? ''}" dropped (nowhere to go)`,
        );
        return;
      }
      const entry = one.target ? registry.resolve(one.target) : null;
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
      const colour = one.colour ? sideOf(one.colour) : null;
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
        ...(one.until ? { until: one.until } : {}),
      });
    });

    /**
     * What the camera is aimed at, with room round it: a point or a small
     * box (a place) widened to a share of its set, kept inside the set.
     */
    function inContext(target: ShotTargetDto): ShotTargetDto {
      if (target.kind !== 'box' || !svg) return target;
      const [bx, by, bw, bh] = svg.box;
      const least = Math.min(bw, bh) * CAMERA_CONTEXT_SHARE;
      const [, , w, h] = target.box;
      if (w >= least && h >= least) return target;
      const W = Math.max(w, least);
      const H = Math.max(h, least);
      const [cx, cy] = centre(target.box);
      const x0 = Math.max(bx, Math.min(bx + bw - W, cx - W / 2));
      const y0 = Math.max(by, Math.min(by + bh - H, cy - H / 2));
      const r = (n: number) => Math.round(n * 10) / 10;
      return { kind: 'box', box: [r(x0), r(y0), r(W), r(H)] };
    }

    // The camera: each move on what it names, with room round it, or the
    // shot's subject when what it names is not on this set; a travel as
    // long as its distance from where the camera was.
    const named = planned.focal ? targetOf(planned.focal) : null;
    const moves = (planned.camera ?? ([] as PlanCamera[])).map((one) => {
      const target = one.target ? targetOf(one.target) : null;
      if (one.target && !target)
        notes.push(
          `shot ${i + 1}: ${one.move} on "${one.target}" frames the subject instead`,
        );
      return { one, target: target ? inContext(target) : null };
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
      (focal ? boxOf(focal) : null) ?? carried ?? svg?.focal ?? setBox ?? null;
    const camera: UntimedCamera[] = safeMove ? [safeMove] : [];
    for (const { one, target } of moves) {
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
        ...(one.move === 'travel' && from && to && setBox
          ? { durMs: travelMs(from, to, setBox[2]) }
          : {}),
      });
      if (to) from = to;
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
