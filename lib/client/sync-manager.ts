import { getUnsyncedVCSMetadata, markVCSMetadataAsSynced } from '@/lib/client/vcs-db';
import { getUnsyncedDraftMetadata, markDraftMetadataAsSynced } from '@/lib/client/text-editor-db';

/**
 * Syncs all completely new or modified offline VCS Commits to PostgreSQL.
 * Uses atomic payload extraction to prevent race conditions.
 */
export async function syncVCSToSQL(): Promise<void> {
  try {
    const unsyncedData = await getUnsyncedVCSMetadata();

    if (
      unsyncedData.snapshots.length === 0 &&
      unsyncedData.edges.length === 0 &&
      unsyncedData.fileMaps.length === 0 &&
      unsyncedData.branches.length === 0
    ) {
      return;
    }

    const payloadIds = {
      snapshots: unsyncedData.snapshots.map(s => s.id),
      edges: unsyncedData.edges.map(e => [e.parentId, e.childId] as [string, string]),
      fileMaps: unsyncedData.fileMaps.map(m => [m.projectVersionId, m.filePath] as [string, string]),
      branches: unsyncedData.branches.map(b => b.branchName)
    };

    const response = await fetch('/api/vcs/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(unsyncedData),
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      throw new Error(`Server responded with ${response.status}`);
    }

    await markVCSMetadataAsSynced(payloadIds);
    console.log('[SyncManager] VCS Data successfully synced to PostgreSQL!');

  } catch (error) {
    console.error('[SyncManager] Error syncing VCS data:', error);
  }
}

/**
 * Syncs all un-synced Draft Metadata to PostgreSQL.
 * Uses atomic payload extraction to prevent race conditions during typing.
 */
export async function syncDraftsToSQL(): Promise<void> {
  try {
    // 1. Grab everything locally that is marked isSync: 0
    const unsyncedDrafts = await getUnsyncedDraftMetadata();

    if (unsyncedDrafts.length === 0) return;
    
    const payloadKeys: [string, string][] = unsyncedDrafts.map(d => [d.name, d.parentName]);
    
    const response = await fetch('/api/drafts/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ drafts: unsyncedDrafts }),
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      throw new Error(`Server responded with ${response.status}`);
    }

    await markDraftMetadataAsSynced(payloadKeys);
    console.log('[SyncManager] Draft metadata successfully synced to PostgreSQL!');

  } catch (error) {
    console.error('[SyncManager] Error syncing draft metadata:', error);
  }
}

/**
 * A combined helper that attempts to sync everything.
 * You can call this on startup to reconcile offline changes!
 */
export async function syncAllOfflineData(): Promise<void> {
    await Promise.allSettled([
        syncVCSToSQL(),
        syncDraftsToSQL()
    ]);
}
