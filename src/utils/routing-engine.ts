import { z } from 'zod';

const MODE_STORAGE_KEY = 'valhalla_routing_mode';
const TAR_URL_STORAGE_KEY = 'valhalla_tar_url';

/**
 * A tile URL containing this marker puts the bindings in per-tile mode, where
 * `loki.use_connectivity` is force-disabled because there is no index to enumerate. This app
 * needs connectivity for out-of-coverage detection, so only a tar is accepted.
 */
const PER_TILE_URL_MARKER = '{tilePath}';

export type RoutingMode = 'server' | 'wasm';

const routingModeSchema = z.enum(['server', 'wasm']);

const tarUrlSchema = z
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
  .refine((url) => !url.includes(PER_TILE_URL_MARKER), {
    message: 'Must be a tar URL, not a per-tile template',
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

export function getDefaultTarUrl(): string {
  return import.meta.env.VITE_VALHALLA_TAR_URL ?? '';
}

export function getTarUrl(): string {
  if (typeof window === 'undefined') {
    return getDefaultTarUrl();
  }
  return localStorage.getItem(TAR_URL_STORAGE_KEY) ?? getDefaultTarUrl();
}

export function setTarUrl(url: string): void {
  if (typeof window === 'undefined') {
    return;
  }
  const trimmedUrl = url.trim();
  if (trimmedUrl === '' || trimmedUrl === getDefaultTarUrl()) {
    localStorage.removeItem(TAR_URL_STORAGE_KEY);
  } else {
    localStorage.setItem(TAR_URL_STORAGE_KEY, trimmedUrl);
  }
}

export function validateTarUrl(url: string): {
  valid: boolean;
  error?: string;
} {
  const parsed = tarUrlSchema.safeParse(url);
  if (parsed.success) {
    return { valid: true };
  }
  return { valid: false, error: parsed.error.errors[0]?.message };
}
