/**
 * Fetching a user-supplied URL, treated as the hostile input it is.
 *
 * This is the server reaching out to an address a stranger typed, so every
 * request goes through one gate: scheme checked, hostname resolved *here*,
 * the resolved address vetted against private ranges, and the connection made
 * to that vetted IP — never re-resolved by the socket layer, which is what
 * closes the classic rebinding hole (resolve public, connect private).
 * Redirects re-enter the gate from the top.
 *
 * Node's own fetch is deliberately not used: it resolves internally, which
 * would mean vetting one address and connecting to another.
 */
import { lookup } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';
import { request as httpRequest } from 'node:http';
import { isIP } from 'node:net';

export interface FetchedPage {
  /** Where the content actually came from, after redirects. */
  finalUrl: string;
  html: string;
  contentType: string;
}

export class UnsafeUrlError extends Error {}
export class FetchFailedError extends Error {}

const MAX_REDIRECTS = 3;
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;

/** Ranges the server must never connect to on a user's behalf. */
export function isPublicIp(ip: string): boolean {
  if (isIP(ip) === 4) {
    const parts = ip.split('.').map(Number);
    const [a, b] = parts;
    if (parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return false;
    if (a === 0 || a === 10 || a === 127) return false;
    if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT
    if (a === 169 && b === 254) return false; // link-local / cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 192 && b === 0) return false; // 192.0.0.0/24 special use
    if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
    if (a >= 224) return false; // multicast + reserved
    return true;
  }

  if (isIP(ip) === 6) {
    const lower = ip.toLowerCase();
    if (lower === '::' || lower === '::1') return false;
    if (lower.startsWith('fe80:')) return false; // link-local
    if (lower.startsWith('fc') || lower.startsWith('fd')) return false; // ULA
    if (lower.startsWith('::ffff:')) {
      // IPv4-mapped: vet the embedded IPv4 instead.
      return isPublicIp(lower.slice('::ffff:'.length));
    }
    if (lower.startsWith('2002:')) return false; // 6to4 can smuggle v4
    return true;
  }

  return false;
}

/** http(s) only, and never a literal private address. */
export function assertSafeUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError('That is not a valid URL');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new UnsafeUrlError('Only http and https URLs can be imported');
  }
  if (url.username || url.password) {
    throw new UnsafeUrlError('URLs with credentials cannot be imported');
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host) && !isPublicIp(host)) {
    throw new UnsafeUrlError('That address is not reachable from here');
  }
  return url;
}

/** Resolve to a vetted, public IPv4 (preferred) or IPv6 address. */
async function resolvePublic(hostname: string): Promise<string> {
  if (isIP(hostname)) {
    if (!isPublicIp(hostname)) {
      throw new UnsafeUrlError('That address is not reachable from here');
    }
    return hostname;
  }

  const addresses: { address: string; family: number }[] = await lookup(
    hostname,
    { all: true },
  ).catch(() => []);
  if (!addresses.length) {
    throw new FetchFailedError(`Could not resolve ${hostname}`);
  }
  // Every address must be public: a name that resolves to both a public and
  // a private address is exactly the rebinding trick this exists to stop.
  if (!addresses.every((entry) => isPublicIp(entry.address))) {
    throw new UnsafeUrlError('That address is not reachable from here');
  }
  const v4 = addresses.find((entry) => entry.family === 4);
  return (v4 ?? addresses[0]).address;
}

function requestOnce(
  url: URL,
  ip: string,
  options: { timeoutMs: number; maxBytes: number },
): Promise<{
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
}> {
  return new Promise((resolve, reject) => {
    const isHttps = url.protocol === 'https:';
    const make = isHttps ? httpsRequest : httpRequest;

    const req = make(
      {
        host: ip,
        servername: isHttps ? url.hostname : undefined,
        port: url.port || (isHttps ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method: 'GET',
        headers: {
          Host: url.hostname,
          'User-Agent':
            'EasiReadImporter/1.0 (+https://easiread.com; imports docs a reader asked for)',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.5',
          'Accept-Language': 'en',
        },
        timeout: options.timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        let received = 0;
        res.on('data', (chunk: Buffer) => {
          received += chunk.length;
          if (received > options.maxBytes) {
            req.destroy();
            reject(new FetchFailedError('That page is too large to import'));
            return;
          }
          chunks.push(chunk);
        });
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks),
          }),
        );
        res.on('error', reject);
      },
    );

    req.on('timeout', () => {
      req.destroy();
      reject(new FetchFailedError('That page took too long to respond'));
    });
    req.on('error', (error) => reject(new FetchFailedError(error.message)));
    req.end();
  });
}

/**
 * The gate itself: resolve, vet, fetch, and re-enter on every redirect — a
 * public page redirecting to http://169.254.169.254/ dies here. Returns raw
 * bytes; the text and binary wrappers below choose the interpretation.
 */
async function safeFetchBytes(
  raw: string,
  options: { timeoutMs?: number; maxBytes?: number } = {},
): Promise<{ finalUrl: string; bytes: Buffer; contentType: string }> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;

  let url = assertSafeUrl(raw);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const ip = await resolvePublic(url.hostname);
    const response = await requestOnce(url, ip, { timeoutMs, maxBytes });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.location;
      const target = Array.isArray(location) ? location[0] : location;
      if (!target) throw new FetchFailedError('Redirect with no destination');
      url = assertSafeUrl(new URL(target, url).toString());
      continue;
    }

    if (response.status !== 200) {
      throw new FetchFailedError(`The page answered ${response.status}`);
    }

    const contentType = String(response.headers['content-type'] ?? '');
    return { finalUrl: url.toString(), bytes: response.body, contentType };
  }

  throw new FetchFailedError('Too many redirects');
}

/** Fetch one page as text. */
export async function safeFetch(
  raw: string,
  options: { timeoutMs?: number; maxBytes?: number } = {},
): Promise<FetchedPage> {
  const result = await safeFetchBytes(raw, options);
  return {
    finalUrl: result.finalUrl,
    html: result.bytes.toString('utf8'),
    contentType: result.contentType,
  };
}

/** Fetch a figure or other binary, through the same gate. */
export async function safeFetchBinary(
  raw: string,
  options: { timeoutMs?: number; maxBytes?: number } = {},
): Promise<{ finalUrl: string; bytes: Buffer; contentType: string }> {
  return safeFetchBytes(raw, { maxBytes: 4 * 1024 * 1024, ...options });
}
