import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CoverageArea } from './coverage-area';

const mockUseCoverageQuery = vi.fn();

vi.mock('@/hooks/use-coverage-query', () => ({
  useCoverageQuery: () => mockUseCoverageQuery(),
}));

vi.mock('react-map-gl/maplibre', () => ({
  Source: ({ id, children }: { id: string; children: React.ReactNode }) => (
    <div data-testid={`source-${id}`}>{children}</div>
  ),
  Layer: ({ id }: { id: string }) => <div data-testid={`layer-${id}`} />,
}));

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
            [9.5, 47.25],
            [9.5, 47.0],
          ],
        ],
      },
    },
  ],
};

describe('CoverageArea', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('valhalla_routing_mode', 'wasm');
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('renders nothing when there is no coverage', () => {
    mockUseCoverageQuery.mockReturnValue({ data: null });
    const { container } = render(<CoverageArea />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when the collection is empty', () => {
    mockUseCoverageQuery.mockReturnValue({
      data: { type: 'FeatureCollection', features: [] },
    });
    const { container } = render(<CoverageArea />);
    expect(container).toBeEmptyDOMElement();
  });

  // `enabled: false` still hands back whatever is cached under the query key, and the coverage
  // is cached forever, so the component - not the hook - is what has to stay quiet in server mode.
  it('renders nothing in server mode even with cached coverage', () => {
    localStorage.setItem('valhalla_routing_mode', 'server');
    mockUseCoverageQuery.mockReturnValue({ data: COVERAGE });
    const { container } = render(<CoverageArea />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a fill and an outline layer for the coverage', () => {
    mockUseCoverageQuery.mockReturnValue({ data: COVERAGE });
    render(<CoverageArea />);
    expect(screen.getByTestId('source-tileset-coverage')).toBeInTheDocument();
    expect(
      screen.getByTestId('layer-tileset-coverage-fill')
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('layer-tileset-coverage-outline')
    ).toBeInTheDocument();
  });
});
