/**
 * A scene of shots as one still, for its card (SceneProcessor.thumb): the
 * first shot that shows a drawn set, framed on its subject as the camera
 * frames it, on the look's paper, the full frame of the scene's shape.
 * Rendered by resvg on the server; the stills the frames work package
 * captures from the player replace it when they land.
 *
 * Pure: a scene gives the same still every time.
 */
import type {
  SceneDto,
  ShotBox,
  ShotDto,
  ShotSvgAssetDto,
} from '../../../contracts';

/** Room round the subject, as a share of it: the camera never frames tight to the edge. */
const PADDING = 0.12;

/** The frame's optical centre sits a little above its middle. */
const OPTICAL_Y = 0.47;

/** The box a shot frames on its set: its subject's, else the set's own subject, else all of it. */
function framed(shot: ShotDto, asset: ShotSvgAssetDto): ShotBox {
  const focal = shot.focal;
  if (focal?.kind === 'box') return focal.box;
  if (focal?.kind === 'asset' && focal.part && asset.parts[focal.part])
    return asset.parts[focal.part].box;
  return asset.focal ?? asset.box;
}

const r1 = (n: number) => Math.round(n * 100) / 100;

/**
 * The still of a scene of shots: an SVG the size of its stage, its first
 * drawn set laid in as the camera frames it. Paper alone when no shot
 * shows a drawn set (a scene of photos, before the picture desk).
 */
export function shotsThumbSvg(scene: SceneDto): string {
  const { w: W, h: H } = scene.stagings.wide;
  const look = scene.shots?.look;
  const paper = look?.palette.paper ?? '#FBF7EF';
  const head = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="${paper}"/>`;
  for (const shot of scene.shots?.shots ?? []) {
    const id = 'asset' in shot.set ? shot.set.asset : null;
    const asset = id ? scene.shots?.assets[id] : undefined;
    if (asset?.kind !== 'svg') continue;
    const [x, y, w, h] = framed(shot, asset);
    const pw = Math.max(1, w * (1 + 2 * PADDING));
    const ph = Math.max(1, h * (1 + 2 * PADDING));
    const s = Math.min(W / pw, H / ph);
    const tx = W / 2 - s * (x + w / 2);
    const ty = H * OPTICAL_Y - s * (y + h / 2);
    const inner = asset.svg
      .replace(/^\s*<svg\b[^>]*>/, '')
      .replace(/<\/svg>\s*$/, '');
    return `${head}<g transform="translate(${r1(tx)} ${r1(ty)}) scale(${Math.round(s * 10000) / 10000})">${inner}</g></svg>`;
  }
  return `${head}</svg>`;
}
