import { useState, useCallback } from 'react';

/**
 * Custom hook for address → lat/lng geocoding via Nominatim (free, no API key).
 */
export function useGeocode() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const geocode = useCallback(async (address) => {
    if (!address.trim()) return null;
    setLoading(true);
    setError(null);

    try {
      const q = encodeURIComponent(address.trim());
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${q}`,
        { headers: { 'Accept': 'application/json' } }
      );
      const data = await res.json();
      if (!data.length) {
        setError('Address not found');
        return null;
      }
      return {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon),
        displayName: data[0].display_name,
      };
    } catch {
      setError('Geocoding failed');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { geocode, loading, error };
}
