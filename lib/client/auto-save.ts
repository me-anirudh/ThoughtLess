import { executeSave } from './minio-save';
import { saveMetaData, getDraftMetaData, db } from '@/lib/client/text-editor-db';
import { useEditorStore } from '@/store/editor-store';

export class AutoSaveManager {
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private saveQueues = new Map<string, Promise<void>>();
  private readonly DEBOUNCE_MS = 3000;

 async trigger (filePath : string, content : string, bucketName : string) : Promise<void>{
  const store = useEditorStore.getState();
  const draftName = store.activeDrafts[filePath];
  const current = await getDraftMetaData(filePath, draftName);

  // Chain onto the save queue to serialize saves per file
  const previousSave = this.saveQueues.get(filePath) ?? Promise.resolve();
  const newSave = previousSave
    .then(() => executeSave(filePath, content, bucketName)).then(async()=> {
      if (current) {
        await db.transaction("rw", db.draftMetadata, async() => {            
          current.isSync = 1; 
          await saveMetaData(current); 
        })
      }
    })
    .catch((e) => {
      console.error("[AutoSave] Something went wrong", e); 
    });
  this.saveQueues.set(filePath, newSave);
 }  

  schedule(filePath: string, content: string, bucketName: string): void {
    const existing = this.timers.get(filePath);
    if (existing !== undefined) {
      clearTimeout(existing);
    }
    const timer = setTimeout(async() => {
      this.timers.delete(filePath);
      const store = useEditorStore.getState();
      const draftName = store.activeDrafts[filePath];
      const current = await getDraftMetaData(filePath, draftName);

      // Chain onto the save queue to serialize saves per file
      const previousSave = this.saveQueues.get(filePath) ?? Promise.resolve();
      const newSave = previousSave
        .then(() => executeSave(filePath, content, bucketName)).then(async()=> {
          if (current) {
            await db.transaction("rw", db.draftMetadata, async() => {            
              current.isSync = 1; 
              await saveMetaData(current); 
            })
          }
        })
        .catch((e) => {
          console.error("[AutoSave] Something went wrong", e); 
        });
      this.saveQueues.set(filePath, newSave);
    }, this.DEBOUNCE_MS);

    this.timers.set(filePath, timer);
  }

  cancel(filePath: string): void {
    const timer = this.timers.get(filePath);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.timers.delete(filePath);
    }
  }

  destroy(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }


}
