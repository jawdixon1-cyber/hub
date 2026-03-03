import { polygon as turfPolygon, featureCollection } from '@turf/helpers';
import turfArea from '@turf/area';
import turfIntersect from '@turf/intersect';

/**
 * Convert Leaflet LatLng array to square feet using geodesic area calculation.
 * @param {Array<{lat: number, lng: number}>} latLngs
 * @returns {number} area in square feet
 */
export function calculateSqFt(latLngs) {
  if (!latLngs || latLngs.length < 3) return 0;

  // turf expects [lng, lat] rings, closed (first === last)
  const coords = latLngs.map((p) => [p.lng, p.lat]);
  coords.push(coords[0]); // close the ring

  const poly = turfPolygon([coords]);
  const sqMeters = turfArea(poly);
  return Math.round(sqMeters * 10.7639); // m² → ft²
}

const SHAPE_COLORS = [
  '#22c55e', '#3b82f6', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#14b8a6', '#f97316',
];

let colorIdx = 0;

export function nextColor() {
  const c = SHAPE_COLORS[colorIdx % SHAPE_COLORS.length];
  colorIdx++;
  return c;
}

export function resetColorIndex() {
  colorIdx = 0;
}

/** Calculate sqft overlap between two measurement areas */
export function calcOverlap(area, exclude) {
  try {
    const aCoords = area.coordinates.map((p) => [p.lng, p.lat]);
    aCoords.push(aCoords[0]);
    const eCoords = exclude.coordinates.map((p) => [p.lng, p.lat]);
    eCoords.push(eCoords[0]);

    const aPoly = turfPolygon([aCoords]);
    const ePoly = turfPolygon([eCoords]);
    const overlap = turfIntersect(featureCollection([aPoly, ePoly]));
    if (!overlap) return 0;
    return Math.round(turfArea(overlap) * 10.7639);
  } catch {
    return 0;
  }
}

/** Compute net sqft for a single area after subtracting overlapping excludes */
export function getNetSqft(area, excludes) {
  if (!excludes || excludes.length === 0) return area.sqft;
  let totalExcluded = 0;
  for (const ex of excludes) {
    totalExcluded += calcOverlap(area, ex);
  }
  return Math.max(0, area.sqft - totalExcluded);
}

/** Compute net totals per category from a measurements array */
export function computeNetTotals(allMeasurements) {
  const groups = {};
  allMeasurements.forEach((m) => {
    const cat = m.category || 'lawn';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(m);
  });
  const excludes = groups.exclude || [];
  const result = {};
  for (const catId of ['lawn', 'beds']) {
    const items = groups[catId] || [];
    result[catId] = items.reduce((sum, m) => sum + getNetSqft(m, excludes), 0);
  }
  result.total = result.lawn + result.beds;
  return result;
}
