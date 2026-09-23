export const MAX_CACHED_FILES = 20;

export interface CachedFile {
  content: string;
  etag: string;
}

export function evictIfNeeded(
  fileBuffers: Map<string, CachedFile> | Map<string, any>,
  dirtyFiles: Set<string>
) : (Map<string, any> | Map<string, CachedFile>){
  if (fileBuffers.size <= MAX_CACHED_FILES) {
    return  fileBuffers ;
  }

  const newFileBuffers : (Map<string, CachedFile> | Map<string, any>) = new Map(fileBuffers);
  // const newAccessOrder = [...accessOrder];
  while (newFileBuffers.size > MAX_CACHED_FILES) {
    let indexToEvict : (string | undefined); 
    for(const key of newFileBuffers.keys()){
      if(!dirtyFiles.has(key)){
       indexToEvict = key;     
       break; 
      }

    }

    // If all are dirty, evict the oldest file (index 0)
    // It remains in dirtyFiles, so u nsaved status is preserved and can be restored from IndexedDB
    if (!indexToEvict) {
      indexToEvict = newFileBuffers.keys().next().value;
      if(!indexToEvict)return newFileBuffers; 
    }

    // const pathToEvict = indexToEvict;
    newFileBuffers.delete(indexToEvict);
    // newFile.splice(indexToEvict, 1);
  }

  return newFileBuffers;
}

export function touchAccess(
  fileBuffers: Map<string, CachedFile> | Map<string, any>,
  path: string, 
  
) {
  const newFileBuffers = new Map(fileBuffers);
  const entry = newFileBuffers.get(path);
  
  if (entry) {
    newFileBuffers.delete(path); 
    newFileBuffers.set(path, entry);
  }
  
  return newFileBuffers;
}
