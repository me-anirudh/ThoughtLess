import { useEffect } from 'react'
import { useEditorStore } from '@/store/editor-store'
import { getAllDrafts } from '@/lib/client/text-editor-db'
import { loadGraphDataFromDB } from '@/lib/client/vcs-db'

export function useDraftRecovery() {
  useEffect(() => {
    let isCancelled = false;
    async function recover() {
      try {
        const drafts = await getAllDrafts()
        if (isCancelled) return;
        if (drafts.length > 0) {
          console.log(`[Draft Recovery] Recovered ${drafts.length} drafts from IndexedDB.`)
          
          const currentBucket = useEditorStore.getState().bucketName;
          const relevantDrafts = currentBucket
            ? drafts.filter(d => !d.bucketName || d.bucketName === currentBucket)
            : drafts;

          if (relevantDrafts.length > 0) {
            useEditorStore.getState().restoreDrafts(relevantDrafts)
          }
          
          // Only guess bucketName from drafts if none is set in editor store
          if (!useEditorStore.getState().bucketName && drafts[0].bucketName) {
            useEditorStore.getState().setBucketName(drafts[0].bucketName)
          }
        }
      } catch (err) {
        console.error('Failed to recover drafts:', err)
      }

      if (isCancelled) return;

      // Also restore VCS graph data from IndexedDB
      try {
        await loadGraphDataFromDB()
      } catch (err) {
        console.error('Failed to recover graph data:', err)
      }
    }
    recover()

    return () => {
      isCancelled = true;
    }
  }, [])
}
