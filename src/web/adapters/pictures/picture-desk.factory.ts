/**
 * The picture desk put together from its parts and the settings, for the
 * API and the worker (ports.providers) and for scripts:
 *   PICTURES_CONTACT   how Wikimedia can reach whoever runs the app (the
 *                      User-Agent; a site or an address the team reads);
 *   PICTURE_DEPTH      'on' (the default) makes a depth map of each picture
 *                      for the stage's planes; 'off', one plane;
 *   DEPTH_MODEL_PATH   where Depth Anything V2 Small is (downloaded there
 *                      once and checked when it is missing);
 *   PICTURE_FOCUS      'on' (the default) asks a model that sees where a
 *                      picture's faces and subject are (picture_focus,
 *                      AI_MODEL_PICTURE_FOCUS), once a picture; 'off', the
 *                      middle third a little high.
 *   PICTURE_LICENCE    'off' (the default; Richard, 2026-10-02) takes any
 *                      file its sources hold, under the licence they name,
 *                      credited as ever; 'on', the licence and provenance
 *                      screen (public domain, CC0 and CC BY only, no agency
 *                      or magazine files).
 */
import { PictureDesk } from '../../../business/domain/pictures/desk';
import { licenceModeOf } from '../../../business/domain/pictures/licence';
import type { PictureCacheRepository } from '../../../business/repositories/picture-cache.repository';
import type { LlmGatewayPort } from '../../../business/ports/llm.port';
import type { StoragePort } from '../../../business/ports/storage.port';
import { OnnxDepthAdapter } from './onnx-depth.adapter';
import { PictureSourcesAdapter } from './picture-sources.adapter';
import { userAgentOf } from './polite-http';
import { ResvgPixelsAdapter } from './resvg-pixels.adapter';

/** Whether a switch that is on by default is on: anything but off. */
const switchOn = (value: string | undefined | null) =>
  !/^(?:off|false|0|no)$/iu.test((value ?? '').trim());

/** Whether depth maps are made: on unless switched off. */
export const depthSwitchOn = switchOn;

export function pictureDeskOf(input: {
  setting: (name: string) => string | undefined;
  cache: PictureCacheRepository;
  storage: Pick<StoragePort, 'put' | 'size' | 'get'>;
  /** A model that sees, for where a picture's subject is (picture_focus); none, the middle third. */
  llm?: Pick<LlmGatewayPort, 'pictureFocus'> | null;
  log?: (message: string) => void;
}): PictureDesk {
  const contact = input.setting('PICTURES_CONTACT');
  const sources = new PictureSourcesAdapter({ contact });
  const depth = depthSwitchOn(input.setting('PICTURE_DEPTH'))
    ? new OnnxDepthAdapter({
        modelPath: input.setting('DEPTH_MODEL_PATH'),
        // The model is a hundred megabytes, past the desk's file limit: fetched once, plainly, with the app's name.
        download: async (url) => {
          const response = await fetch(url, {
            headers: { 'User-Agent': userAgentOf(contact) },
          });
          if (!response.ok)
            throw new Error(`${response.status} for the depth model`);
          return Buffer.from(await response.arrayBuffer());
        },
        ...(input.log ? { log: input.log } : {}),
      })
    : null;
  const llm = input.llm;
  return new PictureDesk({
    sources,
    cache: input.cache,
    storage: input.storage,
    pixels: new ResvgPixelsAdapter(),
    depth,
    focus:
      llm && switchOn(input.setting('PICTURE_FOCUS'))
        ? (ask) => llm.pictureFocus(ask)
        : null,
    licence: licenceModeOf(input.setting('PICTURE_LICENCE')),
    ...(input.log ? { log: input.log } : {}),
  });
}
