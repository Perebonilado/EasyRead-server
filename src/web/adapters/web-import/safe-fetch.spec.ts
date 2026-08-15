import { assertSafeUrl, isPublicIp, UnsafeUrlError } from './safe-fetch';

/**
 * The fetcher is the one gate between "a stranger typed a URL" and "our
 * server opened a connection", so the vetting logic is pinned down here.
 * The dangerous direction is under-blocking; every classic SSRF target in
 * these lists came from a real incident writeup somewhere.
 */
describe('isPublicIp', () => {
  it('rejects every private and special-use IPv4 range', () => {
    for (const ip of [
      '127.0.0.1',
      '10.0.0.8',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.1.1',
      '169.254.169.254', // cloud metadata, the SSRF jackpot
      '100.64.0.1',
      '0.0.0.0',
      '224.0.0.1',
      '255.255.255.255',
      '198.18.0.1',
    ]) {
      expect(isPublicIp(ip)).toBe(false);
    }
  });

  it('rejects loopback, link-local and mapped IPv6', () => {
    for (const ip of [
      '::1',
      '::',
      'fe80::1',
      'fd12:3456::1',
      '::ffff:192.168.1.1',
      '::ffff:169.254.169.254',
      '2002:c0a8:101::', // 6to4 wrapping 192.168.1.1
    ]) {
      expect(isPublicIp(ip)).toBe(false);
    }
  });

  it('accepts ordinary public addresses', () => {
    expect(isPublicIp('104.16.7.34')).toBe(true);
    expect(isPublicIp('8.8.8.8')).toBe(true);
    expect(isPublicIp('2606:4700::6810:722')).toBe(true);
  });
});

describe('assertSafeUrl', () => {
  it('refuses non-http schemes', () => {
    for (const url of [
      'file:///etc/passwd',
      'ftp://example.com/docs',
      'gopher://example.com/',
      'javascript:alert(1)',
    ]) {
      expect(() => assertSafeUrl(url)).toThrow(UnsafeUrlError);
    }
  });

  it('refuses literal private addresses and credentials', () => {
    expect(() => assertSafeUrl('http://127.0.0.1/admin')).toThrow(
      UnsafeUrlError,
    );
    expect(() =>
      assertSafeUrl('http://169.254.169.254/latest/meta-data'),
    ).toThrow(UnsafeUrlError);
    expect(() => assertSafeUrl('http://[::1]/')).toThrow(UnsafeUrlError);
    expect(() => assertSafeUrl('https://user:pass@example.com/')).toThrow(
      UnsafeUrlError,
    );
  });

  it('accepts an ordinary docs URL', () => {
    expect(assertSafeUrl('https://docs.example.com/guide/intro').hostname).toBe(
      'docs.example.com',
    );
  });
});
