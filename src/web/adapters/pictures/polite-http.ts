/**
 * The picture desk's one way out to the web (Wikimedia's robot policy,
 * research §3.4): one request at a time across every source, never more
 * than four a second, each with a User-Agent that names the app and how to
 * reach whoever runs it; a 429 or a 503 is waited out as the server asks
 * (Retry-After, at most ten seconds) and tried again twice; anything else
 * that fails is an error the desk turns into "no picture".
 */

/** How to reach whoever runs the app, for the User-Agent: a site or an address (PICTURES_CONTACT). */
export const DEFAULT_CONTACT = 'https://easiread.com';

export function userAgentOf(contact?: string | null): string {
  const reach = contact?.trim() || DEFAULT_CONTACT;
  return `EasyReadStudio-PictureDesk/1.0 (${reach}) node-fetch`;
}

export interface PoliteHttpOptions {
  userAgent: string;
  /** The least time between two requests' starts, in ms (250: four a second). */
  minGapMs?: number;
  timeoutMs?: number;
  /** Tries after the first, for a 429 or a 503. */
  retries?: number;
  /** The largest file it will take, in bytes. */
  maxBytes?: number;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export class PoliteHttp {
  private tail: Promise<unknown> = Promise.resolve();
  private lastStart = 0;
  private readonly minGapMs: number;
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly maxBytes: number;
  private readonly doFetch: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;

  constructor(private readonly opts: PoliteHttpOptions) {
    this.minGapMs = opts.minGapMs ?? 250;
    this.timeoutMs = opts.timeoutMs ?? 20_000;
    this.retries = opts.retries ?? 2;
    this.maxBytes = opts.maxBytes ?? 25 * 1024 * 1024;
    this.doFetch = opts.fetch ?? fetch;
    this.sleep =
      opts.sleep ?? ((ms) => new Promise((done) => setTimeout(done, ms)));
    this.now = opts.now ?? (() => Date.now());
  }

  /** A JSON answer. */
  async json<T>(url: string): Promise<T> {
    const response = await this.request(url, 'application/json');
    return (await response.json()) as T;
  }

  /** A file's bytes and its type, refused past the size limit. */
  async bytes(url: string): Promise<{ bytes: Buffer; mime: string }> {
    const response = await this.request(url, 'image/*');
    const length = Number(response.headers.get('content-length') ?? 0);
    if (length > this.maxBytes)
      throw new Error(`${url} is too big (${length} bytes)`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > this.maxBytes)
      throw new Error(`${url} is too big (${bytes.length} bytes)`);
    const mime = (response.headers.get('content-type') ?? '')
      .split(';')[0]
      .trim();
    return { bytes, mime };
  }

  /** One request, in its turn. */
  private request(url: string, accept: string): Promise<Response> {
    const run = async (): Promise<Response> => {
      for (let attempt = 0; ; attempt += 1) {
        const wait = this.lastStart + this.minGapMs - this.now();
        if (wait > 0) await this.sleep(wait);
        this.lastStart = this.now();
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);
        let response: Response;
        try {
          response = await this.doFetch(url, {
            headers: { 'User-Agent': this.opts.userAgent, Accept: accept },
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timer);
        }
        if (
          (response.status === 429 || response.status === 503) &&
          attempt < this.retries
        ) {
          const after = Number(response.headers.get('retry-after'));
          await this.sleep(
            Math.min(
              10_000,
              Number.isFinite(after) && after > 0
                ? after * 1000
                : 2000 * 2 ** attempt,
            ),
          );
          continue;
        }
        if (!response.ok)
          throw new Error(`${response.status} from ${new URL(url).host}`);
        return response;
      }
    };
    const turn = this.tail.then(run, run);
    this.tail = turn.catch(() => undefined);
    return turn;
  }
}
