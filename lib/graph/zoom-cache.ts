import { LayoutSnapshot } from "./layout-snapshot";
//The whole Purpose of this particular Section is that this file stops us from recalculating the file 
//again and again when we zoom, the moment we load the graph is the moment we calculate every coordinate and then
//eventually things will turn out smooth for the app coz we will cache everything. 
export class RevisionCache {
    // 1. We track the current "version" of the raw data
    private dataRevision: number = 0;
    
    // 2. We store the most recently calculated math result
    private cachedSnapshot: LayoutSnapshot | null = null;

    /**
     * Call this ONLY when a new commit is added or deleted.
     * This bumps the version number, meaning the cache is now "dirty" (outdated).
     */
    public markDataDirty() {
        this.dataRevision++;
    }

    /**
     * The Frame Loop calls this 60 times a second. 
     * If it returns true, we HAVE to run the heavy math.
     * If it returns false, we can skip the math!
     */
    public needsRecompute(): boolean {
        // We always need to compute if we don't have a snapshot yet
        if (!this.cachedSnapshot) return true;
        
        // We need to recompute if the snapshot's version doesn't match the data's version
        return this.cachedSnapshot.revision !== this.dataRevision;
    }

    /**
     * Returns the cached snapshot to hand directly to the renderer.
     */
    /**
     * Returns the cached LayoutSnapshot to hand directly to the renderer.
     */
    public getSnapshot(): LayoutSnapshot | null {
        return this.cachedSnapshot;
    }

    /**
     * After the Layout Engine finishes running the heavy math, 
     * it saves the result here so we can reuse it next frame.
     */
    public saveSnapshot(snapshot: LayoutSnapshot) {
        this.cachedSnapshot = snapshot;
    }

    /**
     * When the Layout Engine creates a new snapshot, it needs to stamp it 
     * with the current version number. It gets that number here.
     */
    public getCurrentRevision(): number {
        return this.dataRevision;
    }
}
