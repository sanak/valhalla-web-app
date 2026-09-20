import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { TileSource } from '@/utils/routing-engine';
import { getActor, getCacheDir, resetActor } from './actor';

const mockTileSource = vi.fn<() => TileSource>();

vi.mock('@/utils/routing-engine', () => ({
  getTileSource: () => mockTileSource(),
}));

describe('getActor', () => {
  beforeEach(() => {
    resetActor();
    vi.clearAllMocks();
  });

  it('names the missing configuration instead of failing inside the tile getter', async () => {
    mockTileSource.mockReturnValue({ url: '', gzipped: false });

    await expect(getActor()).rejects.toThrow(/No tileset URL is configured/);
  });

  it('does not cache the failed boot', async () => {
    mockTileSource.mockReturnValue({ url: '   ', gzipped: false });

    await expect(getActor()).rejects.toThrow(/tileset URL/);
    await expect(getActor()).rejects.toThrow(/tileset URL/);
    expect(mockTileSource).toHaveBeenCalledTimes(2);
  });
});

describe('getCacheDir', () => {
  const tarUrl = 'https://tiles.example/valhalla_tiles.tar';

  it('is stable for the same tile source', () => {
    expect(getCacheDir({ url: tarUrl, gzipped: true })).toBe(
      getCacheDir({ url: tarUrl, gzipped: true })
    );
  });

  it('separates sources by url and by gz flag', () => {
    const cacheDirs = new Set([
      getCacheDir({ url: tarUrl, gzipped: false }),
      getCacheDir({ url: tarUrl, gzipped: true }),
      getCacheDir({ url: 'https://tiles.example/{tilePath}', gzipped: false }),
    ]);
    expect(cacheDirs.size).toBe(3);
  });

  it('stays under the shared prefix clearTileCache sweeps', () => {
    expect(getCacheDir({ url: tarUrl, gzipped: false })).toMatch(
      /^\/valhalla-cache-[0-9a-f]{8}$/
    );
  });
});
