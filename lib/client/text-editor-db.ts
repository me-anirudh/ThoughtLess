// import type { FileSnapshot, FileEdge, DeltaBlob, FullBlob, SnapshotFileMap, BranchHead } from '@/schema/indexedDbSchema';
import { DraftRecord, DraftMetadata } from '@/types/interfaces';
import Dexie, { type Table } from 'dexie';

export class TextEditorDatabase extends Dexie {
  drafts!: Table<DraftRecord, [string, string]>;
  draftMetadata !: Table<DraftMetadata, [string, string]>;
  constructor() {
    super('TextEditor');
    this.version(2).stores({
      drafts: '[path+name], path',  // Composite key: path + draftName
      draftMetadata : '[name+parentName], path, parentId, isSync' 
    });
  }
}

export const db = new TextEditorDatabase();

export async function saveDraft(draft: DraftRecord, draftMetadata : DraftMetadata): Promise<void> {
  await db.transaction('rw', [db.drafts, db.draftMetadata],async () => {
      await db.drafts.put(draft); 
      await db.draftMetadata.put(draftMetadata); 
  }
)}
export async function saveMetaData (draftMetadata : DraftMetadata){
  await db.draftMetadata.put(draftMetadata); 
}
export async function getDraft(path: string, draftName: string): Promise<DraftRecord | null> {
  const draft = await db.drafts.get([path, draftName]);
  return draft ?? null;
}

export async function getMostRecentDraft(path: string): Promise<DraftRecord | null> {
  const drafts = await db.drafts.where('path').equals(path).toArray();
  if (drafts.length === 0) return null;
  // Sort descending by modified timestamp
  drafts.sort((a, b) => (b.modified || 0) - (a.modified || 0));
  return drafts[0];
}

export async function getAllDrafts(): Promise<DraftRecord[]> {
  return await db.drafts.toArray();
}

export async function deleteDraft(path: string, draftName: string): Promise<void> {
  await db.drafts.delete([path, draftName]);
}

/**
 * Fully purges a draft from both `drafts` and `draftMetadata` tables
 * in a single transaction. Used by the discard flow.
 */
export async function deleteDraftFull(path: string, draftName: string): Promise<void> {
  await db.transaction('rw', [db.drafts, db.draftMetadata], async () => {
    await db.drafts.delete([path, draftName]);
    await db.draftMetadata.where('[name+parentName]')
      .equals([draftName, path])
      .delete();
  });
}

export async function clearAllDrafts(): Promise<void> {
  await db.drafts.clear();
}

export async function getDraftMetaData(path: string, draftName?: string): Promise<DraftMetadata | null> {
  if (draftName) {
    const data = await db.draftMetadata.get([draftName, path]);
    return data ?? null;
  }
  const data = await db.draftMetadata.where('path').equals(path).first(); 
  return data ?? null; 
}

export async function getAllDraftsForFile(path: string): Promise<DraftRecord[]> {
  const drafts = await db.drafts.where('path').equals(path).toArray();
  // Sort descending by modified timestamp
  drafts.sort((a, b) => (b.modified || 0) - (a.modified || 0));
  return drafts;
}

// --- Sync Helpers ---

export async function getUnsyncedDraftMetadata(): Promise<DraftMetadata[]> {
  // Returns all draft metadata where isSync is 0
  return await db.draftMetadata.where('isSync').equals(0).toArray();
}

export async function markDraftMetadataAsSynced(keys: [string, string][]): Promise<void> {
  // Keys is an array of the composite primary key: [name, parentName]
  await db.transaction('rw', [db.draftMetadata], async () => {
    if (keys.length > 0) {
      await db.draftMetadata.where('[name+parentName]').anyOf(keys).modify({ isSync: 1 });
    }
  });
}
