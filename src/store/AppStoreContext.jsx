import { createContext, useContext, useRef, useEffect } from 'react';
import { useStore } from 'zustand';
import { createAppStore } from './appStore';

const AppStoreContext = createContext(null);

export function AppStoreProvider({ cloudData, children }) {
  const storeRef = useRef(null);
  const initializedRef = useRef(false);
  if (!storeRef.current) {
    storeRef.current = createAppStore(cloudData);
  }

  // When Supabase data arrives after initial cache-based load, hydrate the store
  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      return; // Skip first render (store already created with this cloudData)
    }
    if (cloudData && storeRef.current?.hydrateFromCloud) {
      storeRef.current.hydrateFromCloud(cloudData);
    }
  }, [cloudData]);

  return (
    <AppStoreContext.Provider value={storeRef.current}>
      {children}
    </AppStoreContext.Provider>
  );
}

export function useAppStore(selector) {
  const store = useContext(AppStoreContext);
  if (!store) throw new Error('useAppStore must be used within AppStoreProvider');
  return useStore(store, selector);
}
