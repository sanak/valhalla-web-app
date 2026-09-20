import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getDefaultRoutingMode,
  getRoutingMode,
  setRoutingMode,
  getDefaultTileSource,
  getTileSource,
  setTileSource,
  isPerTileUrl,
  validateTileUrl,
} from './routing-engine';

const MODE_KEY = 'valhalla_routing_mode';
const SOURCE_KEY = 'valhalla_tile_source';
const DEFAULT_TAR = 'https://tiles.example/planet.tar';
const CUSTOM_TAR = 'https://other.example/region.tar';
const PER_TILE_URL = 'https://tiles.example/tiles/{tilePath}';

describe('routing-engine', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubEnv('VITE_ROUTING_MODE', 'server');
    vi.stubEnv('VITE_VALHALLA_TILE_URL', DEFAULT_TAR);
    vi.stubEnv('VITE_VALHALLA_TILE_URL_GZ', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('getDefaultRoutingMode', () => {
    it('falls back to server when the env var is unset', () => {
      vi.stubEnv('VITE_ROUTING_MODE', '');
      expect(getDefaultRoutingMode()).toBe('server');
    });

    it('falls back to server when the env var is not a known mode', () => {
      vi.stubEnv('VITE_ROUTING_MODE', 'nonsense');
      expect(getDefaultRoutingMode()).toBe('server');
    });

    it('honours wasm', () => {
      vi.stubEnv('VITE_ROUTING_MODE', 'wasm');
      expect(getDefaultRoutingMode()).toBe('wasm');
    });
  });

  describe('getRoutingMode', () => {
    it('returns the default when nothing is stored', () => {
      expect(getRoutingMode()).toBe('server');
    });

    it('prefers the stored mode', () => {
      localStorage.setItem(MODE_KEY, 'wasm');
      expect(getRoutingMode()).toBe('wasm');
    });

    it('ignores a corrupt stored value', () => {
      localStorage.setItem(MODE_KEY, 'nonsense');
      expect(getRoutingMode()).toBe('server');
    });
  });

  describe('setRoutingMode', () => {
    it('stores a non-default mode', () => {
      setRoutingMode('wasm');
      expect(localStorage.getItem(MODE_KEY)).toBe('wasm');
    });

    it('removes the key when the mode matches the default', () => {
      localStorage.setItem(MODE_KEY, 'wasm');
      setRoutingMode('server');
      expect(localStorage.getItem(MODE_KEY)).toBeNull();
    });
  });

  describe('getDefaultTileSource', () => {
    it('reads the url and treats an unset gz flag as plain tiles', () => {
      expect(getDefaultTileSource()).toEqual({
        url: DEFAULT_TAR,
        gzipped: false,
      });
    });

    it('honours a true gz flag', () => {
      vi.stubEnv('VITE_VALHALLA_TILE_URL_GZ', 'true');
      expect(getDefaultTileSource().gzipped).toBe(true);
    });
  });

  describe('getTileSource', () => {
    it('returns the default when nothing is stored', () => {
      expect(getTileSource()).toEqual({ url: DEFAULT_TAR, gzipped: false });
    });

    it('prefers the stored source', () => {
      const storedSource = { url: CUSTOM_TAR, gzipped: true };
      localStorage.setItem(SOURCE_KEY, JSON.stringify(storedSource));
      expect(getTileSource()).toEqual(storedSource);
    });

    it.each(['not json', '{"url":"https://x.example/a.tar"}'])(
      'ignores a corrupt stored value %s',
      (corruptValue) => {
        localStorage.setItem(SOURCE_KEY, corruptValue);
        expect(getTileSource()).toEqual({ url: DEFAULT_TAR, gzipped: false });
      }
    );
  });

  describe('setTileSource', () => {
    it('trims and stores a custom source', () => {
      setTileSource({ url: `  ${CUSTOM_TAR}  `, gzipped: true });
      expect(JSON.parse(localStorage.getItem(SOURCE_KEY) ?? '')).toEqual({
        url: CUSTOM_TAR,
        gzipped: true,
      });
    });

    it('stores the default url when only the gz flag differs', () => {
      setTileSource({ url: DEFAULT_TAR, gzipped: true });
      expect(getTileSource()).toEqual({ url: DEFAULT_TAR, gzipped: true });
    });

    it('removes the key when the source matches the default', () => {
      setTileSource({ url: CUSTOM_TAR, gzipped: true });
      setTileSource({ url: DEFAULT_TAR, gzipped: false });
      expect(localStorage.getItem(SOURCE_KEY)).toBeNull();
    });

    it('removes the key when the url is empty', () => {
      setTileSource({ url: CUSTOM_TAR, gzipped: true });
      setTileSource({ url: '', gzipped: true });
      expect(localStorage.getItem(SOURCE_KEY)).toBeNull();
    });
  });

  describe('isPerTileUrl', () => {
    it('tells a per-tile template from a tar', () => {
      expect(isPerTileUrl(PER_TILE_URL)).toBe(true);
      expect(isPerTileUrl(DEFAULT_TAR)).toBe(false);
    });
  });

  describe('validateTileUrl', () => {
    it('accepts an https tar url', () => {
      expect(validateTileUrl(DEFAULT_TAR).valid).toBe(true);
    });

    it('accepts a per-tile url template', () => {
      expect(validateTileUrl(PER_TILE_URL).valid).toBe(true);
    });

    it('rejects a template with the marker twice', () => {
      const validation = validateTileUrl(
        'https://tiles.example/{tilePath}/{tilePath}'
      );
      expect(validation.valid).toBe(false);
      expect(validation.error).toMatch(/only once/);
    });

    it('rejects an empty url', () => {
      expect(validateTileUrl('  ').valid).toBe(false);
    });

    it('rejects a non-http protocol', () => {
      expect(validateTileUrl('ftp://tiles.example/planet.tar').valid).toBe(
        false
      );
    });
  });
});
