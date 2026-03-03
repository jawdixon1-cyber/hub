import { useState, useCallback } from 'react';
import { X, Search, MapPin } from 'lucide-react';
import MapView from './MapView';
import MeasurementList from './MeasurementList';
import { useGeocode } from './useGeocode';
import { resetColorIndex } from './mapUtils';

export default function PropertyMapperModal({ initialData, onSave, onClose }) {
  const [measurements, setMeasurements] = useState(initialData?.measurements || []);
  const [mapCenter, setMapCenter] = useState(initialData?.mapCenter || null);
  const [address, setAddress] = useState(initialData?.mapAddress || '');
  const { geocode, loading, error } = useGeocode();

  // Reset color index on mount so colors cycle from start
  useState(() => resetColorIndex());

  const handleSearch = async (e) => {
    e.preventDefault();
    const result = await geocode(address);
    if (result) {
      setMapCenter({ lat: result.lat, lng: result.lng });
    }
  };

  const handleUpdateMeasurement = (id, updates) => {
    setMeasurements((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...updates } : m))
    );
  };

  const handleDeleteMeasurement = (id) => {
    setMeasurements((prev) => prev.filter((m) => m.id !== id));
  };

  const handleSave = () => {
    onSave({
      measurements,
      mapCenter,
      mapAddress: address,
    });
    onClose();
  };

  const onMeasurementsChange = useCallback((updater) => {
    setMeasurements(updater);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/50">
      <div className="flex flex-col h-full max-h-full bg-card sm:m-4 sm:rounded-2xl sm:shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-green-500 to-emerald-600 px-6 py-4 relative shrink-0">
          <button
            onClick={onClose}
            className="absolute top-3 right-4 text-white/80 hover:text-white transition-colors cursor-pointer"
          >
            <X size={24} />
          </button>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <MapPin size={22} />
            Measure Property
          </h2>
        </div>

        {/* Address search */}
        <div className="px-6 py-3 border-b border-border-subtle shrink-0">
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Enter property address..."
                className="w-full rounded-lg border border-border-strong bg-card pl-4 pr-4 py-2.5 text-primary text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2.5 rounded-lg bg-gradient-to-r from-green-500 to-emerald-600 text-white font-medium text-sm hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 flex items-center gap-2"
            >
              <Search size={16} />
              {loading ? 'Searching...' : 'Search'}
            </button>
          </form>
          {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
        </div>

        {/* Map */}
        <div className="flex-1 min-h-0 relative">
          <MapView
            center={mapCenter}
            measurements={measurements}
            onMeasurementsChange={onMeasurementsChange}
          />
        </div>

        {/* Measurements list + save */}
        <div className="px-6 py-4 border-t border-border-subtle shrink-0 max-h-[35vh] overflow-y-auto">
          <MeasurementList
            measurements={measurements}
            onUpdate={handleUpdateMeasurement}
            onDelete={handleDeleteMeasurement}
          />
          <div className="flex justify-end pt-3 mt-2">
            <button
              onClick={handleSave}
              className="px-6 py-2.5 rounded-lg bg-gradient-to-r from-green-500 to-emerald-600 text-white font-medium hover:opacity-90 transition-opacity cursor-pointer"
            >
              Save &amp; Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
