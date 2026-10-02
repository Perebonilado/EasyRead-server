/**
 * Depth Anything V2 Small on onnxruntime-node (Apache-2.0; Richard
 * approved the download, 2026-10-02): a picture's depth map, white near,
 * for the stage's planes. The model is read from DEPTH_MODEL_PATH; where
 * that file is absent (a fresh production worker) it is downloaded once
 * from Hugging Face into the cache folder and its sha256 checked before
 * it is ever loaded. One session, made on first use and kept, on two
 * threads (the worker shares its machine). Any failure is no map, never a
 * stuck film: the picture is then one plane.
 */
import { createHash } from 'node:crypto';
import { createReadStream, promises as fs } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { PNG } from 'pngjs';
import {
  DEPTH_MODEL,
  depthGrey,
  depthInputSize,
  depthTensor,
} from '../../../business/domain/pictures/depth';
import type { DepthPort } from '../../../business/ports/pictures.port';
import { measureImage } from './measure';
import { pixelsAt } from './resvg-pixels.adapter';

/** Where the model lives when DEPTH_MODEL_PATH says nothing. */
export const DEFAULT_DEPTH_MODEL_PATH = join(
  homedir(),
  '.cache/easyread/models/depth-anything-v2-small/onnx/model.onnx',
);

/** onnxruntime-node's few parts used here (it is loaded only when depth is on). */
interface OrtTensor {
  data: Float32Array | ArrayLike<number>;
  dims: readonly number[];
}
interface OrtSession {
  inputNames: readonly string[];
  outputNames: readonly string[];
  run(feeds: Record<string, unknown>): Promise<Record<string, OrtTensor>>;
}
interface Ort {
  InferenceSession: {
    create(
      path: string,
      options?: Record<string, unknown>,
    ): Promise<OrtSession>;
  };
  Tensor: new (type: 'float32', data: Float32Array, dims: number[]) => unknown;
}

async function sha256Of(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path))
    hash.update(chunk as Buffer);
  return hash.digest('hex');
}

export interface OnnxDepthOptions {
  modelPath?: string;
  /** For a model that is not there yet: fetches its bytes (the app's polite client, or plain fetch). */
  download?: (url: string) => Promise<Buffer>;
  log?: (message: string) => void;
  threads?: number;
}

export class OnnxDepthAdapter implements DepthPort {
  private session: Promise<{ ort: Ort; session: OrtSession }> | null = null;
  private readonly modelPath: string;

  constructor(private readonly opts: OnnxDepthOptions = {}) {
    this.modelPath = opts.modelPath?.trim() || DEFAULT_DEPTH_MODEL_PATH;
  }

  /** The model on disk and checked: downloaded and verified first when it is missing. */
  private async model(): Promise<string> {
    const present = await fs.stat(this.modelPath).then(
      (s) => s.size === DEPTH_MODEL.bytes,
      () => false,
    );
    if (present) return this.modelPath;
    if (!this.opts.download)
      throw new Error(`no depth model at ${this.modelPath}`);
    this.opts.log?.(
      `pictures: downloading the depth model to ${this.modelPath}`,
    );
    const bytes = await this.opts.download(DEPTH_MODEL.url);
    const sum = createHash('sha256').update(bytes).digest('hex');
    if (sum !== DEPTH_MODEL.sha256)
      throw new Error(
        `the depth model's sha256 is ${sum}, not ${DEPTH_MODEL.sha256}`,
      );
    await fs.mkdir(dirname(this.modelPath), { recursive: true });
    const partial = `${this.modelPath}.part`;
    await fs.writeFile(partial, bytes);
    await fs.rename(partial, this.modelPath);
    return this.modelPath;
  }

  private load(): Promise<{ ort: Ort; session: OrtSession }> {
    this.session ??= (async () => {
      const path = await this.model();
      // Checked every time it is loaded: a model swapped on disk is never run.
      const sum = await sha256Of(path);
      if (sum !== DEPTH_MODEL.sha256)
        throw new Error(`the depth model at ${path} is not the one approved`);
      const ort = (await import('onnxruntime-node')) as unknown as Ort;
      const session = await ort.InferenceSession.create(path, {
        executionProviders: ['cpu'],
        graphOptimizationLevel: 'all',
        intraOpNumThreads: this.opts.threads ?? 2,
        interOpNumThreads: 1,
      });
      return { ort, session };
    })();
    this.session.catch(() => {
      // A failed load is tried again next time (the file may have arrived).
      this.session = null;
    });
    return this.session;
  }

  async depthOf(
    bytes: Buffer,
  ): Promise<{ png: Buffer; width: number; height: number } | null> {
    const size = measureImage(bytes);
    if (!size) return null;
    const { ort, session } = await this.load();
    const input = depthInputSize(size.width, size.height);
    const pixels = pixelsAt(bytes, size.mime, input.width, input.height);
    const tensor = new ort.Tensor('float32', depthTensor(pixels), [
      1,
      3,
      input.height,
      input.width,
    ]);
    const out = await session.run({ [session.inputNames[0]]: tensor });
    const predicted = out[session.outputNames[0]];
    const dims = predicted.dims;
    const height = dims[dims.length - 2];
    const width = dims[dims.length - 1];
    const grey = depthGrey(predicted.data, width, height);
    const png = new PNG({
      width,
      height,
      colorType: 0,
      inputColorType: 0,
      bitDepth: 8,
    });
    png.data = Buffer.from(grey);
    return {
      png: PNG.sync.write(png, { colorType: 0, inputColorType: 0 }),
      width,
      height,
    };
  }
}
