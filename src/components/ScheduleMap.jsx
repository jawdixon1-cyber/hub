import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Schedule map, like Jobber's: pins in the item's color (✓ when done, stop # otherwise),
// a route line with direction arrows, and hover linked to the list (hoverId / onHover).
const pin = (s, hot) => L.divIcon({
  className: '',
  html: `<div style="width:${hot ? 30 : 24}px;height:${hot ? 30 : 24}px;border-radius:50%;background:${s.color};border:2px solid ${hot ? '#fff' : 'rgba(255,255,255,.75)'};box-shadow:0 1px 4px rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;font:700 ${hot ? 12 : 11}px system-ui;color:#fff;opacity:${s.done && !hot ? 0.8 : 1}">${s.done ? '✓' : (s.n ?? '')}</div>`,
  iconSize: [hot ? 30 : 24, hot ? 30 : 24],
  iconAnchor: [hot ? 15 : 12, hot ? 15 : 12],
});
const arrow = (deg) => L.divIcon({
  className: '',
  html: `<div style="transform:rotate(${deg}deg);color:#5AD1F0;font-size:13px;line-height:13px;text-shadow:0 0 2px #000">➤</div>`,
  iconSize: [13, 13],
  iconAnchor: [6, 6],
});

function Fit({ pts, tick }) {
  const map = useMap();
  useEffect(() => {
    if (pts.length) map.fitBounds(L.latLngBounds(pts).pad(0.15), { maxZoom: 15 });
  }, [tick, map]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

// Panel width changes (map bigger, unscheduled list open) → tell Leaflet, or it draws blank tiles.
function SizeWatch() {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(el);
    return () => ro.disconnect();
  }, [map]);
  return null;
}

const homeIcon = L.divIcon({
  className: '',
  html: '<div style="width:28px;height:28px;border-radius:8px;background:#7DC243;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;font-size:15px">🏠</div>',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

export default function ScheduleMap({ stops, route, hoverId, onHover, onPick, recenter = 0, label, home, homeStart, homeEnd }) {
  const stopPts = useMemo(() => stops.map((s) => [s.lat, s.lng]), [stops]);
  // Route line runs from the home base (if on) through the stops and back (if on).
  const pts = useMemo(() => {
    const h = home ? [home.lat, home.lng] : null;
    return [...(h && homeStart && route ? [h] : []), ...stopPts, ...(h && homeEnd && route ? [h] : [])];
  }, [stopPts, home, homeStart, homeEnd, route]);
  // Real road path for the route line (OSRM); straight lines until it loads or if it fails.
  const [roadFor, setRoadFor] = useState({ key: '', path: null });
  const key = route && pts.length > 1 ? pts.map((p) => `${p[1].toFixed(5)},${p[0].toFixed(5)}`).join(';') : '';
  useEffect(() => {
    if (!key || pts.length > 60) return undefined;
    let dead = false;
    fetch(`https://router.project-osrm.org/route/v1/driving/${key}?overview=full&geometries=geojson`)
      .then((r) => r.json()).then((d) => { if (!dead) setRoadFor({ key, path: d.code === 'Ok' ? d.routes[0].geometry.coordinates.map(([x, y]) => [y, x]) : null, secs: d.routes?.[0]?.duration, meters: d.routes?.[0]?.distance }); })
      .catch(() => {});
    return () => { dead = true; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const road = roadFor.key === key ? roadFor.path : null;
  const trip = roadFor.key === key && roadFor.secs ? roadFor : null;
  const line = road || pts;
  const arrows = useMemo(() => {
    if (!route) return [];
    if (road) { // arrows spread along the road path
      const out = []; const step = Math.max(4, Math.floor(road.length / 14));
      for (let i = step; i < road.length - 1; i += step) {
        const [a, b] = [road[i - 1], road[i]];
        const dx = (b[1] - a[1]) * Math.cos((a[0] * Math.PI) / 180); const dy = b[0] - a[0];
        if (Math.abs(dx) + Math.abs(dy) < 1e-7) continue;
        out.push({ key: i, pos: b, deg: (-Math.atan2(dy, dx) * 180) / Math.PI });
      }
      return out;
    }
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [a, b] = [pts[i], pts[i + 1]];
      const dx = (b[1] - a[1]) * Math.cos((a[0] * Math.PI) / 180);
      const dy = b[0] - a[0];
      if (Math.abs(dx) + Math.abs(dy) < 1e-5) continue;
      out.push({ key: i, pos: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], deg: (-Math.atan2(dy, dx) * 180) / Math.PI });
    }
    return out;
  }, [pts, route, road]);
  if (!stopPts.length) return <p className="p-4 text-sm text-muted">No stops with an address on this day.</p>;
  const fmtTime = (sec) => { const m = Math.round(sec / 60); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`; };
  return (
    <>
    {route && trip && (
      <div className="absolute top-3 right-3 z-[500] rounded-lg bg-card/95 border border-border-default px-3 py-1.5 text-sm text-primary shadow">
        🚚 <b>{fmtTime(trip.secs)}</b> driving · {(trip.meters / 1609.34).toFixed(1)} mi
      </div>
    )}
    <MapContainer center={pts[0]} zoom={12} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
      <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}" attribution="Tiles &copy; Esri" maxZoom={16} />
      <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}" maxZoom={16} />
      <SizeWatch />
      <Fit pts={pts} tick={`${stops.length}:${recenter}:${pts.length}`} />
      {home && (homeStart || homeEnd) && <Marker position={[home.lat, home.lng]} icon={homeIcon} zIndexOffset={500}><Tooltip direction="top" offset={[0, -14]}>{home.address || 'Home base'}</Tooltip></Marker>}
      {route && <Polyline positions={line} pathOptions={{ color: '#5AD1F0', weight: 3, opacity: 0.9 }} />}
      {arrows.map((a) => <Marker key={`a${a.key}`} position={a.pos} icon={arrow(a.deg)} interactive={false} />)}
      {stops.map((s) => {
        const hot = hoverId === s.id;
        return (
          <Marker key={s.id} position={[s.lat, s.lng]} icon={pin(s, hot)} zIndexOffset={hot ? 1000 : 0}
            eventHandlers={{ mouseover: () => onHover?.(s.id), mouseout: () => onHover?.(null), click: () => onPick?.(s) }}>
            {hot && <Tooltip permanent direction="top" offset={[0, -16]}>{label ? label(s) : s.title}</Tooltip>}
          </Marker>
        );
      })}
    </MapContainer>
    </>
  );
}
