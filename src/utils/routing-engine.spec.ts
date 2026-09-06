import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getDefaultRoutingMode,
  getRoutingMode,
  setRoutingMode,
  getTarUrl,
  setTarUrl,
  validateTarUrl,
} from './routing-engine';

const MODE_KEY = 'valhalla_routing_mode';
const TAR_KEY = 'valhalla_tar_url';
const DEFAULT_TAR = 'https://tiles.example/planet.tar';
const CUSTOM_TAR = 'https://other.example/region.tar';

describe('routing-engine', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubEnv('VITE_ROUTING_MODE', 'server');
    vi.stubEnv('VITE_VALHALLA_TAR_URL', DEFAULT_TAR);
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

  describe('getTarUrl', () => {
    it('returns the default when nothing is stored', () => {
      expect(getTarUrl()).toBe(DEFAULT_TAR);
    });

    it('prefers the stored url', () => {
      localStorage.setItem(TAR_KEY, CUSTOM_TAR);
      expect(getTarUrl()).toBe(CUSTOM_TAR);
    });
  });

  describe('setTarUrl', () => {
    it('trims and stores a custom url', () => {
      setTarUrl(`  ${CUSTOM_TAR}  `);
      expect(localStorage.getItem(TAR_KEY)).toBe(CUSTOM_TAR);
    });

    it('removes the key when the url matches the default', () => {
      localStorage.setItem(TAR_KEY, CUSTOM_TAR);
      setTarUrl(DEFAULT_TAR);
      expect(localStorage.getItem(TAR_KEY)).toBeNull();
    });

    it('removes the key when the url is empty', () => {
      localStorage.setItem(TAR_KEY, CUSTOM_TAR);
      setTarUrl('');
      expect(localStorage.getItem(TAR_KEY)).toBeNull();
    });
  });

  describe('validateTarUrl', () => {
    it('accepts an https url', () => {
      expect(validateTarUrl(DEFAULT_TAR).valid).toBe(true);
    });

    it('rejects an empty url', () => {
      expect(validateTarUrl('  ').valid).toBe(false);
    });

    it('rejects a non-http protocol', () => {
      expect(validateTarUrl('ftp://tiles.example/planet.tar').valid).toBe(
        false
      );
    });

    it('rejects a per-tile url template', () => {
      const validation = validateTarUrl('https://tiles.example/{tilePath}');
      expect(validation.valid).toBe(false);
      expect(validation.error).toMatch(/tar/i);
    });
  });
});
