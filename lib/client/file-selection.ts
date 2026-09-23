import { useEditorStore, getCacheKey } from '@/store/editor-store'
import { getDraft, getMostRecentDraft, getDraftMetaData } from './text-editor-db'
import { CachedFile, evictIfNeeded, touchAccess } from '@/lib/utils/lru-cache'
import { useGraphDataStore } from '@/store/graph-data-store'
import { reconstructFile, loadGraphDataForFile } from './vcs-db'

let currentSelectionId = 0;

export async function selectFileHandler(path: string, bucketName?: string, draftName?: string) {
  const selectionId = ++currentSelectionId;
  const store = useEditorStore.getState(); 
  const graphStore = useGraphDataStore.getState();
  const effectiveBucket = bucketName || store.bucketName;
  
  // Scope graph store to this file
  graphStore.setCurrentFilePath(path);
  loadGraphDataForFile(path).catch(err => console.error('[selectFileHandler] Failed to load graph for file:', err));

  // 1. Resolve which draft we are trying to open.
  // Defaults to whatever draft was last opened for this file in RAM.
  const activeDrafts = store.activeDrafts || {};
  let targetDraftName = draftName || activeDrafts[path];

  // 1.5 If not in RAM (e.g. after a page reload), ask IndexedDB for the most recently modified draft
  if (!targetDraftName) {
      const recentDraft = await getMostRecentDraft(path);
      if (selectionId !== currentSelectionId) return;
      if (recentDraft) {
          targetDraftName = recentDraft.name;
      }
  }

  // If no draft is explicitly selected, historically opened, or saved in IDB, we fallback to this file's active version.
  const activeFile = graphStore.activeFileMap[path] || null;
  if (!targetDraftName && activeFile) {
      targetDraftName = activeFile.name || `Version ${activeFile.id.substring(0, 7)}`;
  }

  // Final fallback: use the file's own basename. This is the common case for
  // freshly-uploaded files that have no IDB drafts and no graphStore.activeFile.
  if (!targetDraftName) {
      targetDraftName = path.split('/').filter(Boolean).pop() || 'Untitled';
  }

  if (store.selectedFile === path && store.selectedDraft === targetDraftName) {
      useGraphDataStore.getState().setGraphViewOpen(false);
      return;
  }

  // Await selection state update to prevent race conditions
  await store.setSelectedFile(path, targetDraftName); 
  if (selectionId !== currentSelectionId) return;

  useGraphDataStore.getState().setGraphViewOpen(false);
  const cacheKey = getCacheKey(path, targetDraftName);
  
  let newFileBuffers = new Map(store.fileBuffers); 
  newFileBuffers = touchAccess(newFileBuffers, cacheKey); 

  // 1. Check RAM cache (instant, synchronous)
  // During upload, files are cached with the bare path (no draft suffix).
  // Check both the composite key and the bare path key.
  let cached = store.fileBuffers.get(cacheKey)
  if (!cached) {
    const bareCached = store.fileBuffers.get(path);
    if (bareCached) {
      // Migrate the entry to the correct composite key so future lookups hit directly
      cached = bareCached;
      newFileBuffers.set(cacheKey, bareCached);
    }
  }
  if (cached) {
    useEditorStore.setState({
      buffer: cached.content,
      currentETag: cached.etag,
      lastPersistedBuffer: store.dirtyFiles.has(cacheKey) ? '' : cached.content,
      isDirty: store.dirtyFiles.has(cacheKey),
      saveStatus: 'idle',
      fileVersion: store.fileVersion + 1,
      fileBuffers : newFileBuffers
    })
    return;
  }
  
  // 2. Check IndexedDB (local disk, ~1ms, non-volatile)
  const draft = await getDraft(path, targetDraftName)
  if (selectionId !== currentSelectionId) return;

  if (draft) {
    // We have a local draft — load it instantly into the editor
    useEditorStore.setState((state) => {
      let currentFileBuffers = new Map(state.fileBuffers);
      currentFileBuffers = touchAccess(currentFileBuffers, cacheKey);
      currentFileBuffers.set(cacheKey, { content: draft.content, etag: draft.etag || '' })
      currentFileBuffers.set(path, { content: draft.content, etag: draft.etag || '' })

      const newDirtyFiles = new Set(state.dirtyFiles)
      newDirtyFiles.add(cacheKey); 
      currentFileBuffers = evictIfNeeded(currentFileBuffers, newDirtyFiles); 
      
      return {
        buffer: draft.content,
        currentETag: draft.etag || '',
        lastPersistedBuffer: '', 
        isDirty: true,
        fileBuffers: currentFileBuffers,
        dirtyFiles: newDirtyFiles,
        saveStatus: 'idle',
        fileVersion: state.fileVersion + 1
      }
    })
    return
  }

  // 3. No RAM cache, no IDB draft — fetch from server (MinIO) or local vcs-db
  let content = ''
  let etag = ''
  let isDirty = false
  
  if (activeFile) {
    try {
      // Fetch from local vcs-db (IndexedDB graph)
      content = await reconstructFile(activeFile.id);
      isDirty = true;
    } catch (err) {
      console.error('[selectFileHandler] Failed to reconstruct file from vcs-db:', err)
    }
  } else if (effectiveBucket) {
    try {
      // Fetch from server / MinIO
      const res = await fetch(`/api/files?bucket=${encodeURIComponent(effectiveBucket)}&path=${encodeURIComponent(path)}`);
      if (res.ok) {
        content = await res.text();
        etag = res.headers.get('ETag') || '';
        isDirty = false;
      } else {
        console.warn(`[selectFileHandler] File fetch returned ${res.status} for ${path}`);
      }
    } catch (err) {
      console.error('[selectFileHandler] Failed to fetch file from server:', err);
    }
  }

  if (selectionId !== currentSelectionId) return;

  useEditorStore.setState((state) => {
    let currentFileBuffers = new Map(state.fileBuffers)
    currentFileBuffers = touchAccess(currentFileBuffers, cacheKey)
    currentFileBuffers.set(cacheKey, { content, etag })
    currentFileBuffers.set(path, { content, etag })
    currentFileBuffers = evictIfNeeded(currentFileBuffers, state.dirtyFiles); 
    
    const newDirtyFiles = new Set(state.dirtyFiles);
    if (isDirty) {
      newDirtyFiles.add(cacheKey);
    } else {
      newDirtyFiles.delete(cacheKey);
    }

    return {
      buffer: content,
      currentETag: etag,
      lastPersistedBuffer: content,
      isDirty,
      dirtyFiles: newDirtyFiles,
      fileBuffers: currentFileBuffers,
      saveStatus: 'idle',
      fileVersion: state.fileVersion + 1
    }
  })
}

