import { useState, useRef, useCallback } from 'react';

/** Wait for Google Maps Places library to load */
function getPlacesService() {
  if (window.google && google.maps && google.maps.places) {
    return {
      autocomplete: new google.maps.places.AutocompleteService(),
      details: new google.maps.places.PlacesService(document.createElement('div')),
    };
  }
  return null;
}

export default function useAddressAutocomplete() {
  const [search, setSearch] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const timerRef = useRef(null);
  const serviceRef = useRef(null);

  const updateSearch = useCallback((value) => {
    setSearch(value);
    setError(null);

    if (timerRef.current) clearTimeout(timerRef.current);

    if (value.trim().length < 3) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    timerRef.current = setTimeout(() => {
      // Lazy-init the Google services
      if (!serviceRef.current) {
        serviceRef.current = getPlacesService();
      }
      const svc = serviceRef.current;

      if (!svc) {
        setError('Maps not loaded yet');
        setLoading(false);
        return;
      }

      svc.autocomplete.getPlacePredictions(
        {
          input: value.trim(),
          types: ['address'],
          componentRestrictions: { country: 'us' },
        },
        (predictions, status) => {
          if (status !== google.maps.places.PlacesServiceStatus.OK || !predictions) {
            setSuggestions([]);
            setLoading(false);
            return;
          }

          // For each prediction, we need lat/lng — fetch details
          let pending = predictions.length;
          const results = [];

          predictions.forEach((p, i) => {
            svc.details.getDetails(
              { placeId: p.place_id, fields: ['geometry', 'formatted_address'] },
              (place) => {
                if (place && place.geometry) {
                  results[i] = {
                    displayName: place.formatted_address || p.description,
                    lat: place.geometry.location.lat(),
                    lng: place.geometry.location.lng(),
                    placeId: p.place_id,
                  };
                }
                pending--;
                if (pending <= 0) {
                  setSuggestions(results.filter(Boolean));
                  setLoading(false);
                }
              }
            );
          });
        }
      );
    }, 250);
  }, []);

  const clear = useCallback(() => {
    setSearch('');
    setSuggestions([]);
    setLoading(false);
    setError(null);
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  return { search, setSearch: updateSearch, suggestions, loading, error, clear };
}
