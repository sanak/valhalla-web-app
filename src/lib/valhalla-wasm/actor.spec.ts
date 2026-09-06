import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getActor, resetActor } from './actor';

const mockTarUrl = vi.fn<() => string>();

vi.mock('@/utils/routing-engine', () => ({
  getTarUrl: () => mockTarUrl(),
}));

describe('getActor', () => {
  beforeEach(() => {
    resetActor();
    vi.clearAllMocks();
  });

  it('names the missing configuration instead of failing inside the tile getter', async () => {
    mockTarUrl.mockReturnValue('');

    await expect(getActor()).rejects.toThrow(
      /No tileset tar URL is configured/
    );
  });

  it('does not cache the failed boot', async () => {
    mockTarUrl.mockReturnValue('   ');

    await expect(getActor()).rejects.toThrow(/tar URL/);
    await expect(getActor()).rejects.toThrow(/tar URL/);
    expect(mockTarUrl).toHaveBeenCalledTimes(2);
  });
});
