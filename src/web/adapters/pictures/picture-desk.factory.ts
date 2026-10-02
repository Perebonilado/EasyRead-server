/**
 * The picture desk put together from its parts and the settings, for the
 * API and the worker (ports.providers) and for scripts:
 *   PICTURES_CONTACT   how Wikimedia can reach whoever runs the app (the
 *                      User-Agent; a site or an address the team reads);
 *   PICTURE_DEPTH      'on' (the default) makes a depth map of each picture
 *                      for the stage's planes; 'off', one plane;
 *   DEPTH_MODEL_PATH   where Depth Anything V2 Small is (downloaded there
 *                      once and checked when it is missing).
 */
import { PictureDesk } from '../../../business/domain/pictures/desk';
import type { PictureCacheRepository } from '../../../business/repositories/picture-cache.repository';
import type { StoragePort } from '../../../business/ports/storage.port';
import { OnnxDepthAdapter } from './onnx-depth.adapter';
import { PictureSourcesAdapter } from './picture-sources.adapter';
import { userAgentOf } from './polite-http';
import { ResvgPixelsAdapter } from './resvg-pixels.adapter';

/** Whether depth maps are made: on unless switched off. */
export const depthSwitchOn = (value: string | undefined | null) =>
  !/^(?:off|false|0|no)$/iu.test((value ?? '').trim());

export function pictureDeskOf(input: {
  setting: (name: string) => string | undefined;
  cache: PictureCacheRepository;
  storage: Pick<StoragePort, 'put' | 'size' | 'get'>;
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
  return new PictureDesk({
    sources,
    cache: input.cache,
    storage: input.storage,
    pixels: new ResvgPixelsAdapter(),
    depth,
    ...(input.log ? { log: input.log } : {}),
  });
}
