/**
 * A rigged face (scene-face-rig) put into a drawing at a moment, as the
 * player puts it on the stage: for a still, a proof sheet, a check. Each
 * part the markup marked with its key (data-k) is given what faceParts
 * says for the channels, in every view's rigged face; the rigged face is
 * shown and the kit's swapped faces, its blink and the mouth's shapes are
 * hidden; the head is tilted and nodded as the face says, written in as
 * transforms, since a renderer that knows no CSS variables never turns
 * them.
 */
import type { SceneDto, SceneThingDto } from '../../contracts';
import {
  NEUTRAL_FACE,
  RECIPE_OF_FACE,
  faceAt,
  faceParts,
  geoOfAttr,
  recipeFace,
  type FaceChannels,
} from './scene-face-rig';

/** Whether a drawing has a face of moving parts. */
export const hasRigFace = (svg: string) => svg.includes('class="rf" data-rf="');

const r2 = (n: number) => Math.round(n * 100) / 100;

/** An opening tag with its attributes set as `set` says (the rest kept). */
function withAttrs(tag: string, set: Record<string, string>): string {
  const m = /^<([\w:-]+)([\s\S]*?)(\/?)>$/.exec(tag);
  if (!m) return tag;
  const [, name, rest, close] = m;
  const attrs: [string, string][] = [];
  for (const a of rest.matchAll(/([\w:-]+)="([^"]*)"/g))
    attrs.push([a[1], a[2]]);
  for (const [k, v] of Object.entries(set)) {
    const i = attrs.findIndex(([n]) => n === k);
    if (i >= 0) attrs[i] = [k, v];
    else attrs.push([k, v]);
  }
  return `<${name}${attrs.map(([k, v]) => ` ${k}="${v}"`).join('')}${close}>`;
}

/**
 * A drawing with each view's rigged face set to `c`, shown, and the kit's
 * swapped faces hidden: `faces`, their groups' ids (every view's). The
 * head tilted and nodded as the face says, about the neck.
 */
export function withRigFace(
  svg: string,
  c: FaceChannels,
  faces: readonly string[] = [],
): string {
  if (!hasRigFace(svg)) return svg;
  const marker = 'class="rf" data-rf="';
  const pieces = svg.split(marker);
  let out = pieces[0];
  for (let i = 1; i < pieces.length; i += 1) {
    const piece = pieces[i];
    const end = piece.indexOf('"');
    const geo = geoOfAttr(piece.slice(0, end));
    if (!geo) {
      out += marker + piece;
      continue;
    }
    const parts = faceParts(c, geo);
    out +=
      marker +
      piece.replace(
        /<[\w:-]+[^<>]*?data-k="([\w-]+)"[^<>]*?>/g,
        (tag, key: string) => (parts[key] ? withAttrs(tag, parts[key]) : tag),
      );
  }
  // The head's tilt and nod, as the rig's CSS turns it about the neck.
  const neck =
    /\.hd\{transform-box:view-box;transform-origin:0 (-?[\d.]+)px/.exec(
      out,
    )?.[1];
  if (
    neck !== undefined &&
    (Math.abs(c.tilt) > 0.05 || Math.abs(c.down) > 0.05)
  ) {
    const turn = `translate(0 ${r2(c.down)}) rotate(${r2(c.tilt)} 0 ${neck})`;
    out = out.replace(
      /<g class="(hd|fm)">/g,
      (_, cls: string) => `<g data-rig="${cls}" transform="${turn}">`,
    );
  }
  const hide = faces.length
    ? `${faces.map((id) => `[id="${id.replace(/"/g, '')}"]`).join(',')}{display:none}`
    : '';
  // Last, so over the drawing's own style, which hides the rigged face.
  const at = out.lastIndexOf('</svg>');
  return `${out.slice(0, at)}<style>.rf{display:inline}.blink,.mouths{display:none}${hide}</style>${out.slice(at)}`;
}

/** Every group of a drawing's faces (the kit's swapped ones), in every view. */
export function faceGroupsOf(
  thing: Extract<SceneThingDto, { kind: 'drawing' }>,
): string[] {
  const views = ['', '--3q', '--profile', '--back3q', '--back'];
  return Object.entries(thing.states)
    .filter(([name]) => RECIPE_OF_FACE[name])
    .flatMap(([, id]) => views.map((v) => `${id}${v}`));
}

/** The mouth's shape someone speaks with at `t` (0 to 5), from their acting's shapes at 30 a second; null when they are not speaking. */
export function shapeAt(
  mouth: readonly [number, string][] | undefined,
  t: number,
): number | null {
  for (const [at, shapes] of mouth ?? []) {
    const f = Math.floor(((t - at) * 30) / 1000);
    if (f >= 0 && f < shapes.length) return Number(shapes[f]);
  }
  return null;
}

/**
 * Someone's face at `t` in a scene, as the player has it: the face they
 * wear then (the one shown last of the kit's faces), what is acted over
 * it, their blinks and the shapes of what they say.
 */
export function faceInScene(
  scene: SceneDto,
  id: string,
  t: number,
): FaceChannels {
  let worn = 'neutral';
  const cues: number[] = [];
  for (const e of [...scene.effects].sort((a, b) => a.atMs - b.atMs)) {
    if (e.target !== id || !e.part || !RECIPE_OF_FACE[e.part]) continue;
    if (e.atMs > t) break;
    if (e.do === 'show') {
      if (worn !== e.part) cues.push(e.atMs);
      worn = e.part;
    }
  }
  const acting = scene.acting?.[id];
  return faceAt({
    seed: id,
    t,
    base: recipeFace(RECIPE_OF_FACE[worn] ?? 'neutral'),
    track: acting?.face,
    cues,
    shape: shapeAt(acting?.mouth, t),
  });
}

export { NEUTRAL_FACE };
