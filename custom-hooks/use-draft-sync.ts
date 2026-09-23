import { useEffect, useRef } from 'react'
import { useEditorStore } from '@/store/editor-store'
import { saveDraft, deleteDraft, getDraftMetaData, TextEditorDatabase } from '@/lib/client/text-editor-db'
import { DraftMetadata, DraftRecord } from '@/types/interfaces'
// import { timeStamp } from 'console'
//What we doing here is called DEBOUNCING, we are saving things in each interval, right when the user drops or stops writing. 
export function useDraftSync() {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // const db = new TextEditorDatabase(); 
  useEffect(() => {
    const unsubscribe = useEditorStore.subscribe(
      async (state, prevState) => {
        // Only run if buffer changed and we have a selected file
        if (state.buffer === prevState.buffer || !state.selectedFile || !state.isDirty) {
          // If we just saved and it's no longer dirty, we can delete the draft
          if (!state.isDirty && prevState.isDirty && state.saveStatus === 'saved') {
             // deletion is handled by AutoSaveManager, but we can do it here too just in case
             // deleteDraft(state.selectedFile).catch(console.error)
          }
          return
        }

        if (timeoutRef.current) clearTimeout(timeoutRef.current)

        const targetFile = state.selectedFile
        const targetDraft = state.selectedDraft
        const currentBuffer = state.buffer
        const currentBucket = state.bucketName
        const currentETag = state.currentETag

        timeoutRef.current = setTimeout(async () => {
          try {
            // Verify editor is still on the same file/draft before persisting
            const latestState = useEditorStore.getState()
            if (latestState.selectedFile !== targetFile || latestState.selectedDraft !== targetDraft) {
              return
            }

            const current = await getDraftMetaData(targetFile, targetDraft)
            const draft: DraftRecord = {
              path: targetFile,
              name: targetDraft,
              content: currentBuffer,
              bucketName: currentBucket,
              modified: Date.now(),
              etag: currentETag
            }
            const draftMetadata: DraftMetadata = {
              name: targetDraft, 
              parentName: current?.parentName ?? 'root', 
              path: targetFile,
              modified: Date.now(), 
              created: current?.created ?? Date.now(),
              isSync: 0
            }

            await saveDraft(draft, draftMetadata)
          } catch (err) {
            console.error('Failed to sync draft to IDB:', err)
          }
        }, 500)
      }
    )

    return () => {
      unsubscribe()
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])
}
