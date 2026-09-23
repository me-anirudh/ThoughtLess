  import { useEditorStore } from "@/store/editor-store";
  import { deleteDraftFull } from "./text-editor-db";
  export async function executeSave(filePath: string, content: string, bucketName: string): Promise<void> {
        
    const store = useEditorStore.getState();

    // Look up the cached entry for this file to get its etag
    const draftName = store.activeDrafts[filePath] || filePath.split('/').pop() || 'Untitled';
    const cacheKey = `${filePath}::${draftName}`;
    const cachedEntry = store.fileBuffers.get(cacheKey);
    const fileETag = cachedEntry?.etag ?? store.currentETag;

    // Skip if nothing has changed for this file
    if (filePath === store.selectedFile && content === store.lastPersistedBuffer) {
      return;
    }

    useEditorStore.setState({ saveStatus: 'saving' });

    try {
      const response = await fetch('/api/files', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(fileETag ? { 'If-Match': fileETag } : {}),
        },
        body: JSON.stringify({
          path: filePath,
          content,
          bucketName,
        }),
      });

      if (response.status === 412) {
        // ETag conflict — re-fetch to get latest version
        console.warn(`[auto-save] ETag conflict for "${filePath}". Re-fetching latest version.`);
        try {
          const refreshResponse = await fetch(
            `/api/files?path=${encodeURIComponent(filePath)}&bucket=${encodeURIComponent(bucketName)}`
          );
          if (refreshResponse.ok) {
            const latestContent = await refreshResponse.text();
          const latestETag = refreshResponse.headers.get('ETag') ?? '';

            const currentState = useEditorStore.getState();
            const updatedBuffers = new Map(currentState.fileBuffers);
            updatedBuffers.set(filePath, { content: latestContent, etag: latestETag });

            const stateUpdate: Record<string, unknown> = { fileBuffers: updatedBuffers };

            // If this is the currently selected file, update the visible buffer
            if (currentState.selectedFile === filePath) {
              stateUpdate.buffer = latestContent;
              stateUpdate.lastPersistedBuffer = latestContent;
              stateUpdate.currentETag = latestETag;
              stateUpdate.isDirty = false;
            }

            useEditorStore.setState(stateUpdate);
          }
        } catch (refreshError) {
          console.error(`[auto-save] Failed to re-fetch "${filePath}" after conflict:`, refreshError);
        }

        useEditorStore.setState({ saveStatus: 'error' });
        return;
      }

      if (!response.ok) {
        throw new Error(`Save failed with status ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      const newETag = result.etag ?? '';
      const currentState = useEditorStore.getState();
      const updatedBuffers = new Map(currentState.fileBuffers);
      const existingEntry = updatedBuffers.get(filePath);
      updatedBuffers.set(filePath, {
        content: existingEntry?.content ?? content,
        etag: newETag,
      });

      const updatedDirty = new Set(currentState.dirtyFiles);
      updatedDirty.delete(cacheKey);
      updatedDirty.delete(filePath);

      const stateUpdate: Record<string, unknown> = {
        fileBuffers: updatedBuffers,
        dirtyFiles: updatedDirty,
        saveStatus: 'saved',
      };

      // If this is the currently selected file, update editor state
      if (currentState.selectedFile === filePath) {
        stateUpdate.currentETag = newETag;
        stateUpdate.lastPersistedBuffer = content;
        stateUpdate.isDirty = false;
      }

      useEditorStore.setState(stateUpdate);
    } catch (error : unknown) {
          const originalMessage = error instanceof Error ? error.message : String(error);
  
          useEditorStore.setState({ saveStatus: 'error' });

          throw new Error(`[auto-save] Failed to save "${filePath}": ${originalMessage}`);
    }
  }
