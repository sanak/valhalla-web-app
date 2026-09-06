import type {
  ValhallaHeightResponse,
  ValhallaIsochroneResponse,
  ValhallaOptimizedRouteResponse,
  ValhallaRouteResponse,
  ValhallaStatusResponse,
} from '@/components/types';
import { normalizeBaseUrl } from './base-url';
import { getRoutingMode } from './routing-engine';
import { getValhallaUrl, VALHALLA_CLIENT_HEADERS } from './valhalla';

/**
 * The single failure type both backends collapse into. The HTTP service reports failures as a
 * `{error, error_code}` body; the wasm bindings throw an object carrying `message`/`code`/
 * `httpCode`. Callers see neither shape.
 */
export class ValhallaApiError extends Error {
  readonly code?: number;
  readonly httpCode?: number;

  constructor(message: string, code?: number, httpCode?: number) {
    super(message);
    this.name = 'ValhallaApiError';
    this.code = code;
    this.httpCode = httpCode;
  }
}

export interface CallOptions {
  signal?: AbortSignal;
}

/** Action names match the upstream wasm bindings; the HTTP paths do not. */
export type ValhallaAction =
  | 'route'
  | 'isochrone'
  | 'optimizedRoute'
  | 'height'
  | 'status';

const SERVER_PATHS: Record<ValhallaAction, string> = {
  route: 'route',
  isochrone: 'isochrone',
  optimizedRoute: 'optimized_route',
  height: 'height',
  status: 'status',
};

async function callServer<T>(
  action: ValhallaAction,
  request: unknown,
  options?: CallOptions
): Promise<T> {
  const baseUrl = normalizeBaseUrl(getValhallaUrl());
  let url = `${baseUrl}/${SERVER_PATHS[action]}`;
  const init: RequestInit = {
    signal: options?.signal,
    headers: { ...VALHALLA_CLIENT_HEADERS },
  };

  if (action === 'height') {
    init.method = 'POST';
    init.headers = {
      ...VALHALLA_CLIENT_HEADERS,
      'Content-Type': 'application/json',
    };
    init.body = JSON.stringify(request);
  } else if (request !== undefined) {
    url += `?${new URLSearchParams({ json: JSON.stringify(request) })}`;
  }

  const response = await fetch(url, init);

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new ValhallaApiError(
      errorBody.error ?? 'Could not fetch resource',
      errorBody.error_code,
      response.status
    );
  }

  return response.json() as Promise<T>;
}

/* eslint-disable @typescript-eslint/no-unused-vars -- signature is wired up in task 5 */
async function callWasm<T>(
  action: ValhallaAction,
  request: unknown,
  options?: CallOptions
): Promise<T> {
  throw new ValhallaApiError('WebAssembly routing is not wired up yet');
}
/* eslint-enable @typescript-eslint/no-unused-vars */

function call<T>(
  action: ValhallaAction,
  request: unknown,
  options?: CallOptions
): Promise<T> {
  return getRoutingMode() === 'wasm'
    ? callWasm<T>(action, request, options)
    : callServer<T>(action, request, options);
}

export function requestRoute(request: unknown, options?: CallOptions) {
  return call<ValhallaRouteResponse>('route', request, options);
}

export function requestIsochrone(request: unknown, options?: CallOptions) {
  return call<ValhallaIsochroneResponse>('isochrone', request, options);
}

export function requestOptimizedRoute(request: unknown, options?: CallOptions) {
  return call<ValhallaOptimizedRouteResponse>(
    'optimizedRoute',
    request,
    options
  );
}

export function requestHeight(request: unknown, options?: CallOptions) {
  return call<ValhallaHeightResponse>('height', request, options);
}

export function requestStatus(options?: CallOptions & { verbose?: boolean }) {
  return call<ValhallaStatusResponse>(
    'status',
    options?.verbose ? { verbose: true } : undefined,
    options
  );
}

/**
 * True for a cancelled request. Both backends signal cancellation the same way: `fetch` rejects
 * with a `DOMException` named `AbortError` when its signal fires, and the wasm bindings' `callWasm`
 * (wired up in task 5) rejects with the same shape. Callers use this to distinguish "the user
 * triggered a newer request" from a genuine failure.
 */
export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

/** Turns a failure into the sentence a user should read. */
export function describeRoutingError(error: unknown): string {
  if (!(error instanceof ValhallaApiError)) {
    return error instanceof Error ? error.message : 'Could not fetch resource';
  }
  // 170: the locations sit in disconnected regions of the graph, which for a limited-area
  // tileset almost always means "outside what this tar covers"
  if (error.code === 170) {
    return 'The selected locations are outside the coverage of the loaded tileset.';
  }
  if (error.code === 154) {
    return `${error.message} for route.`;
  }
  // the tile getter reports an unreachable tar as a bare message with no error_code, and a CORS
  // rejection arrives the same way, so the host requirements are the useful thing to say
  if (error.message.includes("Couldn't read from")) {
    return `${error.message}. Check that the tar host sends Accept-Ranges, allows the Range request header via CORS, and exposes Content-Range.`;
  }
  return error.message;
}
