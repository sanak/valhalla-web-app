import { useQuery } from '@tanstack/react-query';
import { getRoutingMode, getTarUrl } from '@/utils/routing-engine';
import { requestStatus } from '@/utils/valhalla-client';

/**
 * The tileset's coverage, as level-2 tile boundaries from Valhalla's connectivity map. Only
 * meaningful in wasm mode: a global server covers everything, so drawing it says nothing.
 *
 * The answer is fixed for a given tar, so it is fetched once and never refetched. A verbose
 * status costs a handful of range requests because loki reads a tile to fill in the rest of the
 * response.
 */
export function useCoverageQuery() {
  const isWasmMode = getRoutingMode() === 'wasm';
  const tarUrl = getTarUrl();

  return useQuery({
    queryKey: ['tilesetCoverage', tarUrl],
    queryFn: async ({ signal }) => {
      const status = await requestStatus({ verbose: true, signal });
      return status.bbox ?? null;
    },
    enabled: isWasmMode && tarUrl !== '',
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  });
}
