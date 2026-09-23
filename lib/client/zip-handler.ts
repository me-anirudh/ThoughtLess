import JSZip from 'jszip'
import { ExtractedObject } from '@/types/interfaces'
import { useEditorStore } from '@/store/editor-store'

export async function processZipFile(file: File): Promise<ExtractedObject[]> {
  const zip = new JSZip()
  const content = await zip.loadAsync(file)

  // 1. First pass: normalize paths and filter junk/build files
  const rawEntries: { normPath: string; zipEntry: any; isFolder: boolean }[] = []

  for (const [path, zipEntry] of Object.entries(content.files)) {
    const normPath = path.replace(/\\/g, '/').replace(/^\/+/, '')
    if (!normPath) continue

    const parts = normPath.split('/').filter(Boolean)
    // Filter OS junk files
    if (
      normPath.startsWith('__MACOSX/') ||
      normPath.includes('/__MACOSX/') ||
      parts.some(p => p.startsWith('._') || p === '.DS_Store' || p === 'Thumbs.db')
    ) {
      continue
    }

    // Filter heavy dependency and build directories to avoid crashing memory
    if (parts.some(p => ['node_modules', '.git', '.next', '.turbo', 'dist', 'build', '.cache'].includes(p))) {
      continue
    }

    rawEntries.push({ normPath, zipEntry, isFolder: zipEntry.dir })
  }

  // 2. Check if all entries share a single common top-level directory (e.g. "repo-master/")
  let commonPrefix = ''
  const fileEntries = rawEntries.filter(e => !e.isFolder)
  if (fileEntries.length > 0) {
    const firstParts = fileEntries[0].normPath.split('/')
    if (firstParts.length > 1) {
      const candidate = firstParts[0]
      const allShare = rawEntries.every(e => {
        const p = e.normPath.split('/')
        return p[0] === candidate
      })
      if (allShare) {
        commonPrefix = candidate + '/'
      }
    }
  }

  // 3. Process extracted entries into clean ExtractedObject array
  const files: ExtractedObject[] = []
  const seenPaths = new Set<string>()

  for (const entry of rawEntries) {
    let cleanPath = entry.normPath
    if (commonPrefix && cleanPath.startsWith(commonPrefix)) {
      cleanPath = cleanPath.substring(commonPrefix.length)
    }

    // Remove trailing slash for consistent paths across DB and storage
    cleanPath = cleanPath.replace(/\/+$/, '')
    if (!cleanPath) continue // Was the stripped common root folder

    if (seenPaths.has(cleanPath)) continue
    seenPaths.add(cleanPath)

    const isFolder = entry.isFolder
    let text = ''
    if (!isFolder) {
      try {
        text = await entry.zipEntry.async('text')
      } catch (err) {
        console.warn(`Could not read text for ${cleanPath}:`, err)
        text = ''
      }
    }

    const name = cleanPath.split('/').filter(Boolean).pop() || cleanPath
    const size = (entry.zipEntry as any)._data ? (entry.zipEntry as any)._data.uncompressedSize : 0

    files.push({
      path: cleanPath,
      content: text,
      isFolder,
      name,
      size,
    })
  }

  return files
}

export async function uploadZipToProject(
  files: ExtractedObject[],
  bucketName: string,
  onProgress?: (completed: number, total: number) => void
) {
  // Batch size 50
  const BATCH_SIZE = 50
  const batches: ExtractedObject[][] = []
  
  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    batches.push(files.slice(i, i + BATCH_SIZE))
  }

  let completedFiles = 0
  const totalFiles = files.length

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i]
    try {
      const store = useEditorStore.getState()
      const currentBatch = batch.map(file => {
        const draftName = store.activeDrafts[file.path] || file.path.split('/').pop() || 'Untitled'
        const cacheKey = `${file.path}::${draftName}`
        const cached = store.fileBuffers.get(cacheKey)
        return {
          ...file,
          content: cached ? cached.content : file.content
        }
      })

      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ bucketName, files: currentBatch })
      })

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        throw new Error(errData.error || `Batch ${i + 1} upload failed: ${response.statusText}`)
      }
      
      const data = await response.json()
      
      completedFiles += batch.length
      if (onProgress) {
        onProgress(Math.min(completedFiles, totalFiles), totalFiles)
      }
      
      // Update ETags and cache in memory
      if (data.etags) {
         const currentState = useEditorStore.getState()
         const newBuffers = new Map(currentState.fileBuffers)
         let updatedCurrentEtag = currentState.currentETag
         
         data.etags.forEach(({ path, etag }: any) => {
           const existing = newBuffers.get(path)
           if (existing) {
             newBuffers.set(path, { ...existing, etag })
             if (path === currentState.selectedFile) {
               updatedCurrentEtag = etag
             }
           }
         })
         
         useEditorStore.setState({ 
           fileBuffers: newBuffers,
           ...(updatedCurrentEtag !== currentState.currentETag ? { currentETag: updatedCurrentEtag } : {})
         })
      }
    } catch (err) {
      console.error(`Error in batch upload ${i + 1}:`, err)
      throw err
    }
  }
}
