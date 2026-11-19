import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Numbered pin for a stop on the route (done stops go gray).
const pin = (n, done) => L.divIcon({
  className: '',
  html: `<div style="width:26px;height:26px;background:${done ? '#6b7280' : '#B0FF03'};border:2px solid #000;border-radius:50%;display:flex;align-items:center;justify-content:center;font:800 12px system-ui;color:#000;">${n}</div>`,
  iconSize: [26, 26],
  iconAnchor: [13, 13],
});

function Fit({ pts }) {
  const map = useMap();
  useEffect(() => {
    if (pts.length) map.fitBounds(L.latLngBounds(pts).pad(0.15), { maxZoom: 15 });
  }, [pts, map]);
  return null;
}

// stops: [{ id, client, address, lat, lng, done, n }] already in route order.
export default function RouteMapInner({ stops }) {
  const pts = stops.map((s) => [s.lat, s.lng]);
  return (
    <MapContainer center={pts[0]} zoom={12} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false}>
      <TileLayer
        url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
        attribution="Tiles &copy; Esri"
        maxZoom={16}
      />
      <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}" maxZoom={16} />
      <Fit pts={pts} />
      <Polyline positions={pts} pathOptions={{ color: '#B0FF03', weight: 3, opacity: 0.7, dashArray: '6 6' }} />
      {stops.map((s) => (
        <Marker key={s.id} position={[s.lat, s.lng]} icon={pin(s.n, s.done)}>
          <Popup>
            <p style={{ fontWeight: 700, fontSize: 13, margin: 0 }}>{s.n}. {s.job || s.client}</p>
            {s.job && s.job !== s.client && <p style={{ fontSize: 12, margin: '2px 0 0' }}>{s.client}</p>}
            {s.address && <p style={{ fontSize: 11, color: '#888', margin: '2px 0 0' }}>{s.address}</p>}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
