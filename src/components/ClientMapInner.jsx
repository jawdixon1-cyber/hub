import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Green marker for clients
const clientIcon = L.divIcon({
  className: '',
  html: `<div style="width:28px;height:28px;background:#B0FF03;border:2px solid #000;border-radius:50%;display:flex;align-items:center;justify-content:center;">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
  </div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

function FitBounds({ clients }) {
  const map = useMap();
  useEffect(() => {
    if (clients.length === 0) return;
    const bounds = L.latLngBounds(clients.map((c) => [c.mapCenter.lat, c.mapCenter.lng]));
    map.fitBounds(bounds.pad(0.15), { maxZoom: 14 });
  }, [clients, map]);
  return null;
}

function fmt(n) { return Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

export default function ClientMapInner({ center, clients, onSelect }) {
  return (
    <MapContainer
      center={center}
      zoom={12}
      style={{ height: '100%', width: '100%' }}
      scrollWheelZoom
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
      />
      <FitBounds clients={clients} />
      {clients.map((c) => (
        <Marker
          key={c.id}
          position={[c.mapCenter.lat, c.mapCenter.lng]}
          icon={clientIcon}
          eventHandlers={{ click: () => onSelect(c) }}
        >
          <Popup>
            <div style={{ minWidth: 140 }}>
              <p style={{ fontWeight: 700, fontSize: 13, margin: 0 }}>{c.name}</p>
              {c.address && <p style={{ fontSize: 11, color: '#888', margin: '2px 0 0' }}>{c.address}</p>}
              <p style={{ fontSize: 12, fontWeight: 700, color: '#B0FF03', margin: '6px 0 0' }}>${fmt(c.monthlyPrice)}/mo</p>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
