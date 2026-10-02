/**
 * The shots engine's server-side types (explainer-animation-tech.md §4).
 *
 * The board (GPT-5.4 mini) writes a ShotPlan for each lesson scene: shots
 * anchored to the exact words that cause them, every name from a closed
 * list or from the scene's target registry. It never writes a coordinate,
 * a time or a colour. Code then checks the plan (shot-check), builds its
 * assets (shot-build), times it on the voice's words (shot-time), adds the
 * sounds its motion makes (shot-sound) and composes the ShotSceneDto the
 * client plays (shot-compose).
 */
import type {
  ShotCameraMove,
  ShotInfoRecipe,
  ShotJoin,
  ShotLifeEffect,
} from '../../../contracts';

/** The board's plan for one scene. */
export interface ShotPlan {
  shots: PlanShot[];
}

/** One shot as the board writes it. Names are target names (see TargetRegistry) or closed-list ids. */
export interface PlanShot {
  /** The exact words of the scene's narration the shot starts on. */
  on: string;
  set: PlanSet;
  actors: PlanActor[];
  info: PlanInfo[];
  life: ShotLifeEffect[];
  camera: PlanCamera[];
  /** How it hands over to the next shot. */
  join: ShotJoin;
  /** The target the shot is about; the camera frames it when no move says otherwise. */
  focal?: string;
  /** Eyes on regions of the map, each glancing at another (an illustrated show's, sparingly). */
  eyes?: PlanEyes[];
}

/** A pair of eyes on a region of the map (`at`), glancing toward `to`, with brows for a feeling. */
export interface PlanEyes {
  at: string;
  to?: string;
  face?: 'calm' | 'angry' | 'worried' | 'surprised';
}

export type PlanSet =
  | {
      kind: 'map';
      style?: 'atlas' | 'relief' | 'night';
      /** Degrees from straight down; the board says flat or tilted, code picks the angle. */
      tilt?: 'flat' | 'tilted';
      terrain?: boolean;
    }
  | {
      kind: 'photo';
      photo: string;
      treatment?: 'natural' | 'duotone' | 'halftone' | 'cutout';
    }
  | { kind: 'portrait'; person: string }
  | { kind: 'document'; document: string }
  | { kind: 'set'; set: PlanSetScene }
  | { kind: 'chart'; chart: PlanChart }
  /** A device's screen on the UI kit's desk (WP18): the devices and the cursor are the shot's actors. */
  | { kind: 'screen' }
  | { kind: 'plain' };

/** A code-drawn set: a kind of place, never a named one (kit/sets). */
export interface PlanSetScene {
  land:
    | 'plain'
    | 'hills'
    | 'mountains'
    | 'coast'
    | 'desert'
    | 'forest'
    | 'city'
    | 'sea';
  time: 'day' | 'dusk' | 'night' | 'dawn';
  weather?: 'clear' | 'cloud' | 'rain' | 'snow' | 'storm' | 'haze';
  /** Townscape density and era, when there are buildings. */
  town?: 'none' | 'village' | 'town' | 'city';
  era?: string;
  /** What the place is for, which sets what stands in it; the last two are places of their own. */
  place?:
    | 'open'
    | 'farm'
    | 'port'
    | 'industry'
    | 'market'
    | 'city'
    | 'oilfield'
    | 'assembly-hall'
    | 'ceremony-ground'
    | 'display';
  /** The climate its buildings are built for (never a country): from the land when absent. */
  climate?: 'temperate' | 'arid' | 'tropical' | 'cold';
  /** The light changing while the shot is on (the sun setting, the lights coming on), on the words that say so. */
  becomes?: { state: 'day' | 'dusk' | 'night' | 'dawn' | 'lights-on'; on: string };
  /** It stands for a real event or a real kind of moment: it carries an "Illustration" tag. */
  illustration?: boolean;
}

/**
 * A chart, timeline, counter or other code kind, drawn full frame with
 * named parts (shots/shot-charts.ts). `kind` is one of the code kinds;
 * `spec` is that kind's own fields, as the scene writer's schema has them.
 */
export interface PlanChart {
  kind: string;
  spec: Record<string, unknown>;
}

/** A kit piece on the set (kit/registry). */
export interface PlanActor {
  /** The shot's own name for it, so info, camera and moves can point at it. */
  id: string;
  /** A kit id, e.g. "people.silhouette.walking", "vehicle.ship.steam". */
  kit: string;
  params?: Record<string, string | number | boolean>;
  /** Where it stands: a target name (a place on the map, a part of the set) or a position word. */
  place?: string;
  /** A side's name from the visual system, for its colour. */
  side?: string;
  /**
   * Its moves on their words, each to a target; a cursor's (the UI kit's)
   * also with the state its click leaves a part in (or a slider's value),
   * and the words it types.
   */
  moves?: {
    move: string;
    on: string;
    to?: string;
    state?: string;
    text?: string;
  }[];
}

export interface PlanInfo {
  recipe: ShotInfoRecipe;
  target?: string;
  to?: string;
  on: string;
  until?: string;
  text?: string;
  value?: number;
  from?: number;
  unit?: string;
  colour?: string;
  replace?: string;
}

export interface PlanCamera {
  move: ShotCameraMove;
  target?: string;
  on: string;
  /** A push's or a pull's size: small, medium or large; code turns it into a fraction. */
  amount?: 'small' | 'medium' | 'large';
}

/** What a target name can stand for. */
export type TargetKind =
  | 'place'
  | 'person'
  | 'number'
  | 'region'
  | 'seam'
  | 'route'
  | 'photo'
  | 'document'
  | 'part'
  | 'actor'
  | 'claim'
  /** A side of the show's visual system: a colour by the name of what it colours. */
  | 'side'
  /** A dated event of the research's timeline: what a timeline or a calendar may show. */
  | 'date';

/** One entry of a scene's target registry: what the board may name, and what it resolves to. */
export interface RegistryEntry {
  /** The name the board uses, e.g. "place:Kano", "person:Herbert Macaulay", "number:c12". */
  name: string;
  kind: TargetKind;
  /** A few words for the board's prompt. */
  about: string;
  /** The research claim it rests on, when it is a fact. */
  claim?: string;
  geo?: { lng: number; lat: number };
  /** A feature of the scene's geo asset: a region, a seam, a route, a pin. */
  feature?: { asset: string; id: string };
  /**
   * A picture the picture desk cleared (photos, portraits, documents):
   * its id at the desk and its chip's words; then (WP11) what the build
   * makes its image asset of, kept on the stored registry so the make
   * needs nothing but the sheet.
   */
  picture?: {
    asset: string;
    credit: string;
    /** Our copy, relative to the API's origin ("api/v1/studio/pictures/<id>"), its size and its subject's box in its pixels. */
    url?: string;
    width?: number;
    height?: number;
    focal?: [number, number, number, number];
    /** Its depth map (white near), when one was made. */
    depthUrl?: string;
    licence?: string;
    /** The chip's middle: who made or holds it. */
    source?: string;
    /** The file's page at its source. */
    sourceUrl?: string;
    /** The full credit for the description. */
    fullCredit?: string;
    kind?: 'photo' | 'portrait' | 'document';
    year?: number;
    /** No colour of its own: it may take the show's ink and paper. */
    mono?: boolean;
    /** Its own content inside its scan's border, in its pixels. */
    crop?: [number, number, number, number];
    /** A portrait's person: their years and who they were (three words at most). */
    dates?: string;
    role?: string;
  };
  value?: number;
  unit?: string;
  /** Wikidata's id for a person, place or thing, when known. */
  qid?: string;
  /** Every research claim it rests on (a person's, a number's), the first of them `claim`. */
  claims?: string[];
  /**
   * What may stand for a person with no picture (research §3.5's traces
   * ladder): their own words (a quote claim, by id) or their place on the
   * map (a place's name in this registry). Absent with no picture, the
   * person is never on screen.
   */
  trace?: { kind: 'quote' | 'place'; ref: string };
  /** A region's or a side's colour, a theme token (scene-palette). */
  colour?: string;
  /** Where its claim comes from, for a chart's source line: the first source's title. */
  source?: string;
  /** Other names it is known by, for a name the board writes another way ("the North"). */
  aliases?: string[];
  /** A person's described likeness from the look notes: an illustrated show draws their character from it. */
  likeness?: string;
  /**
   * What a photo entry shows (Richard, 2026-10-02: real pictures first, the
   * map only for geography): a person (another photo of them), a place, a
   * thing or an event, by its name in this registry where it has one (a
   * person's or a place's), else the research's words. The board cuts to
   * it when the voice names what it shows, and the stand-in takes it first.
   */
  shows?: { kind: 'person' | 'place' | 'thing' | 'event'; name: string };
}

/** What the board may name in a scene, built from the research log, the world, the show map and the picture desk. */
export interface TargetRegistry {
  entries(): RegistryEntry[];
  resolve(name: string): RegistryEntry | null;
}

/** A problem a check found in a plan or a timed scene, with the shot it is in. */
export interface ShotProblem {
  shot: number;
  code: string;
  /** In plain words, for the board's second try and for the logs. */
  message: string;
}
