import { useEditorStore } from '@/store/editor-store';
import { saveDraft } from '@/lib/client/text-editor-db';

interface BeaconFileEntry {
  path: string;
  content: string;
  bucketName: string;
}

export function registerDeathIntercept(): () => void {
  const handler = (event: BeforeUnloadEvent): void => {
    const { dirtyFiles, fileBuffers, bucketName, selectedFile, selectedDraft, buffer, currentETag, parentName, dateCreated} = useEditorStore.getState();
    if (dirtyFiles.size === 0) return;

    // 1. Flush dirty files to IndexedDB
    const beaconEntries: BeaconFileEntry[] = [];

    for (const cacheKey of dirtyFiles) {
      const [dirtyPath, draftName] = cacheKey.split('::');
      let content: string;
      let etag = '';

      if (dirtyPath === selectedFile && draftName === selectedDraft) {
        // The current buffer may be more recent than what's in fileBuffers
        content = buffer;
        etag = currentETag;
      } else {
        const cached = fileBuffers.get(cacheKey);
        if (!cached) continue;
        content = cached.content;
        etag = cached.etag;
      }

      // Fire-and-forget IDB save — we can't await in beforeunload
      saveDraft({
        path: dirtyPath,
        name: draftName,
        content: content,
        bucketName: bucketName,
        modified: Date.now(),
        etag: etag,
      }, {
        name: draftName, 
        parentName: parentName, 
        modified: Date.now(), 
        created: dateCreated,
        isSync: 0
      }).catch((err) => {
        console.error(`[death-intercept] IDB save failed for "${dirtyPath}":`, err);
      });

      beaconEntries.push({ path: dirtyPath, content, bucketName });
    }

    // 2. Best-effort sendBeacon
    if (beaconEntries.length > 0) {
      attemptBeacon(beaconEntries, selectedFile, buffer, bucketName);
    }

    // 3. Show browser confirmation dialog
    event.preventDefault();
    event.returnValue = 'You have unsaved changes';
  };

  window.addEventListener('beforeunload', handler);
  return () => window.removeEventListener('beforeunload', handler);
}

function attemptBeacon(
  entries: BeaconFileEntry[],
  selectedFile: string,
  currentBuffer: string,
  bucketName: string
): void {
  const MAX_BEACON_SIZE = 65536;

  // Try sending all dirty files
  const fullPayload = JSON.stringify({ files: entries });
  const fullBlob = new Blob([fullPayload], { type: 'text/plain' });

  if (fullBlob.size <= MAX_BEACON_SIZE) {
    const sent = navigator.sendBeacon('/api/files/save', fullBlob);
    if (sent) return;
    // If sendBeacon returned false, fall through to try smaller payload
  }

  // Payload too large or sendBeacon failed — prioritize the active file only
  if (selectedFile) {
    const singleEntry: BeaconFileEntry = {
      path: selectedFile,
      content: currentBuffer,
      bucketName,
    };
    const singlePayload = JSON.stringify({ files: [singleEntry] });
    const singleBlob = new Blob([singlePayload], { type: 'text/plain' });

    if (singleBlob.size <= MAX_BEACON_SIZE) {
      navigator.sendBeacon('/api/files/save', singleBlob);
      // If this also fails, we rely on IDB recovery
    }
    // If even a single file exceeds 64KB, skip sendBeacon entirely — IDB is our fallback
  }
}
