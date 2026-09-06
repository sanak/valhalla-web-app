import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CoverageArea } from '@/components/map/parts/coverage-area';
import { COVERAGE_QUERY_KEY } from './use-coverage-query';

vi.mock('react-map-gl/maplibre', () => ({
  Source: ({ id, children }: { id: string; children: React.ReactNode }) => (
    <div data-testid={`source-${id}`}>{children}</div>
  ),
  Layer: ({ id }: { id: string }) => <div data-testid={`layer-${id}`} />,
}));

vi.mock('@/utils/valhalla-client', () => ({ requestStatus: vi.fn() }));

const TAR_URL = 'https://tiles.example/region.tar';

const COVERAGE: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [9.5, 47.0],
            [9.75, 47.0],
            [9.75, 47.25],
            [9.5, 47.0],
          ],
        ],
      },
    },
  ],
};

/**
 * The overlay outliving a switch back to server mode was a real bug: `enabled` gates fetching,
 * not cache reads, and the coverage is cached with `staleTime`/`gcTime` of Infinity. Both halves
 * of the fix are exercised here - the settings panel resetting the cached coverage (which is
 * what notifies the observer at all) and `CoverageArea` re-checking the mode when it re-renders.
 */
describe('tileset coverage across a mode switch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem('valhalla_routing_mode', 'wasm');
    localStorage.setItem('valhalla_tar_url', TAR_URL);
  });

  it('drops the overlay when the backend is switched back to the server', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData([COVERAGE_QUERY_KEY, TAR_URL], COVERAGE);

    render(
      <QueryClientProvider client={queryClient}>
        <CoverageArea />
      </QueryClientProvider>
    );
    expect(screen.getByTestId('source-tileset-coverage')).toBeInTheDocument();

    // what EngineSettings' rebootBackend does on a mode change
    localStorage.setItem('valhalla_routing_mode', 'server');
    await queryClient.resetQueries({ queryKey: [COVERAGE_QUERY_KEY] });

    await waitFor(() =>
      expect(
        screen.queryByTestId('source-tileset-coverage')
      ).not.toBeInTheDocument()
    );
  });

  it('does not refetch the coverage once the backend is the server', async () => {
    const { requestStatus } = await import('@/utils/valhalla-client');
    localStorage.setItem('valhalla_routing_mode', 'server');
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <CoverageArea />
      </QueryClientProvider>
    );

    await waitFor(() => expect(requestStatus).not.toHaveBeenCalled());
  });
});
