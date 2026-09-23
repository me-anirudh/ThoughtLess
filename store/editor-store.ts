import { create } from 'zustand'
import { CachedFile, evictIfNeeded, touchAccess } from '@/lib/utils/lru-cache'
import { getDraftMetaData } from '@/lib/client/text-editor-db'

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export function getCacheKey(path: string, draftName: string): string {
    return `${path}::${draftName}`;
}

export interface EditorState {
  // File selection
  selectedFile: string

  // Which Draft of the selected file is active globally
  selectedDraft: string
  setSelectedDraft: (draftName: string) => void

  // Remembers the last opened draft for each file path
  activeDrafts: Record<string, string>
  setActiveDraft: (path: string, draftName: string) => void
  // Editor content
  buffer: string
  updateBuffer: (content: string) => void

  // ETag tracking
  currentETag: string
  setETag: (etag: string) => void

  // Dirty tracking
  lastPersistedBuffer: string
  isDirty: boolean

  // Save state
  saveStatus: SaveStatus
  setSaveStatus: (status: SaveStatus) => void

  // Tracks external loads (network, IDB) vs typing. Increment to force editor re-render.
  fileVersion: number

  // File content cache
  fileBuffers: Map<string, CachedFile> | Map<string, any>
  dirtyFiles: Set<string>

  // LRU access order tracking
  // accessOrder: string[]
  dateCreated: number, 
  setSelectedFile: (path: string, draftName?: string) => void, 
  bucketName: string
  setBucketName: (bucketName: string) => void
  parentName : string
  // Helpers to restore state from IndexedDB
  restoreDrafts: (drafts: { path: string, content: string }[]) => void
}

let fileSelectionCounter = 0;

export const useEditorStore = create<EditorState>((set, get) => ({
  selectedFile: '',
  selectedDraft : '',
  buffer: '',
  currentETag: '',
  lastPersistedBuffer: '',
  isDirty: false,
  saveStatus: 'idle',
  fileVersion: 0,
  fileBuffers: new Map(),
  dirtyFiles: new Set(),
  // accessOrder: [],
  bucketName: '',
  parentName : '', 
  dateCreated : 0, 
  activeDrafts: {},
  setActiveDraft: (path, draftName) => set((state) => ({
    activeDrafts: { ...state.activeDrafts, [path]: draftName }
  })),
  setSelectedDraft: (draftName) => set({ selectedDraft: draftName }),

  setSelectedFile: async (path, draftName?) => {
    const currentCounter = ++fileSelectionCounter;
    const parent = await getDraftMetaData(path, draftName); 
    if (currentCounter !== fileSelectionCounter) return;

    set((state) => {
      const nextDraft = draftName || state.activeDrafts[path] || '';
      return {
        selectedFile: path, 
        selectedDraft: nextDraft,
        activeDrafts: { ...state.activeDrafts, [path]: nextDraft },
        parentName: parent?.parentName ?? 'root', 
        dateCreated: parent?.created ?? Date.now()
      };
    });
  }, 
  setBucketName: (bucketName) => set({ bucketName }),
  setETag: (etag) => set({ currentETag: etag }),

  setSaveStatus: (status) => set({ saveStatus: status }),

  updateBuffer: (content) => {
    const state = get()
    if (!state.selectedFile || !state.selectedDraft) return

    const cacheKey = getCacheKey(state.selectedFile, state.selectedDraft);

    const newBuffers = new Map(state.fileBuffers);
    newBuffers.set(cacheKey, {
      content,
      etag: state.currentETag
    });
    
    let updatedEvict = touchAccess(newBuffers, cacheKey); 
    updatedEvict = evictIfNeeded(updatedEvict, state.dirtyFiles); 
   
    if (!state.dirtyFiles.has(cacheKey)) {
      const newDirtyFiles = new Set(state.dirtyFiles)
      newDirtyFiles.add(cacheKey)
      set({
        buffer: content,
        isDirty: true,
        dirtyFiles: newDirtyFiles,
        saveStatus: 'idle',
        ...(updatedEvict !== undefined ? { fileBuffers: updatedEvict } : {})
      });
    } else {
      set({
        buffer: content,
        isDirty: true,
        saveStatus: 'idle',
        ...(updatedEvict !== undefined ? { fileBuffers: updatedEvict } : {})
      })
    }
  },

  restoreDrafts: (drafts) => {
    const state = get()
    let newFileBuffers = new Map(state.fileBuffers)
    const newDirtyFiles = new Set(state.dirtyFiles)

    // Note: drafts here probably needs to contain draftName as well.
    // If not, this logic might need updates if `restoreDrafts` is still used.
    drafts.forEach(draft => {
      // Assuming draft object has a draftName property now
      const cacheKey = getCacheKey(draft.path, (draft as any).name || (draft as any).draftName || 'unknown');
      newFileBuffers.set(cacheKey, { content: draft.content, etag: '' })
      newDirtyFiles.add(cacheKey)
      newFileBuffers = touchAccess(newFileBuffers, cacheKey)
    })

    const activeCacheKey = state.selectedFile && state.selectedDraft 
      ? getCacheKey(state.selectedFile, state.selectedDraft) 
      : '';

    set({
      fileBuffers: newFileBuffers,
      dirtyFiles: newDirtyFiles,
      isDirty: activeCacheKey ? newDirtyFiles.has(activeCacheKey) : false,
      saveStatus: 'idle'
    })
  }
}))
