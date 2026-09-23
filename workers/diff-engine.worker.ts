import { DiffEngine, DiffInput, DiffResult } from "../lib/diff-engine";
import { reconstructFile } from "../lib/client/vcs-db";

interface WorkerInput {
    parentSnapshotId: string;
    draftContent: string;
}

self.onmessage = async ({ data }: MessageEvent<WorkerInput>) => {
    try {
        // Fetch and reconstruct the parent text from IndexedDB
        const parentContent = await reconstructFile(data.parentSnapshotId);

        const ctx: DiffInput = {
            oldContent: parentContent,
            newContent: data.draftContent,
        };

        const work = new DiffEngine();
        const result: DiffResult = work.compare(ctx);

        self.postMessage({ success: true, result });
    } catch (error: any) {
        self.postMessage({ success: false, error: error.message });
    }
};

export {};
