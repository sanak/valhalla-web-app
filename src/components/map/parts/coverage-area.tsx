import { Source, Layer } from 'react-map-gl/maplibre';
import { useCoverageQuery } from '@/hooks/use-coverage-query';

const COVERAGE_SOURCE_ID = 'tileset-coverage';

/** Shows which area the loaded tileset can route over. Empty outside wasm mode. */
export function CoverageArea() {
  const { data: coverage } = useCoverageQuery();

  if (!coverage || coverage.features.length === 0) {
    return null;
  }

  return (
    <Source id={COVERAGE_SOURCE_ID} type="geojson" data={coverage}>
      <Layer
        id="tileset-coverage-fill"
        type="fill"
        paint={{ 'fill-color': '#2563eb', 'fill-opacity': 0.06 }}
      />
      <Layer
        id="tileset-coverage-outline"
        type="line"
        paint={{
          'line-color': '#2563eb',
          'line-width': 1.5,
          'line-opacity': 0.5,
          'line-dasharray': [3, 2],
        }}
      />
    </Source>
  );
}
