import { useEffect, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { calculateSqFt } from './mapUtils';
import { genId } from '../../data';

// Fix default marker icons (webpack/vite asset issue)
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// ─── Area categories with fixed colors ───
const AREA_CATEGORIES = [
  { id: 'lawn', label: 'Lawn', color: '#22c55e' },
  { id: 'beds', label: 'Beds', color: '#ef4444' },
  { id: 'exclude', label: 'Exclude', color: '#6b7280' },
];

/** Create a small circle marker for each plotted dot */
function makeDot(latlng, color, isFirst) {
  return L.circleMarker(latlng, {
    radius: isFirst ? 9 : 6,
    color: isFirst ? '#ffffff' : color,
    fillColor: color,
    fillOpacity: 1,
    weight: isFirst ? 3 : 2,
    interactive: true,
    bubblingMouseEvents: false,
  });
}

/** Fly the map to new coordinates */
function FlyTo({ center, zoom }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.flyTo(center, zoom || 19, { duration: 1.5 });
  }, [center, zoom, map]);
  return null;
}

/** Invalidate map size after container resizes */
function ResizeHandler() {
  const map = useMap();
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 200);
    return () => clearTimeout(t);
  }, [map]);
  return null;
}

/** Custom dot-plotting draw layer with category picker */
function DrawLayer({ onMeasurementsChange, measurements }) {
  const map = useMap();
  const fgRef = useRef(null);
  const drawingRef = useRef(null);
  const bannerRef = useRef(null);
  const pickerRef = useRef(null);
  const restoredRef = useRef(false);
  const clickHandlerRef = useRef(null);
  const keyHandlerRef = useRef(null);
  const onMeasurementsChangeRef = useRef(onMeasurementsChange);
  onMeasurementsChangeRef.current = onMeasurementsChange;

  useEffect(() => {
    const fg = L.featureGroup().addTo(map);
    fgRef.current = fg;
    return () => map.removeLayer(fg);
  }, [map]);

  const clearDrawingArtifacts = useCallback(() => {
    const d = drawingRef.current;
    if (!d) return;
    d.dots.forEach((dot) => dot.remove());
    if (d.polyline) d.polyline.remove();
    if (d.closeLine) d.closeLine.remove();
    drawingRef.current = null;
  }, []);

  const showBanner = useCallback((show, category) => {
    if (!bannerRef.current) return;
    bannerRef.current.style.display = show ? 'flex' : 'none';
    if (show && category) {
      const dot = bannerRef.current.querySelector('.banner-dot');
      const lbl = bannerRef.current.querySelector('.banner-label');
      if (dot) dot.style.background = category.color;
      if (lbl) lbl.textContent = `Plotting ${category.label}`;
    }
  }, []);

  const showPicker = useCallback((show) => {
    if (!pickerRef.current) return;
    pickerRef.current.style.display = show ? 'flex' : 'none';
  }, []);

  const stopDrawing = useCallback(() => {
    clearDrawingArtifacts();
    if (clickHandlerRef.current) {
      map.off('click', clickHandlerRef.current);
      clickHandlerRef.current = null;
    }
    if (keyHandlerRef.current) {
      document.removeEventListener('keydown', keyHandlerRef.current);
      keyHandlerRef.current = null;
    }
    map.getContainer().style.cursor = '';
    showBanner(false);
  }, [map, clearDrawingArtifacts, showBanner]);

  const completeShape = useCallback(() => {
    const d = drawingRef.current;
    if (!d || d.points.length < 3) return;

    const fg = fgRef.current;
    const coords = d.points.map((p) => ({ lat: p.lat, lng: p.lng }));
    const sqft = calculateSqFt(coords);
    const id = genId();
    const { color, category } = d;

    const isExclude = category.id === 'exclude';
    const polygon = L.polygon(
      d.points.map((p) => [p.lat, p.lng]),
      { color, fillColor: color, weight: isExclude ? 2.5 : 2, fillOpacity: isExclude ? 0.4 : 0.25, dashArray: isExclude ? '8,6' : null }
    );
    polygon._measurementId = id;
    fg.addLayer(polygon);

    stopDrawing();

    onMeasurementsChangeRef.current((prev) => [
      ...prev,
      { id, label: `${category.label} ${prev.filter((m) => m.category === category.id).length + 1}`, sqft, color, coordinates: coords, type: 'polygon', category: category.id },
    ]);
  }, [stopDrawing]);

  const startDrawing = useCallback((category) => {
    stopDrawing();
    showPicker(false);
    drawingRef.current = {
      points: [],
      dots: [],
      polyline: null,
      closeLine: null,
      color: category.color,
      category,
    };
    showBanner(true, category);
    map.getContainer().style.cursor = 'crosshair';

    const onClick = (e) => {
      const d = drawingRef.current;
      if (!d) return;

      const latlng = e.latlng;

      // If we have 3+ points and the click is near the first dot, close the shape
      if (d.points.length >= 3) {
        const firstPt = d.points[0];
        const firstPx = map.latLngToContainerPoint(firstPt);
        const clickPx = map.latLngToContainerPoint(latlng);
        const dist = firstPx.distanceTo(clickPx);
        if (dist < 25) {
          completeShape();
          return;
        }
      }

      const isFirst = d.points.length === 0;

      d.points.push(latlng);

      const dot = makeDot(latlng, d.color, isFirst);
      dot.addTo(map);
      d.dots.push(dot);

      if (d.polyline) d.polyline.remove();
      if (d.points.length >= 2) {
        d.polyline = L.polyline(
          d.points.map((p) => [p.lat, p.lng]),
          { color: d.color, weight: 2, dashArray: '6,6' }
        ).addTo(map);
      }

      if (d.closeLine) d.closeLine.remove();
      if (d.points.length >= 3) {
        d.closeLine = L.polyline(
          [[latlng.lat, latlng.lng], [d.points[0].lat, d.points[0].lng]],
          { color: d.color, weight: 1.5, dashArray: '4,8', opacity: 0.5 }
        ).addTo(map);
      }
    };

    clickHandlerRef.current = onClick;
    map.on('click', onClick);

    const onKey = (e) => { if (e.key === 'Escape') stopDrawing(); };
    keyHandlerRef.current = onKey;
    document.addEventListener('keydown', onKey);
  }, [map, completeShape, stopDrawing, showBanner, showPicker]);

  // Build UI controls
  useEffect(() => {
    const container = map.getContainer();

    // ── Category picker (shown when you tap the + button) ──
    const picker = L.DomUtil.create('div', '', container);
    picker.style.cssText = 'position:absolute;top:12px;right:56px;z-index:1000;display:none;flex-direction:column;gap:6px;pointer-events:auto;';
    AREA_CATEGORIES.forEach((cat) => {
      const btn = document.createElement('button');
      btn.style.cssText = `display:flex;align-items:center;gap:8px;padding:8px 16px;border-radius:8px;border:2px solid ${cat.color};background:rgba(0,0,0,0.75);color:white;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;`;
      btn.innerHTML = `<span style="width:14px;height:14px;border-radius:3px;background:${cat.color};flex-shrink:0;"></span>${cat.label}`;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        startDrawing(cat);
      });
      picker.appendChild(btn);
    });
    L.DomEvent.disableClickPropagation(picker);
    pickerRef.current = picker;

    // ── "+" button to open picker ──
    const DrawButton = L.Control.extend({
      onAdd() {
        const btn = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
        btn.innerHTML = `<a href="#" title="Plot area" role="button" style="
          display:flex;align-items:center;justify-content:center;
          width:36px;height:36px;background:white;color:#333;cursor:pointer;text-decoration:none;font-size:22px;font-weight:bold;
        ">+</a>`;
        L.DomEvent.disableClickPropagation(btn);
        btn.querySelector('a').addEventListener('click', (e) => {
          e.preventDefault();
          // Toggle picker
          const isOpen = picker.style.display === 'flex';
          picker.style.display = isOpen ? 'none' : 'flex';
        });
        return btn;
      },
    });
    const ctrl = new DrawButton({ position: 'topright' });
    map.addControl(ctrl);

    // ── Floating banner ──
    const banner = L.DomUtil.create('div', '', container);
    banner.style.cssText = 'position:absolute;top:12px;left:50%;transform:translateX(-50%);z-index:1000;background:rgba(0,0,0,0.78);color:white;font-size:13px;font-weight:500;padding:8px 18px;border-radius:999px;display:none;align-items:center;gap:10px;white-space:nowrap;pointer-events:auto;';
    banner.innerHTML = '<span class="banner-dot" style="width:12px;height:12px;border-radius:3px;flex-shrink:0;"></span><span class="banner-label"></span><span style="color:rgba(255,255,255,0.5);">\u2014 tap first dot to close</span><button style="color:#fca5a5;font-weight:bold;background:none;border:none;cursor:pointer;font-size:13px;margin-left:4px;">Cancel</button>';
    banner.querySelector('button').addEventListener('click', () => stopDrawing());
    L.DomEvent.disableClickPropagation(banner);
    bannerRef.current = banner;

    // Close picker when clicking elsewhere on map
    const closePicker = () => { picker.style.display = 'none'; };
    map.on('click', closePicker);

    return () => {
      map.removeControl(ctrl);
      map.off('click', closePicker);
      if (picker.parentNode) picker.parentNode.removeChild(picker);
      if (banner.parentNode) banner.parentNode.removeChild(banner);
    };
  }, [map, startDrawing, stopDrawing]);

  // Sync: remove layers deleted from measurements list
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    const currentIds = new Set(measurements.map((m) => m.id));
    const toRemove = [];
    fg.eachLayer((layer) => {
      if (layer._measurementId && !currentIds.has(layer._measurementId)) {
        toRemove.push(layer);
      }
    });
    toRemove.forEach((layer) => fg.removeLayer(layer));
  }, [measurements]);

  // Restore saved shapes once
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg || !measurements.length || restoredRef.current) return;
    restoredRef.current = true;

    measurements.forEach((m) => {
      const latlngs = m.coordinates.map((c) => [c.lat, c.lng]);
      const isExclude = m.category === 'exclude';
      const layer = L.polygon(latlngs, { color: m.color, weight: isExclude ? 2.5 : 2, fillOpacity: isExclude ? 0.4 : 0.25, dashArray: isExclude ? '8,6' : null });
      layer._measurementId = m.id;
      fg.addLayer(layer);
    });
  }, [measurements]);

  useEffect(() => {
    return () => stopDrawing();
  }, [stopDrawing]);

  return null;
}

export default function MapView({ center, onMeasurementsChange, measurements }) {
  return (
    <MapContainer
      center={center || [39.8283, -98.5795]}
      zoom={center ? 19 : 4}
      className="w-full h-full rounded-lg"
      maxZoom={25}
    >
      <TileLayer
        url="https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}"
        attribution='&copy; Google'
        maxNativeZoom={21}
        maxZoom={25}
      />
      <ResizeHandler />
      {center && <FlyTo center={center} zoom={19} />}
      <DrawLayer
        onMeasurementsChange={onMeasurementsChange}
        measurements={measurements}
      />
    </MapContainer>
  );
}
