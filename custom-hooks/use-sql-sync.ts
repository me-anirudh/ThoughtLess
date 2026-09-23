import { useEffect, useRef } from 'react';
import { syncAllOfflineData } from '@/lib/client/sync-manager';

const SYNC_INTERVAL_MS = 10000; // Run every 10 seconds

export function useSQLSync() {
  const isSyncing = useRef(false);

  useEffect(() => {
    // Also try syncing immediately on component mount (e.g. app startup)
    syncAllOfflineData().catch(console.error);

    const intervalId = setInterval(async () => {
      if (isSyncing.current) return; // Prevent overlapping syncs if one takes too long
      
      try {
        isSyncing.current = true;
        await syncAllOfflineData();
      } catch (error) {
        console.error('[SQL Sync Timer] Error during background sync:', error);
      } finally {
        isSyncing.current = false;
      }
    }, SYNC_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, []);
}
