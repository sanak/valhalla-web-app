import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EngineSettings } from './engine-settings';

const invalidateQueries = vi.fn();
const resetQueries = vi.fn();

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries, resetQueries }),
}));

vi.mock('@/lib/valhalla-wasm/actor', () => ({
  resetActor: vi.fn(),
  clearTileCache: vi.fn().mockResolvedValue(undefined),
}));

import { resetActor, clearTileCache } from '@/lib/valhalla-wasm/actor';

/**
 * `CollapsibleSection` unmounts its children while closed, so every test needs the section
 * opened before it can query for controls inside it.
 */
const renderOpened = async () => {
  const user = userEvent.setup();
  render(<EngineSettings />);
  await user.click(screen.getByRole('button', { name: /routing engine/i }));
  return user;
};

const storedTileSource = (): unknown => {
  const storedSource = localStorage.getItem('valhalla_tile_source');
  return storedSource === null ? null : JSON.parse(storedSource);
};

describe('EngineSettings', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    vi.stubEnv('VITE_ROUTING_MODE', 'server');
    vi.stubEnv('VITE_VALHALLA_TILE_URL', 'https://tiles.example/planet.tar');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('hides the tile url field in server mode', async () => {
    await renderOpened();

    expect(screen.getByRole('radio', { name: /browser/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/tile url/i)).not.toBeInTheDocument();
  });

  it('switches to wasm mode, resets the actor and reveals the tile url field', async () => {
    const user = await renderOpened();

    await user.click(screen.getByRole('radio', { name: /browser/i }));

    expect(localStorage.getItem('valhalla_routing_mode')).toBe('wasm');
    expect(resetActor).toHaveBeenCalled();
    expect(invalidateQueries).toHaveBeenCalled();
    expect(screen.getByLabelText(/tile url/i)).toBeInTheDocument();
  });

  it('resets the cached tileset coverage on a mode change', async () => {
    localStorage.setItem('valhalla_routing_mode', 'wasm');
    const user = await renderOpened();

    await user.click(screen.getByRole('radio', { name: /remote server/i }));

    // invalidating is not enough: the coverage query is disabled in server mode, and a disabled
    // query keeps handing back its cached value without notifying observers
    expect(resetQueries).toHaveBeenCalledWith({
      queryKey: ['tilesetCoverage'],
    });
  });

  it('stores a per-tile url template', async () => {
    localStorage.setItem('valhalla_routing_mode', 'wasm');
    const user = await renderOpened();

    const tileUrlField = screen.getByLabelText(/tile url/i);
    await user.clear(tileUrlField);
    // user-event v14 treats `{...}` as a special-key descriptor, so the literal opening
    // brace has to be escaped by doubling it: `{{` types a single literal `{`.
    await user.type(tileUrlField, 'https://tiles.example/tiles/{{tilePath}');
    expect(tileUrlField).toHaveValue('https://tiles.example/tiles/{tilePath}');
    await user.tab();

    expect(storedTileSource()).toEqual({
      url: 'https://tiles.example/tiles/{tilePath}',
      gzipped: false,
    });
    expect(resetActor).toHaveBeenCalled();
  });

  it('rejects an invalid url without storing it', async () => {
    localStorage.setItem('valhalla_routing_mode', 'wasm');
    const user = await renderOpened();

    const tileUrlField = screen.getByLabelText(/tile url/i);
    await user.clear(tileUrlField);
    await user.type(tileUrlField, 'ftp://tiles.example/planet.tar');
    await user.tab();

    expect(await screen.findByText(/http or https/i)).toBeInTheDocument();
    expect(storedTileSource()).toBeNull();
  });

  it('stores a valid tar url and resets the actor', async () => {
    localStorage.setItem('valhalla_routing_mode', 'wasm');
    const user = await renderOpened();

    const tileUrlField = screen.getByLabelText(/tile url/i);
    await user.clear(tileUrlField);
    await user.type(tileUrlField, 'https://other.example/region.tar');
    expect(tileUrlField).toHaveValue('https://other.example/region.tar');
    await user.tab();

    expect(storedTileSource()).toEqual({
      url: 'https://other.example/region.tar',
      gzipped: false,
    });
    expect(resetActor).toHaveBeenCalled();
  });

  it('stores the gz flag with the current url and resets the actor', async () => {
    localStorage.setItem('valhalla_routing_mode', 'wasm');
    const user = await renderOpened();

    await user.click(screen.getByRole('switch', { name: /gzipped tiles/i }));

    expect(storedTileSource()).toEqual({
      url: 'https://tiles.example/planet.tar',
      gzipped: true,
    });
    expect(resetActor).toHaveBeenCalled();
  });

  it('resets to the env default when the tar url field is emptied', async () => {
    localStorage.setItem('valhalla_routing_mode', 'wasm');
    localStorage.setItem(
      'valhalla_tile_source',
      JSON.stringify({ url: 'https://other.example/region.tar', gzipped: true })
    );
    const user = await renderOpened();

    const tileUrlField = screen.getByLabelText(/tile url/i);
    await user.clear(tileUrlField);
    await user.tab();

    expect(storedTileSource()).toBeNull();
    expect(tileUrlField).toHaveValue('https://tiles.example/planet.tar');
    expect(
      screen.getByRole('switch', { name: /gzipped tiles/i })
    ).not.toBeChecked();
    expect(screen.queryByText(/cannot be empty/i)).not.toBeInTheDocument();
    expect(resetActor).toHaveBeenCalled();
  });

  it('clears the tile cache on demand', async () => {
    localStorage.setItem('valhalla_routing_mode', 'wasm');
    const user = await renderOpened();

    await user.click(screen.getByRole('button', { name: /clear tile cache/i }));

    expect(clearTileCache).toHaveBeenCalled();
  });
});
