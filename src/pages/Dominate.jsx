import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  MapPin,
  Users,
  Flag,
  ChevronUp,
  ChevronDown,
  Megaphone,
  Target,
  Crosshair,
  Plus,
  X,
  RefreshCw,
  Trash2,
  Pencil,
  Loader2,
  Satellite,
  Map as MapIcon,
  Pentagon,
  LocateFixed,
} from 'lucide-react';

/* ── Status config ── */

const STATUS_OPTIONS = ['Dominate', 'Build', 'Test', 'Pause'];
const STATUS_CONFIG = {
  Dominate: { color: 'text-brand', bg: 'bg-brand/10', border: 'border-brand/30', hex: '#B0FF03' },
  Build:    { color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/30', hex: '#3b82f6' },
  Test:     { color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30', hex: '#f59e0b' },
  Pause:    { color: 'text-zinc-500', bg: 'bg-zinc-500/10', border: 'border-zinc-500/30', hex: '#71717a' },
};

/* ── Zone & sign persistence (localStorage + Supabase sync) ── */

const ZONES_KEY = 'dominate_zones';
const SIGNS_KEY = 'dominate_signs';

function loadLocal(key) {
  try { return JSON.parse(localStorage.getItem(key) || '[]'); }
  catch { return []; }
}

function saveLocal(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}

async function loadFromSupabase(key) {
  try {
    const res = await fetch(`/api/app-state?key=${encodeURIComponent(key)}`);
    if (!res.ok) return null;
    const { value } = await res.json();
    if (value && Array.isArray(value)) return value;
  } catch {}
  return null;
}

function saveToSupabase(key, value) {
  fetch(`/api/app-state?key=${encodeURIComponent(key)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value }),
  }).catch(() => {});
}

/* ── Generate actions from zone + client data ── */

function generateActions(zones, clients) {
  const actions = [];
  for (const z of zones) {
    if (z.status === 'Pause') continue;
    const clientCount = countClientsInZone(z, clients);
    if (z.status === 'Test' && clientCount === 0) {
      actions.push({ neighborhood: z.name, action: 'Scout area \u2014 get first client, then place a yard sign' });
    } else if (z.status === 'Test') {
      actions.push({ neighborhood: z.name, action: `${clientCount} client${clientCount > 1 ? 's' : ''} \u2014 place yard signs and push for referrals` });
    } else if (clientCount >= 3) {
      actions.push({ neighborhood: z.name, action: `${clientCount} clients strong \u2014 ask each for a referral this week` });
    } else {
      actions.push({ neighborhood: z.name, action: 'Maintain presence \u2014 check signs are visible, follow up on leads' });
    }
  }
  return actions;
}

function countClientsInZone(zone, clients) {
  if (!zone.polygon || zone.polygon.length < 3) return 0;
  return clients.filter(c => c.lat && c.lng && pointInPolygon([c.lat, c.lng], zone.polygon)).length;
}

function pointInPolygon(point, polygon) {
  const [y, x] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [yi, xi] = polygon[i];
    const [yj, xj] = polygon[j];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

function daysSince(dateStr) {
  if (!dateStr) return 999;
  return Math.floor((Date.now() - new Date(dateStr + 'T00:00:00').getTime()) / 86400000);
}

function formatDate(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/* ── Shop location ── */
const SHOP = { lat: 34.95572, lng: -81.07870, label: 'Hey Jude\'s HQ — 832 Wren Dr' };

/* ── Map Component with satellite toggle + zone drawing ── */

function DominateMap({ clients, zones, drawingMode, drawingPointCount, onDrawingComplete, onDrawingPointsChange, editingZone, onEditZoneUpdate, signPins, signMode, onAddSign, onRemoveSign, userLocation, heading, tracking, followKey }) {
  const [leaflet, setLeaflet] = useState(null);
  const [L, setL] = useState(null);
  const [satellite, setSatellite] = useState(false);

  useEffect(() => {
    Promise.all([
      import('react-leaflet'),
      import('leaflet'),
      import('leaflet/dist/leaflet.css'),
    ]).then(([rl, lf]) => {
      setLeaflet(rl);
      setL(lf.default || lf);
    });
  }, []);

  const validClients = useMemo(() => clients.filter(c => c.lat && c.lng), [clients]);

  if (!leaflet || !L) {
    return (
      <div className="w-full h-[500px] bg-surface-alt flex items-center justify-center">
        <Loader2 size={20} className="text-muted animate-spin" />
      </div>
    );
  }

  const { MapContainer, TileLayer, CircleMarker, Marker, Tooltip, Polygon, Polyline, useMapEvents } = leaflet;

  const signIcon = L.divIcon({
    className: '',
    html: `<div style="
      display:flex;align-items:center;justify-content:center;
      width:24px;height:24px;
      background:#B0FF03;border-radius:4px;
      border:2px solid #000;
      box-shadow:0 2px 6px rgba(0,0,0,0.4);
    "><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 22v-6"/><path d="M3 16V4a1 1 0 0 1 1-1h9.586a1 1 0 0 1 .707.293l2.414 2.414a1 1 0 0 1 .293.707V16H3z"/></svg></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });

  const DARK_TILES = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
  const SAT_TILES = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
  const SAT_LABELS = 'https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png';

  return (
    <div className="relative z-0">
      <MapContainer
        center={[34.945, -81.035]}
        zoom={12}
        className="w-full h-[500px]"
        style={{ background: '#0a0a0a' }}
        zoomControl={false}
        dragging={!('ontouchstart' in window)}
        tap={false}
      >
        {/* Enable two-finger drag on mobile */}
        {'ontouchstart' in window && <TwoFingerDrag useMap={leaflet.useMap} L={L} />}
        {satellite ? (
          <>
            <TileLayer url={SAT_TILES} maxZoom={19} attribution="&copy; Esri" />
            <TileLayer url={SAT_LABELS} maxZoom={19} />
          </>
        ) : (
          <TileLayer url={DARK_TILES} maxZoom={19} attribution="&copy; OSM &copy; CARTO" />
        )}

        {/* Zone polygons */}
        {zones.map((z, i) => {
          if (!z.polygon || z.polygon.length < 3) return null;
          if (editingZone?.name === z.name) return null; // ZoneEditor renders its own
          const cfg = STATUS_CONFIG[z.status] || STATUS_CONFIG.Pause;
          return (
            <Polygon
              key={z.name + i}
              positions={z.polygon}
              pathOptions={{
                color: cfg.hex,
                fillColor: cfg.hex,
                fillOpacity: 0.12,
                weight: 2,
                dashArray: z.status === 'Pause' ? '6 4' : undefined,
              }}
            >
              <Tooltip sticky className="dominate-tooltip">
                <span className="text-xs font-semibold">{z.name}</span>
                <span className="text-xs opacity-70 ml-1">({z.status})</span>
              </Tooltip>
            </Polygon>
          );
        })}

        {/* Client pins — person icon */}
        {validClients.map((c, i) => {
          const personIcon = L.divIcon({
            className: '',
            html: `<div style="
              display:flex;align-items:center;justify-content:center;
              width:22px;height:22px;
              background:#B0FF03;border-radius:50%;
              border:2px solid ${satellite ? '#000' : '#1a1a1a'};
              box-shadow:0 1px 4px rgba(0,0,0,0.4);
            "><svg width="12" height="12" viewBox="0 0 24 24" fill="#000" stroke="none"><circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 0 0-16 0"/></svg></div>`,
            iconSize: [22, 22],
            iconAnchor: [11, 11],
          });
          return (
            <Marker
              key={'client-' + i}
              position={[c.lat, c.lng]}
              icon={personIcon}
            >
              <Tooltip direction="top" offset={[0, -14]} className="dominate-tooltip">
                <span className="text-xs font-medium">
                  {c.name}<br />
                  <span style={{ opacity: 0.7 }}>{c.street}</span>
                </span>
              </Tooltip>
            </Marker>
          );
        })}

        {/* Shop HQ pin — large white ring with green fill */}
        <CircleMarker
          center={[SHOP.lat, SHOP.lng]}
          radius={11}
          pathOptions={{ color: '#fff', fillColor: '#B0FF03', fillOpacity: 1, weight: 3 }}
        >
          <Tooltip direction="top" offset={[0, -12]} className="dominate-tooltip" permanent>
            <span className="text-xs font-bold">HQ</span>
          </Tooltip>
        </CircleMarker>

        {/* Yard sign pins */}
        {signPins.map((s, i) => (
          <Marker
            key={'sign-' + i}
            position={[s.lat, s.lng]}
            icon={signIcon}
            eventHandlers={{ click: (e) => { L.DomEvent.stopPropagation(e); onRemoveSign(i); } }}
          >
            <Tooltip direction="top" offset={[0, -14]} className="dominate-tooltip">
              <span className="text-xs font-medium">
                Yard Sign
                {s.createdAt ? <><br /><span style={{ opacity: 0.6 }}>Placed {new Date(s.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span></> : ''}
              </span>
            </Tooltip>
          </Marker>
        ))}

        {/* Sign drop mode handler */}
        {signMode && <SignDropHandler onAddSign={onAddSign} useMapEvents={useMapEvents} />}

        {/* Drawing handler */}
        {drawingMode && (
          <DrawingCore
            onComplete={onDrawingComplete}
            onPointsChange={onDrawingPointsChange}
            useMapEvents={useMapEvents}
            Polyline={Polyline}
            CircleMarker={CircleMarker}
          />
        )}

        {/* Zone boundary editor */}
        {editingZone && editingZone.polygon?.length >= 3 && (
          <ZoneEditor
            zone={editingZone}
            onUpdate={onEditZoneUpdate}
            Marker={Marker}
            CircleMarker={CircleMarker}
            Polygon={Polygon}
            Tooltip={Tooltip}
            L={L}
          />
        )}

        {/* User GPS location with direction cone */}
        {userLocation && (() => {
          const hasHeading = heading !== null;
          const locationIcon = L.divIcon({
            className: '',
            html: `<div style="position:relative;width:60px;height:60px;">
              ${hasHeading ? `<div style="
                position:absolute;top:0;left:0;width:60px;height:60px;
                transform:rotate(${heading}deg);
                pointer-events:none;
              "><div style="
                position:absolute;top:0;left:50%;
                transform:translateX(-50%);
                width:0;height:0;
                border-left:18px solid transparent;
                border-right:18px solid transparent;
                border-bottom:30px solid rgba(59,130,246,0.25);
                filter:blur(1px);
              "></div></div>` : ''}
              <div style="
                position:absolute;top:50%;left:50%;
                transform:translate(-50%,-50%);
                width:20px;height:20px;
                background:rgba(59,130,246,0.2);
                border-radius:50%;
              "></div>
              <div style="
                position:absolute;top:50%;left:50%;
                transform:translate(-50%,-50%);
                width:12px;height:12px;
                background:#3b82f6;
                border:2px solid #fff;
                border-radius:50%;
                box-shadow:0 0 6px rgba(59,130,246,0.6);
              "></div>
            </div>`,
            iconSize: [60, 60],
            iconAnchor: [30, 30],
          });
          return (
            <Marker
              position={[userLocation.lat, userLocation.lng]}
              icon={locationIcon}
              zIndexOffset={-100}
            >
              <Tooltip direction="top" offset={[0, -20]} className="dominate-tooltip">
                <span className="text-xs font-medium">You are here</span>
              </Tooltip>
            </Marker>
          );
        })()}

        {/* Auto-pan to user location */}
        {tracking && userLocation && (
          <FollowLocation lat={userLocation.lat} lng={userLocation.lng} useMap={leaflet.useMap} useMapEvents={leaflet.useMapEvents} followKey={followKey} />
        )}
      </MapContainer>

      {/* Map controls */}
      <div className="absolute top-3 right-3 z-[1000] flex gap-1.5">
        <button
          onClick={() => setSatellite(!satellite)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors backdrop-blur-sm bg-card/80 border-border-subtle text-secondary hover:text-primary"
        >
          {satellite ? <MapIcon size={13} /> : <Satellite size={13} />}
          {satellite ? 'Dark Map' : 'Satellite'}
        </button>
      </div>

      {/* Mode indicators */}
      {editingZone && (
        <div className="absolute top-3 left-3 z-[1000]">
          <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-brand/90 text-black">
            <Pencil size={13} />
            Editing: {editingZone.name} · drag to move · tap + to add
          </div>
        </div>
      )}
      {drawingMode && (
        <div className="absolute top-3 left-3 z-[1000] flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-brand/90 text-black">
            <Pentagon size={13} />
            Tap to place points — {drawingPointCount} placed
          </div>
          <div className="flex gap-1.5">
            {drawingPointCount >= 3 && (
              <button
                onClick={() => window.__drawingFinish?.()}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-brand text-black shadow-lg active:scale-95 transition-transform"
              >
                Finish Zone
              </button>
            )}
            {drawingPointCount > 0 && (
              <button
                onClick={() => window.__drawingUndo?.()}
                className="flex items-center justify-center gap-1 px-3 py-2 text-xs font-medium rounded-lg bg-card/90 text-secondary border border-border-subtle shadow-lg active:scale-95 transition-transform"
              >
                Undo
              </button>
            )}
          </div>
        </div>
      )}
      {signMode && (
        <>
          <div className="absolute top-3 left-3 z-[1000]">
            <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-white/90 text-black border border-brand">
              <Flag size={13} />
              Tap map to drop sign
            </div>
          </div>
          {userLocation && (
            <div className="absolute bottom-3 left-3 right-3 z-[1000]">
              <button
                onClick={() => onAddSign({ lat: userLocation.lat, lng: userLocation.lng, createdAt: new Date().toISOString() })}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold rounded-xl bg-brand text-black shadow-lg active:scale-[0.98] transition-transform"
              >
                <LocateFixed size={16} />
                Drop Sign Here
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ── Two-finger drag for mobile (rendered inside MapContainer) ── */

function TwoFingerDrag({ useMap, L }) {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    let touching = 0;

    function onTouchStart(e) {
      touching = e.touches.length;
      if (touching >= 2) {
        map.dragging.enable();
      }
    }
    function onTouchEnd() {
      touching = 0;
      // Small delay so the drag gesture completes
      setTimeout(() => { map.dragging.disable(); }, 100);
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [map]);
  return null;
}

/* ── Sign drop handler (rendered inside MapContainer) ── */

function SignDropHandler({ onAddSign, useMapEvents }) {
  useMapEvents({
    click(e) {
      onAddSign({ lat: e.latlng.lat, lng: e.latlng.lng, createdAt: new Date().toISOString() });
    },
  });
  return null;
}

/* ── Follow user location (rendered inside MapContainer) ── */

function FollowLocation({ lat, lng, useMap, useMapEvents, followKey }) {
  const map = useMap();
  const prevRef = useRef(null);
  const followingRef = useRef(true);

  // Pause auto-follow when user drags the map
  useMapEvents({
    dragstart() { followingRef.current = false; },
  });

  // Re-enable follow when user taps "Locate Me" again (followKey bumps)
  useEffect(() => {
    followingRef.current = true;
    prevRef.current = null; // force re-center
  }, [followKey]);

  useEffect(() => {
    if (!followingRef.current) return;
    const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
    if (prevRef.current !== key) {
      prevRef.current = key;
      map.setView([lat, lng], Math.max(map.getZoom(), 17), { animate: true });
    }
  }, [lat, lng, map]);
  return null;
}

/* ── Click-to-draw polygon handler (rendered inside MapContainer) ── */

function DrawingCore({ onComplete, onPointsChange, useMapEvents, Polyline, CircleMarker }) {
  const [points, setPoints] = useState([]);
  const pointsRef = useRef([]);
  const onCompleteRef = useRef(onComplete);
  const onPointsChangeRef = useRef(onPointsChange);
  onCompleteRef.current = onComplete;
  onPointsChangeRef.current = onPointsChange;

  function doUpdate(newPoints) {
    pointsRef.current = newPoints;
    setPoints([...newPoints]);
    onPointsChangeRef.current(newPoints.length);
  }

  function finishDrawing() {
    if (pointsRef.current.length < 3) return;
    const polygon = [...pointsRef.current];
    pointsRef.current = [];
    setPoints([]);
    onPointsChangeRef.current(0);
    // Call onComplete last — it will unmount this component
    onCompleteRef.current(polygon);
  }

  useMapEvents({
    click(e) {
      const newPoint = [e.latlng.lat, e.latlng.lng];

      // Check if clicking near first point to close polygon (very tight — ~55m)
      if (pointsRef.current.length >= 3) {
        const first = pointsRef.current[0];
        const dist = Math.sqrt(
          Math.pow(newPoint[0] - first[0], 2) + Math.pow(newPoint[1] - first[1], 2)
        );
        if (dist < 0.0005) {
          finishDrawing();
          return;
        }
      }

      doUpdate([...pointsRef.current, newPoint]);
    },
  });

  // Expose finish/undo for buttons outside MapContainer
  useEffect(() => {
    window.__drawingFinish = () => finishDrawing();
    window.__drawingUndo = () => {
      if (pointsRef.current.length > 0) {
        doUpdate(pointsRef.current.slice(0, -1));
      }
    };
    return () => { delete window.__drawingFinish; delete window.__drawingUndo; };
  }, []);

  return (
    <>
      {points.length >= 2 && (
        <Polyline positions={points} pathOptions={{ color: '#B0FF03', weight: 2, dashArray: '6 4' }} />
      )}
      {points.map((p, i) => (
        <CircleMarker
          key={i}
          center={p}
          radius={i === 0 && points.length >= 3 ? 8 : 4}
          pathOptions={{
            color: '#B0FF03',
            fillColor: i === 0 && points.length >= 3 ? '#B0FF03' : '#fff',
            fillOpacity: 1,
            weight: 2,
          }}
        />
      ))}
    </>
  );
}

/* ── Zone boundary editor (rendered inside MapContainer) ── */

function ZoneEditor({ zone, onUpdate, Marker, CircleMarker, Polygon, Tooltip, L }) {
  const [points, setPoints] = useState([...zone.polygon]);
  const [selectedVertex, setSelectedVertex] = useState(null);

  // Sync if zone changes externally
  useEffect(() => { setPoints([...zone.polygon]); }, [zone.name]);

  function save(newPoints) {
    setPoints(newPoints);
    onUpdate(zone.name, newPoints);
  }

  function movePoint(index, lat, lng) {
    const updated = [...points];
    updated[index] = [lat, lng];
    save(updated);
  }

  function addPoint(afterIndex) {
    const a = points[afterIndex];
    const b = points[(afterIndex + 1) % points.length];
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const updated = [...points];
    updated.splice(afterIndex + 1, 0, mid);
    save(updated);
    setSelectedVertex(null);
  }

  function removePoint(index) {
    if (points.length <= 3) return;
    const updated = points.filter((_, i) => i !== index);
    save(updated);
    setSelectedVertex(null);
  }

  function vertexIcon(index) {
    const isSelected = selectedVertex === index;
    return L.divIcon({
      className: '',
      html: `<div style="
        width:${isSelected ? 22 : 16}px;height:${isSelected ? 22 : 16}px;
        background:${isSelected ? '#fff' : '#B0FF03'};
        border:2px solid ${isSelected ? '#B0FF03' : '#000'};
        border-radius:50%;
        box-shadow:0 1px 4px rgba(0,0,0,0.5);
        cursor:grab;
        transition:all 0.15s;
      "></div>`,
      iconSize: [isSelected ? 22 : 16, isSelected ? 22 : 16],
      iconAnchor: [isSelected ? 11 : 8, isSelected ? 11 : 8],
    });
  }

  const midpointIcon = L.divIcon({
    className: '',
    html: `<div style="width:12px;height:12px;background:rgba(176,255,3,0.3);border:2px solid rgba(176,255,3,0.6);border-radius:50%;cursor:pointer;"></div>`,
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  });

  const cfg = STATUS_CONFIG[zone.status] || STATUS_CONFIG.Pause;

  return (
    <>
      {/* Zone polygon preview */}
      <Polygon
        positions={points}
        pathOptions={{ color: cfg.hex, fillColor: cfg.hex, fillOpacity: 0.15, weight: 2, dashArray: '4 4' }}
      />

      {/* Draggable vertex markers */}
      {points.map((p, i) => (
        <Marker
          key={'v-' + i + '-' + points.length}
          position={p}
          icon={vertexIcon(i)}
          draggable
          eventHandlers={{
            dragend: (e) => {
              const { lat, lng } = e.target.getLatLng();
              movePoint(i, lat, lng);
            },
            click: () => setSelectedVertex(selectedVertex === i ? null : i),
          }}
        />
      ))}

      {/* Selected vertex actions — show remove button */}
      {selectedVertex !== null && points.length > 3 && points[selectedVertex] && (() => {
        const p = points[selectedVertex];
        const removeIcon = L.divIcon({
          className: '',
          html: `<div style="
            display:flex;align-items:center;justify-content:center;
            width:28px;height:28px;
            background:#ef4444;border-radius:50%;
            border:2px solid #fff;
            box-shadow:0 2px 6px rgba(0,0,0,0.5);
            cursor:pointer;
          "><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg></div>`,
          iconSize: [28, 28],
          iconAnchor: [14, 38],
        });
        return (
          <Marker
            position={p}
            icon={removeIcon}
            eventHandlers={{ click: () => removePoint(selectedVertex) }}
          />
        );
      })()}

      {/* Midpoint markers — tap to add a new vertex */}
      {points.map((p, i) => {
        const next = points[(i + 1) % points.length];
        const mid = [(p[0] + next[0]) / 2, (p[1] + next[1]) / 2];
        return (
          <Marker
            key={'m-' + i + '-' + points.length}
            position={mid}
            icon={midpointIcon}
            eventHandlers={{ click: () => addPoint(i) }}
          >
            <Tooltip direction="top" offset={[0, -8]} className="dominate-tooltip">
              <span className="text-xs">Tap to add point</span>
            </Tooltip>
          </Marker>
        );
      })}
    </>
  );
}

/* ── Zone Name/Status Modal (shown after drawing is complete) ── */

function ZoneModal({ zone, onSave, onClose }) {
  const [name, setName] = useState(zone?.name || '');
  const [status, setStatus] = useState(zone?.status || 'Test');

  function handleSave() {
    if (!name.trim()) return;
    onSave({ name: name.trim(), status });
  }

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-card border border-border-subtle rounded-xl w-full max-w-sm p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-primary">{zone ? 'Edit Zone' : 'Name This Zone'}</h3>
          <button onClick={onClose} className="text-muted hover:text-secondary"><X size={18} /></button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-[11px] font-medium text-muted uppercase tracking-wide">Zone Name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Wintercrest"
              className="mt-1 w-full px-3 py-2 bg-surface-alt border border-border-default rounded-lg text-sm text-primary placeholder:text-muted focus:outline-none focus:border-brand/50"
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter' && name.trim()) handleSave(); }}
            />
          </div>

          <div>
            <label className="text-[11px] font-medium text-muted uppercase tracking-wide">Status</label>
            <div className="mt-1 flex gap-2">
              {STATUS_OPTIONS.map(s => {
                const cfg = STATUS_CONFIG[s];
                return (
                  <button
                    key={s}
                    onClick={() => setStatus(s)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                      status === s ? `${cfg.bg} ${cfg.color} ${cfg.border}` : 'border-border-subtle text-muted hover:text-secondary'
                    }`}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={!name.trim()}
          className="w-full py-2.5 bg-brand text-black font-semibold text-sm rounded-lg hover:bg-brand-hover transition-colors disabled:opacity-40"
        >
          {zone ? 'Save' : 'Save Zone'}
        </button>
      </div>
    </div>
  );
}

/* ── Main Page ── */

export default function Dominate() {
  const [zones, setZones] = useState(() => loadLocal(ZONES_KEY));
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortKey, setSortKey] = useState('clients');
  const [sortAsc, setSortAsc] = useState(false);
  const [editZone, setEditZone] = useState(null); // null | zone object (for editing existing)
  const [editingZone, setEditingZone] = useState(null); // zone being boundary-edited on map
  const [drawingMode, setDrawingMode] = useState(false);
  const [drawingPointCount, setDrawingPointCount] = useState(0);
  const [drawnPolygon, setDrawnPolygon] = useState(null); // polygon just drawn, waiting for name
  const [pendingZone, setPendingZone] = useState(null); // existing zone being redrawn
  const [signMode, setSignMode] = useState(false);
  const [signPins, setSignPins] = useState(() => loadLocal(SIGNS_KEY));
  const [confirmDeleteSign, setConfirmDeleteSign] = useState(null); // index or null
  const [userLocation, setUserLocation] = useState(null); // { lat, lng }
  const [heading, setHeading] = useState(null); // compass degrees (0=north)
  const [tracking, setTracking] = useState(false);
  const [followKey, setFollowKey] = useState(0); // bump to re-center after drag
  const watchIdRef = useRef(null);

  // GPS location tracking
  function toggleTracking() {
    if (tracking) {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      setTracking(false);
      setUserLocation(null);
      setHeading(null);
      return;
    }
    if (!navigator.geolocation) return;
    setTracking(true);
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => { setTracking(false); },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );

    // Compass heading — request permission on iOS, just listen on Android
    function startCompass() {
      window.addEventListener('deviceorientationabsolute', handleOrientation, true);
      window.addEventListener('deviceorientation', handleOrientation, true);
    }
    function handleOrientation(e) {
      // webkitCompassHeading (iOS) or alpha (Android)
      let h = null;
      if (typeof e.webkitCompassHeading === 'number') {
        h = e.webkitCompassHeading;
      } else if (e.absolute && typeof e.alpha === 'number') {
        h = 360 - e.alpha;
      } else if (typeof e.alpha === 'number') {
        h = 360 - e.alpha;
      }
      if (h !== null) setHeading(Math.round(h));
    }
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      DeviceOrientationEvent.requestPermission().then(p => { if (p === 'granted') startCompass(); }).catch(() => {});
    } else {
      startCompass();
    }
  }

  // Re-center on me (when tracking but user dragged away)
  function recenterOnMe() {
    setFollowKey(k => k + 1);
  }

  // Cleanup watch on unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, []);

  // Fetch real recurring client locations
  const fetchClients = useCallback(async (refresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/commander/dominate${refresh ? '?refresh=1' : ''}`);
      if (!res.ok) throw new Error('Failed to load clients');
      const data = await res.json();
      setClients(data.clients || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchClients(); }, [fetchClients]);

  // Sync zones & signs with Supabase on mount
  useEffect(() => {
    // Zones: pull from Supabase, or push local if Supabase empty
    loadFromSupabase(ZONES_KEY).then(remote => {
      const local = loadLocal(ZONES_KEY);
      if (remote && remote.length > 0) {
        setZones(remote);
        saveLocal(ZONES_KEY, remote);
      } else if (local.length > 0) {
        // Local has zones but Supabase doesn't — push up
        saveToSupabase(ZONES_KEY, local);
      }
    });
    // Signs: same pattern
    loadFromSupabase(SIGNS_KEY).then(remote => {
      const local = loadLocal(SIGNS_KEY);
      if (remote && remote.length > 0) {
        setSignPins(remote);
        saveLocal(SIGNS_KEY, remote);
      } else if (local.length > 0) {
        saveToSupabase(SIGNS_KEY, local);
      }
    });
  }, []);

  // Count clients in each zone using polygon containment
  const zoneSummary = useMemo(() =>
    zones.map(z => ({
      ...z,
      clients: countClientsInZone(z, clients),
    })),
    [zones, clients]
  );

  const sorted = useMemo(() => {
    return [...zoneSummary].sort((a, b) => {
      const diff = (a[sortKey] || 0) - (b[sortKey] || 0);
      return sortAsc ? diff : -diff;
    });
  }, [zoneSummary, sortKey, sortAsc]);

  const totals = useMemo(() => ({
    clients: clients.filter(c => c.lat).length,
    zones: zones.filter(z => z.status !== 'Pause').length,
    signs: signPins.length,
    inZones: clients.filter(c => c.lat && c.lng && zones.some(z => z.polygon?.length >= 3 && pointInPolygon([c.lat, c.lng], z.polygon))).length,
  }), [clients, zones, signPins]);

  const actions = useMemo(() => generateActions(zones, clients), [zones, clients]);

  function updateZones(newZones) {
    setZones(newZones);
    saveLocal(ZONES_KEY, newZones);
    saveToSupabase(ZONES_KEY, newZones);
  }

  // "Add Zone" → go straight to drawing mode
  function startNewZone() {
    setSignMode(false);
    setDrawingMode(true);
    setPendingZone(null);
  }


  // Drawing finished → show naming modal (or save redraw)
  function handleDrawingComplete(polygon) {
    setDrawingMode(false);
    if (pendingZone) {
      // Redrawing existing zone — just update the polygon
      const updated = zones.map(z => z.name === pendingZone.name ? { ...z, polygon } : z);
      updateZones(updated);
      setPendingZone(null);
    } else {
      // New zone — save polygon, show name modal
      setDrawnPolygon(polygon);
    }
  }

  // Save from name modal (new or edit)
  function handleSaveZone({ name, status }) {
    if (editZone) {
      // Editing existing zone name/status
      const updated = zones.map(z => z.name === editZone.name ? { ...z, name, status } : z);
      updateZones(updated);
      setEditZone(null);
    } else if (drawnPolygon) {
      // New zone just drawn
      updateZones([...zones, { name, status, polygon: drawnPolygon }]);
      setDrawnPolygon(null);
    }
  }

  function handleDeleteZone(name) {
    updateZones(zones.filter(z => z.name !== name));
  }

  function handleEditZoneUpdate(zoneName, newPolygon) {
    const updated = zones.map(z => z.name === zoneName ? { ...z, polygon: newPolygon } : z);
    updateZones(updated);
    // Keep editingZone in sync with new polygon
    setEditingZone(prev => prev ? { ...prev, polygon: newPolygon } : null);
  }

  function startEditBoundary(zone) {
    setEditingZone(zone);
    setSignMode(false);
    setDrawingMode(false);
  }

  function updateSigns(updated) {
    setSignPins(updated);
    saveLocal(SIGNS_KEY, updated);
    saveToSupabase(SIGNS_KEY, updated);
  }

  function handleAddSign(pin) {
    updateSigns([...signPins, pin]);
  }

  function handleRemoveSign(index) {
    setConfirmDeleteSign(index);
  }

  function confirmRemoveSign() {
    if (confirmDeleteSign === null) return;
    updateSigns(signPins.filter((_, i) => i !== confirmDeleteSign));
    setConfirmDeleteSign(null);
  }

  function toggleSort(key) {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  }

  const SortIcon = ({ col }) => {
    if (sortKey !== col) return null;
    return sortAsc ? <ChevronUp size={12} className="inline ml-0.5" /> : <ChevronDown size={12} className="inline ml-0.5" />;
  };

  return (
    <div className="space-y-5 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Crosshair size={20} className="text-brand" />
          <h1 className="text-lg font-semibold text-primary">Dominate</h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted hidden sm:block">Where should we concentrate this week?</span>
          <button onClick={() => fetchClients(true)} className="p-1.5 text-muted hover:text-brand transition-colors" title="Refresh">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard label="Recurring Clients" value={totals.clients} icon={Users} highlight />
        <SummaryCard label="Active Zones" value={totals.zones} icon={MapPin} />
        <SummaryCard label="Yard Signs" value={totals.signs} icon={Flag} />
        <SummaryCard label="In Zones" value={totals.inZones} icon={Target} />
      </div>

      {/* Map */}
      <div className="bg-card rounded-xl border border-border-subtle overflow-hidden">
        <div className="px-4 py-3 border-b border-border-subtle flex items-center justify-between">
          <span className="text-sm font-medium text-primary">Recurring Clients &mdash; Rock Hill, SC</span>
          <span className="text-xs text-muted">{clients.filter(c => c.lat).length} mapped &middot; {zones.length} zone{zones.length !== 1 ? 's' : ''}</span>
        </div>
        {loading && clients.length === 0 ? (
          <div className="w-full h-[500px] flex items-center justify-center">
            <div className="text-center space-y-2">
              <Loader2 size={24} className="text-brand animate-spin mx-auto" />
              <p className="text-sm text-muted">Loading client locations from Jobber...</p>
              <p className="text-xs text-muted">First load takes ~25s (geocoding addresses)</p>
            </div>
          </div>
        ) : error ? (
          <div className="w-full h-[500px] flex items-center justify-center">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        ) : (
          <DominateMap
            clients={clients}
            zones={zones}
            drawingMode={drawingMode}
            drawingPointCount={drawingPointCount}
            onDrawingComplete={handleDrawingComplete}
            onDrawingPointsChange={setDrawingPointCount}
            editingZone={editingZone}
            onEditZoneUpdate={handleEditZoneUpdate}
            signPins={signPins}
            signMode={signMode}
            onAddSign={handleAddSign}
            onRemoveSign={handleRemoveSign}
            userLocation={userLocation}
            heading={heading}
            tracking={tracking}
            followKey={followKey}
          />
        )}
        <div className="px-3 py-2 border-t border-border-subtle space-y-2">
          {/* Legend row — hidden on small screens to save space */}
          <div className="hidden sm:flex items-center gap-3 text-[11px] text-muted">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-brand inline-block" />
              Client
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-white border border-brand inline-block" />
              Sign
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm border border-brand/60 bg-brand/15 inline-block" />
              Zone
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-brand text-[6px] font-extrabold text-black flex items-center justify-center leading-none inline-flex">HQ</span>
              Shop
            </span>
            {userLocation && (
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-blue-500 border border-white inline-block" />
                You
              </span>
            )}
          </div>
          {/* Action buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            {editingZone && (
              <button
                onClick={() => setEditingZone(null)}
                className="flex items-center gap-1 px-2 py-1.5 text-xs font-semibold rounded-md bg-brand text-black transition-colors"
              >
                Done Editing
              </button>
            )}
            {drawingMode && (
              <button
                onClick={() => { setDrawingMode(false); setPendingZone(null); setDrawnPolygon(null); setDrawingPointCount(0); }}
                className="text-xs text-red-400 hover:text-red-300"
              >
                Cancel
              </button>
            )}
            {tracking ? (
              <div className="flex items-center gap-0.5">
                <button
                  onClick={recenterOnMe}
                  className="flex items-center gap-1 px-2 py-1.5 text-xs font-medium rounded-l-md bg-blue-500 text-white border border-blue-500 transition-colors"
                >
                  <LocateFixed size={12} />
                  Re-center
                </button>
                <button
                  onClick={toggleTracking}
                  className="flex items-center px-1.5 py-1.5 text-xs font-medium rounded-r-md bg-blue-600 text-white border border-blue-600 transition-colors"
                >
                  <X size={12} />
                </button>
              </div>
            ) : (
              <button
                onClick={toggleTracking}
                className="flex items-center gap-1 px-2 py-1.5 text-xs font-medium rounded-md text-muted hover:text-secondary border border-border-subtle transition-colors"
              >
                <LocateFixed size={12} />
                Locate Me
              </button>
            )}
            <button
              onClick={() => setSignMode(!signMode)}
              className={`flex items-center gap-1 px-2 py-1.5 text-xs font-medium rounded-md transition-colors ${
                signMode
                  ? 'bg-brand text-black border border-brand font-semibold'
                  : 'text-muted hover:text-secondary border border-border-subtle'
              }`}
            >
              <Flag size={12} />
              {signMode ? 'Done' : 'Drop Sign'}
            </button>
          </div>
        </div>
      </div>

      {/* Zone Summary Table */}
      <div className="bg-card rounded-xl border border-border-subtle overflow-hidden">
        <div className="px-4 py-3 border-b border-border-subtle flex items-center justify-between">
          <span className="text-sm font-medium text-primary">Zones</span>
          <button
            onClick={startNewZone}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-brand bg-brand/10 border border-brand/30 rounded-lg hover:bg-brand/20 transition-colors"
          >
            <Plus size={12} /> Add Zone
          </button>
        </div>
        {zones.length === 0 ? (
          <div className="px-4 py-8 text-center space-y-2">
            <p className="text-sm text-muted">No zones yet.</p>
            <p className="text-xs text-muted">Add a zone, then draw its boundary on the map to see which clients fall inside.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-[11px] uppercase tracking-wide text-muted">
                  <th className="text-left px-4 py-2.5 font-medium">Zone</th>
                  <th className="text-center px-3 py-2.5 font-medium cursor-pointer hover:text-secondary select-none" onClick={() => toggleSort('clients')}>
                    Clients <SortIcon col="clients" />
                  </th>
                  <th className="text-center px-3 py-2.5 font-medium">Status</th>
                  <th className="text-center px-3 py-2.5 font-medium hidden sm:table-cell">Boundary</th>
                  <th className="text-center px-3 py-2.5 font-medium w-28"></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((z) => {
                  const cfg = STATUS_CONFIG[z.status] || STATUS_CONFIG.Pause;
                  return (
                    <tr key={z.name} className="border-b border-border-subtle/50 last:border-0 hover:bg-surface-alt/50 transition-colors">
                      <td className="px-4 py-3 font-medium text-primary">{z.name}</td>
                      <td className="text-center px-3 py-3 text-brand font-semibold">{z.clients}</td>
                      <td className="text-center px-3 py-3">
                        <span className={`inline-block px-2 py-0.5 text-[11px] font-medium rounded-full ${cfg.bg} ${cfg.color} border ${cfg.border}`}>
                          {z.status}
                        </span>
                      </td>
                      <td className="text-center px-3 py-3 hidden sm:table-cell">
                        {z.polygon?.length >= 3
                          ? <span className="text-brand text-xs">{z.polygon.length} pts</span>
                          : <span className="text-muted text-xs">None</span>}
                      </td>
                      <td className="text-center px-3 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => setEditZone(z)} className="p-1 text-muted hover:text-secondary" title="Edit name/status"><Pencil size={13} /></button>
                          <button onClick={() => startEditBoundary(z)} className="p-1 text-muted hover:text-brand" title="Edit boundary"><Pentagon size={13} /></button>
                          <button onClick={() => handleDeleteZone(z.name)} className="p-1 text-muted hover:text-red-400" title="Delete zone"><Trash2 size={13} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Next Actions */}
      {actions.length > 0 && (
        <div className="bg-card rounded-xl border border-border-subtle overflow-hidden">
          <div className="px-4 py-3 border-b border-border-subtle flex items-center gap-2">
            <Megaphone size={14} className="text-brand" />
            <span className="text-sm font-medium text-primary">Next Actions</span>
          </div>
          <div className="divide-y divide-border-subtle/50">
            {actions.map((a, i) => (
              <div key={i} className="px-4 py-3 flex items-start gap-3 hover:bg-surface-alt/50 transition-colors">
                <span className="text-brand font-semibold text-sm min-w-[120px] shrink-0">{a.neighborhood}</span>
                <span className="text-secondary text-sm">{a.action}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Zone Modal — naming new zone after drawing */}
      {drawnPolygon && (
        <ZoneModal
          zone={null}
          onSave={handleSaveZone}
          onClose={() => setDrawnPolygon(null)}
        />
      )}

      {/* Zone Modal — editing existing zone name/status */}
      {editZone !== null && (
        <ZoneModal
          zone={editZone}
          onSave={handleSaveZone}
          onClose={() => setEditZone(null)}
        />
      )}

      {/* Confirm delete sign */}
      {confirmDeleteSign !== null && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setConfirmDeleteSign(null)}>
          <div className="bg-card border border-border-subtle rounded-xl w-full max-w-xs p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-primary">Remove Yard Sign?</h3>
            <p className="text-xs text-tertiary">
              This will remove the yard sign pin
              {signPins[confirmDeleteSign]?.createdAt
                ? ` placed on ${new Date(signPins[confirmDeleteSign].createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                : ''}.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDeleteSign(null)}
                className="flex-1 py-2 text-sm font-medium text-secondary border border-border-subtle rounded-lg hover:bg-surface-alt transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmRemoveSign}
                className="flex-1 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Summary Card ── */

function SummaryCard({ label, value, icon: Icon, highlight }) {
  return (
    <div className={`bg-card rounded-xl border p-4 flex flex-col gap-1 ${highlight ? 'border-brand/40' : 'border-border-subtle'}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] font-medium text-muted uppercase tracking-wide">{label}</span>
        <Icon size={14} className={highlight ? 'text-brand-text' : 'text-muted'} />
      </div>
      <span className={`text-2xl font-bold ${highlight ? 'text-brand' : 'text-primary'}`}>{value}</span>
    </div>
  );
}
