import { z } from 'zod';

const MODE_STORAGE_KEY = 'valhalla_routing_mode';
const TILE_SOURCE_STORAGE_KEY = 'valhalla_tile_source';

/**
 * A tile URL containing this marker puts the bindings in per-tile mode (one file per tile);
 * anything else is a tar read by range request. Per-tile mode only keeps
 * `loki.use_connectivity` - and so the coverage outline - when an `index.bin` sits next to the
 * tiles.
 */
const PER_TILE_URL_MARKER = '{tilePath}';

/** Where wasm mode reads tiles from: valhalla's `mjolnir.tile_url` and `mjolnir.tile_url_gz`. */
export interface TileSource {
  url: string;
  gzipped: boolean;
}

const tileSourceSchema = z.object({
  url: z.string(),
  gzipped: z.boolean(),
});

export type RoutingMode = 'server' | 'wasm';

const routingModeSchema = z.enum(['server', 'wasm']);

const tileUrlSchema = z
  .string()
  .trim()
  .min(1, 'URL cannot be empty')
  .url('Invalid URL format')
  .refine(
    (url) => {
      try {
        const parsed = new URL(url);
        return ['http:', 'https:'].includes(parsed.protocol);
      } catch {
        return false;
      }
    },
    { message: 'URL must use HTTP or HTTPS protocol' }
  )
  .refine((url) => url.split(PER_TILE_URL_MARKER).length <= 2, {
    message: `${PER_TILE_URL_MARKER} may appear only once`,
  });

// read at call time, not module scope, so the default stays testable via vi.stubEnv
export function getDefaultRoutingMode(): RoutingMode {
  const parsed = routingModeSchema.safeParse(import.meta.env.VITE_ROUTING_MODE);
  return parsed.success ? parsed.data : 'server';
}

export function getRoutingMode(): RoutingMode {
  if (typeof window === 'undefined') {
    return getDefaultRoutingMode();
  }
  const parsed = routingModeSchema.safeParse(
    localStorage.getItem(MODE_STORAGE_KEY)
  );
  return parsed.success ? parsed.data : getDefaultRoutingMode();
}

export function setRoutingMode(mode: RoutingMode): void {
  if (typeof window === 'undefined') {
    return;
  }
  if (mode === getDefaultRoutingMode()) {
    localStorage.removeItem(MODE_STORAGE_KEY);
  } else {
    localStorage.setItem(MODE_STORAGE_KEY, mode);
  }
}

export function getDefaultTileSource(): TileSource {
  return {
    url: import.meta.env.VITE_VALHALLA_TILE_URL ?? '',
    gzipped: import.meta.env.VITE_VALHALLA_TILE_URL_GZ === 'true',
  };
}

function isSameTileSource(a: TileSource, b: TileSource): boolean {
  return a.url === b.url && a.gzipped === b.gzipped;
}

export function getTileSource(): TileSource {
  if (typeof window === 'undefined') {
    return getDefaultTileSource();
  }
  const storedSource = localStorage.getItem(TILE_SOURCE_STORAGE_KEY);
  if (storedSource === null) {
    return getDefaultTileSource();
  }
  try {
    const parsed = tileSourceSchema.safeParse(JSON.parse(storedSource));
    return parsed.success ? parsed.data : getDefaultTileSource();
  } catch {
    return getDefaultTileSource();
  }
}

/** An empty URL means "back to the env default", flag included. */
export function setTileSource(source: TileSource): void {
  if (typeof window === 'undefined') {
    return;
  }
  const trimmedSource = { url: source.url.trim(), gzipped: source.gzipped };
  if (
    trimmedSource.url === '' ||
    isSameTileSource(trimmedSource, getDefaultTileSource())
  ) {
    localStorage.removeItem(TILE_SOURCE_STORAGE_KEY);
  } else {
    localStorage.setItem(
      TILE_SOURCE_STORAGE_KEY,
      JSON.stringify(trimmedSource)
    );
  }
}

export function isPerTileUrl(url: string): boolean {
  return url.includes(PER_TILE_URL_MARKER);
}

export function validateTileUrl(url: string): {
  valid: boolean;
  error?: string;
} {
  const parsed = tileUrlSchema.safeParse(url);
  if (parsed.success) {
    return { valid: true };
  }
  return { valid: false, error: parsed.error.errors[0]?.message };
}
