import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  requestRoute,
  requestIsochrone,
  requestHeight,
  requestStatus,
  ValhallaApiError,
  describeRoutingError,
  isAbortError,
} from './valhalla-client';
import { getActor } from '@/lib/valhalla-wasm/actor';

vi.mock('@/utils/valhalla', () => ({
  getValhallaUrl: () => 'https://valhalla.example',
  VALHALLA_CLIENT_HEADERS: { 'X-Client-Id': 'test-client' },
}));

vi.mock('@/lib/valhalla-wasm/actor', () => ({
  getActor: vi.fn(),
  resetActor: vi.fn(),
  clearTileCache: vi.fn(),
}));

const ROUTE_REQUEST = { locations: [], costing: 'auto' };

function mockResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe('valhalla-client (server mode)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubEnv('VITE_ROUTING_MODE', 'server');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('sends route as a GET with the request in the json param', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(mockResponse({ trip: {} }));

    await requestRoute(ROUTE_REQUEST);

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toBe(
      `https://valhalla.example/route?json=${encodeURIComponent(JSON.stringify(ROUTE_REQUEST))}`
    );
    expect(init?.method).toBeUndefined();
  });

  it('sends the client id header', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(mockResponse({ trip: {} }));

    await requestRoute(ROUTE_REQUEST);

    const [, init] = fetchSpy.mock.calls[0]!;
    expect(init?.headers).toMatchObject({ 'X-Client-Id': 'test-client' });
  });

  it('does not send a content-type on a GET', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(mockResponse({ trip: {} }));

    await requestRoute(ROUTE_REQUEST);

    const [, init] = fetchSpy.mock.calls[0]!;
    expect(init?.headers).not.toHaveProperty('Content-Type');
  });

  it('sends height as a POST with a json body', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(mockResponse({ height: [412] }));

    const heightRequest = { range: false, shape: [{ lat: 1, lon: 2 }] };
    await requestHeight(heightRequest);

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toBe('https://valhalla.example/height');
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe(JSON.stringify(heightRequest));
    expect(init?.headers).toMatchObject({ 'Content-Type': 'application/json' });
  });

  it('sends a plain status request with no query string', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(mockResponse({ version: '3.8.3' }));

    await requestStatus();

    expect(String(fetchSpy.mock.calls[0]![0])).toBe(
      'https://valhalla.example/status'
    );
  });

  it('sends verbose in the json param for a verbose status request', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(mockResponse({ version: '3.8.3' }));

    await requestStatus({ verbose: true });

    expect(String(fetchSpy.mock.calls[0]![0])).toBe(
      `https://valhalla.example/status?json=${encodeURIComponent('{"verbose":true}')}`
    );
  });

  it('maps a valhalla error body onto ValhallaApiError', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockResponse({ error: 'No path could be found', error_code: 442 }, 400)
    );

    await expect(requestRoute(ROUTE_REQUEST)).rejects.toMatchObject({
      name: 'ValhallaApiError',
      message: 'No path could be found',
      code: 442,
      httpCode: 400,
    });
  });

  it('falls back to a generic message when the error body is unparseable', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => {
        throw new Error('not json');
      },
    } as unknown as Response);

    await expect(requestRoute(ROUTE_REQUEST)).rejects.toMatchObject({
      message: 'Could not fetch resource',
      httpCode: 502,
    });
  });

  it('wraps a transport failure in ValhallaApiError', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      new TypeError('Failed to fetch')
    );

    await expect(requestRoute(ROUTE_REQUEST)).rejects.toMatchObject({
      name: 'ValhallaApiError',
      message: 'Failed to fetch',
    });
  });

  it('lets an aborted fetch through as a DOMException', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      new DOMException('Aborted', 'AbortError')
    );

    const abortion = await requestRoute(ROUTE_REQUEST).catch(
      (error: unknown) => error
    );

    expect(abortion).toBeInstanceOf(DOMException);
    expect(abortion).not.toBeInstanceOf(ValhallaApiError);
    expect(isAbortError(abortion)).toBe(true);
  });

  it('passes the abort signal through to fetch', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(mockResponse({ trip: {} }));
    const controller = new AbortController();

    await requestRoute(ROUTE_REQUEST, { signal: controller.signal });

    expect(fetchSpy.mock.calls[0]![1]?.signal).toBe(controller.signal);
  });
});

describe('describeRoutingError', () => {
  it('explains an out-of-coverage error', () => {
    const outOfCoverage = new ValhallaApiError(
      'No suitable edges near location',
      170
    );
    expect(describeRoutingError(outOfCoverage)).toMatch(/coverage/i);
  });

  it('appends route context to a 154', () => {
    const tooFar = new ValhallaApiError(
      'Path distance exceeds the max distance limit',
      154
    );
    expect(describeRoutingError(tooFar)).toBe(
      'Path distance exceeds the max distance limit for route.'
    );
  });

  it('passes any other valhalla message through', () => {
    expect(describeRoutingError(new ValhallaApiError('Bad request', 100))).toBe(
      'Bad request'
    );
  });

  it('adds tar host guidance when a tile fetch failed', () => {
    const tileFailure = new ValhallaApiError(
      "Couldn't read from https://tiles.example/region.tar with HTTP status 0"
    );
    expect(describeRoutingError(tileFailure)).toMatch(/Accept-Ranges/);
  });

  it('handles a plain Error', () => {
    expect(describeRoutingError(new Error('network down'))).toBe(
      'network down'
    );
  });

  it('handles a non-error', () => {
    expect(describeRoutingError('nope')).toBe('Could not fetch resource');
  });
});

describe('isAbortError', () => {
  it('is true for an AbortError DOMException', () => {
    expect(isAbortError(new DOMException('Aborted', 'AbortError'))).toBe(true);
  });

  it('is false for a ValhallaApiError', () => {
    expect(isAbortError(new ValhallaApiError('Bad request', 100))).toBe(false);
  });

  it('is false for a plain Error', () => {
    expect(isAbortError(new Error('network down'))).toBe(false);
  });

  it('is false for a non-error value', () => {
    expect(isAbortError('nope')).toBe(false);
  });
});

describe('valhalla-client (wasm mode)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubEnv('VITE_ROUTING_MODE', 'wasm');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('stringifies the request and parses the response', async () => {
    const route = vi
      .fn()
      .mockResolvedValue('{"trip":{"summary":{"length":3}}}');
    vi.mocked(getActor).mockResolvedValue({ route } as never);

    const routeResponse = await requestRoute(ROUTE_REQUEST);

    expect(route).toHaveBeenCalledWith(JSON.stringify(ROUTE_REQUEST));
    expect(routeResponse).toEqual({ trip: { summary: { length: 3 } } });
  });

  it('sends an empty object when there is no request payload', async () => {
    const status = vi.fn().mockResolvedValue('{"version":"3.8.3"}');
    vi.mocked(getActor).mockResolvedValue({ status } as never);

    await requestStatus();

    expect(status).toHaveBeenCalledWith('{}');
  });

  it('sends verbose for a verbose status request', async () => {
    const status = vi.fn().mockResolvedValue('{"version":"3.8.3"}');
    vi.mocked(getActor).mockResolvedValue({ status } as never);

    await requestStatus({ verbose: true });

    expect(status).toHaveBeenCalledWith('{"verbose":true}');
  });

  it('maps an upstream ValhallaError onto ValhallaApiError', async () => {
    const upstreamError = Object.assign(
      new Error('No suitable edges near location'),
      {
        name: 'ValhallaError',
        code: 170,
        httpCode: 400,
      }
    );
    const isochrone = vi.fn().mockRejectedValue(upstreamError);
    vi.mocked(getActor).mockResolvedValue({ isochrone } as never);

    await expect(requestIsochrone({})).rejects.toMatchObject({
      name: 'ValhallaApiError',
      code: 170,
      httpCode: 400,
    });
  });

  it('surfaces a boot failure as ValhallaApiError', async () => {
    vi.mocked(getActor).mockRejectedValue(
      new Error('Valhalla wasm artifacts are missing. Run `npm run wasm:sync`')
    );

    await expect(requestRoute(ROUTE_REQUEST)).rejects.toMatchObject({
      name: 'ValhallaApiError',
      message: expect.stringContaining('wasm:sync'),
    });
  });

  it('rejects with AbortError when the signal is already aborted', async () => {
    vi.mocked(getActor).mockResolvedValue({ route: vi.fn() } as never);
    const controller = new AbortController();
    controller.abort();

    await expect(
      requestRoute(ROUTE_REQUEST, { signal: controller.signal })
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('rejects with AbortError when the signal fires mid-flight', async () => {
    const controller = new AbortController();
    const route = vi.fn().mockReturnValue(new Promise(() => undefined));
    vi.mocked(getActor).mockResolvedValue({ route } as never);

    const pending = requestRoute(ROUTE_REQUEST, { signal: controller.signal });
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });
});
