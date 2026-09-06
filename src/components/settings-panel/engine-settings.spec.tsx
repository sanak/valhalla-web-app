import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EngineSettings } from './engine-settings';

const invalidateQueries = vi.fn();

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries }),
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

describe('EngineSettings', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    vi.stubEnv('VITE_ROUTING_MODE', 'server');
    vi.stubEnv('VITE_VALHALLA_TAR_URL', 'https://tiles.example/planet.tar');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('hides the tar url field in server mode', async () => {
    await renderOpened();

    expect(screen.getByRole('radio', { name: /browser/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/tar url/i)).not.toBeInTheDocument();
  });

  it('switches to wasm mode, resets the actor and reveals the tar url field', async () => {
    const user = await renderOpened();

    await user.click(screen.getByRole('radio', { name: /browser/i }));

    expect(localStorage.getItem('valhalla_routing_mode')).toBe('wasm');
    expect(resetActor).toHaveBeenCalled();
    expect(invalidateQueries).toHaveBeenCalled();
    expect(screen.getByLabelText(/tar url/i)).toBeInTheDocument();
  });

  it('rejects a per-tile url template', async () => {
    localStorage.setItem('valhalla_routing_mode', 'wasm');
    const user = await renderOpened();

    const tarUrlField = screen.getByLabelText(/tar url/i);
    await user.clear(tarUrlField);
    // user-event v14 treats `{...}` as a special-key descriptor, so the literal opening
    // brace has to be escaped by doubling it: `{{` types a single literal `{`.
    await user.type(tarUrlField, 'https://tiles.example/{{tilePath}');
    expect(tarUrlField).toHaveValue('https://tiles.example/{tilePath}');
    await user.tab();

    expect(
      await screen.findByText(/tar url, not a per-tile template/i)
    ).toBeInTheDocument();
    expect(localStorage.getItem('valhalla_tar_url')).toBeNull();
  });

  it('stores a valid tar url and resets the actor', async () => {
    localStorage.setItem('valhalla_routing_mode', 'wasm');
    const user = await renderOpened();

    const tarUrlField = screen.getByLabelText(/tar url/i);
    await user.clear(tarUrlField);
    await user.type(tarUrlField, 'https://other.example/region.tar');
    expect(tarUrlField).toHaveValue('https://other.example/region.tar');
    await user.tab();

    expect(localStorage.getItem('valhalla_tar_url')).toBe(
      'https://other.example/region.tar'
    );
    expect(resetActor).toHaveBeenCalled();
  });

  it('clears the tile cache on demand', async () => {
    localStorage.setItem('valhalla_routing_mode', 'wasm');
    const user = await renderOpened();

    await user.click(screen.getByRole('button', { name: /clear tile cache/i }));

    expect(clearTileCache).toHaveBeenCalled();
  });
});
