import { geoAlbersUsa, geoPath } from 'd3-geo';
import { feature, mesh } from 'topojson-client';
import type { Feature, FeatureCollection, Geometry, MultiLineString } from 'geojson';
import type { GeometryCollection, Topology } from 'topojson-specification';
import { STATE_ABBR } from './states';

export type CountyFeature = Feature<Geometry, { name: string }> & { id: string };

export interface Geography {
  counties: CountyFeature[];
  stateBorders: MultiLineString;
}

/** Keeps the 50 states and DC; territories have no CBP county data and fall outside the projection. */
export function toGeography(topology: Topology): Geography {
  const countiesObj = topology.objects.counties as GeometryCollection<{ name: string }>;
  const statesObj = topology.objects.states as GeometryCollection;
  const fc = feature(topology, countiesObj) as FeatureCollection<Geometry, { name: string }>;
  const counties = fc.features
    .map((f) => ({ ...f, id: String(f.id).padStart(5, '0') }) as CountyFeature)
    .filter((f) => STATE_ABBR[f.id.slice(0, 2)] !== undefined);
  const stateBorders = mesh(topology, statesObj, (a, b) => a !== b);
  return { counties, stateBorders };
}

export interface ProjectedCounty {
  fips: string;
  d: string;
}

export const MAP_WIDTH = 960;
export const MAP_HEIGHT = 600;

/** Projects the counties in view, fitted to the frame, so a single state fills the map. */
export function projectCounties(
  counties: readonly CountyFeature[],
  stateBorders: MultiLineString | null,
): { paths: ProjectedCounty[]; borders: string | null } {
  if (counties.length === 0) return { paths: [], borders: null };
  const collection: FeatureCollection = { type: 'FeatureCollection', features: [...counties] };
  const projection = geoAlbersUsa().fitExtent(
    [
      [10, 10],
      [MAP_WIDTH - 10, MAP_HEIGHT - 10],
    ],
    collection,
  );
  const path = geoPath(projection);
  const paths = counties
    .map((f) => ({ fips: f.id, d: path(f) ?? '' }))
    .filter((p) => p.d.length > 0);
  return { paths, borders: stateBorders ? path(stateBorders) : null };
}
