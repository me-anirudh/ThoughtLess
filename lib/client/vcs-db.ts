import Dexie, {type Table } from "dexie"; 
import { openDB } from 'idb'; 
import type { FileSnapshot, FileEdge, DeltaBlob, FullBlob, SnapshotFileMap, BranchHead } from '@/types/indexed-db-schema';
import type { CommitCategory } from '@/types/interfaces';
import { useGraphDataStore } from '@/store/graph-data-store';
class  VersionControlDatabase extends Dexie{

    // TODO: Add proper types once ProjectSnapshot/ProjectEdge interfaces are defined
    ProjectSnapshot!: Table<any, string>;
    ProjectEdges!: Table<any, [string, string]>;
    FileSnapshot!: Table<FileSnapshot, string>;
    FileEdge!: Table<FileEdge, [string, string]>;
    DeltaBlob!: Table<DeltaBlob, string>;
    FullBlob!: Table<FullBlob, string>;
    SnapshotFilemap!: Table<SnapshotFileMap, [string, string]>;
    BranchHead!: Table<BranchHead, string>;
    SnapshotIds!: Table<{id : string}, string>;  

    constructor() {
      super("VersionControldata"); 
      this.version(2).stores({
        ProjectSnapshot: 'id, timestamp, storesfullBlob',
        ProjectEdges: '[parentId+childId], parentId, childId',
        FileSnapshot: 'id, filePath, contentHash, parentIds, isSynced',
        FileEdge: '[parentId+childId], childId, parentId, isSynced',
        DeltaBlob: 'fileSnapshotId, baseSnapshotId',
        FullBlob: 'fileSnapshotId', 
        SnapshotFilemap: '[projectVersionId+filePath], fileSnapshotId, isSynced',
        BranchHead: 'branchName, headSnapshotId, isSynced', 
        SnapshotIds : 'id'
      });
      this.version(3).stores({
        FileEdge: '[parentId+childId], childId, parentId, filePath, isSynced',
      });
    }
}; 

const db = new VersionControlDatabase();
export async function mergeDraft(FileData : FileSnapshot, data : FullBlob | DeltaBlob) : Promise<void> {
      await db.transaction('rw', [db.FileSnapshot, db.FullBlob, db.DeltaBlob, db.FileEdge, db.SnapshotFilemap, db.SnapshotIds], async () => {
          await db.FileSnapshot.put(FileData);
          if(FileData.storageType === 'delta') {
             await db.DeltaBlob.put(data as DeltaBlob); 
          }
          else if(FileData.storageType === 'full')  {
              await db.FullBlob.put(data as FullBlob); 
          }  
           if (FileData.parentIds.length > 0) {
             await db.FileEdge.put({parentId : FileData.parentIds[0], 
                              childId : FileData.id, 
                              filePath : FileData.filePath,
                              isSynced: 0
             });
           }
           await db.SnapshotFilemap.put({projectId: FileData.projectId,
                               projectVersionId: FileData.projectVersionId, 
                               filePath : FileData.filePath,
                               fileSnapshotId : FileData.id,
                               isSynced: 0
           });
           await db.SnapshotIds.put({id : FileData.id})
      });
}
export async function getSnapshotIds(): Promise<{id: string}[]> {
    return await db.SnapshotIds.toArray();
} 
export async function getDraft(SnapshotId : FileSnapshot) : Promise<DeltaBlob | FullBlob | null>{
  let data ; 
    if(SnapshotId.storageType === 'full') data = await db.FullBlob.get(SnapshotId.id); 
    else if(SnapshotId.storageType === 'delta') data = await db.DeltaBlob.get(SnapshotId.id); 

    return data ?? null; 
}

export async function getFileMetadata(snapshotId: string): Promise<{ snapshot: FileSnapshot; blob: FullBlob | DeltaBlob }> {
    const snapshot = await db.FileSnapshot.get(snapshotId);
    if (!snapshot) throw new Error(`Snapshot ${snapshotId} not found in IndexedDB`);

    const blob = await getDraft(snapshot);
    if (!blob) throw new Error(`Blob for snapshot ${snapshotId} not found in IndexedDB`);

    return { snapshot, blob };
}

// ─── Helper: delete a snapshot from IndexedDB ────────────────────────────────
export async function deleteSnapshotFromIndexedDB(snapshotId: string): Promise<void> {
    await db.transaction('rw', [db.FileSnapshot, db.FullBlob, db.DeltaBlob, db.FileEdge, db.SnapshotFilemap], async () => {
        // 1. Delete the main snapshot
        await db.FileSnapshot.delete(snapshotId);
        
        // 2. Delete both blobs (Dexie safely ignores if one doesn't exist)
        await db.FullBlob.delete(snapshotId);
        await db.DeltaBlob.delete(snapshotId);
        
        // 3. Delete from FileEdge where this snapshot is the child
        const edgesToDelete = await db.FileEdge.where('childId').equals(snapshotId).toArray();
        for (const edge of edgesToDelete) {
            await db.FileEdge.delete([edge.parentId, edge.childId]);
        }

        // 4. Delete from SnapshotFilemap
        const filemapsToDelete = await db.SnapshotFilemap.where('fileSnapshotId').equals(snapshotId).toArray();
        for (const map of filemapsToDelete) {
            await db.SnapshotFilemap.delete([map.projectVersionId, map.filePath]);
        }
    });
}

// ─── Unified Diff Parser + Applier ───────────────────────────────────────────
// Parses a standard unified diff string (as produced by SerializersStage)
// and applies the hunks to reconstruct the new file from the old file.

interface ParsedHunk {
    oldStart: number;   // 1-indexed line number in the OLD file
    oldCount: number;   // number of lines from the old file this hunk covers
    lines: { type: 'equal' | 'insert' | 'delete'; content: string }[];
}

function parseUnifiedPatch(patch: string): ParsedHunk[] {
    const hunks: ParsedHunk[] = [];
    const patchLines = patch.split('\n');
    let i = 0;

    // Skip the header lines (--- a/... and +++ b/...)
    while (i < patchLines.length && !patchLines[i].startsWith('@@')) {
        i++;
    }

    while (i < patchLines.length) {
        const line = patchLines[i];

        // Parse hunk header:  @@ -oldStart,oldCount +newStart,newCount @@
        const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
        if (!hunkMatch) {
            i++;
            continue;
        }

        const hunk: ParsedHunk = {
            oldStart: parseInt(hunkMatch[1], 10),
            oldCount: hunkMatch[2] ? parseInt(hunkMatch[2], 10) : 1,
            lines: [],
        };
        i++;

        // Consume hunk body until the next hunk header or end of patch
        while (i < patchLines.length && !patchLines[i].startsWith('@@')) {
            const bodyLine = patchLines[i];
            if (bodyLine.startsWith('+')) {
                hunk.lines.push({ type: 'insert', content: bodyLine.slice(1) });
            } else if (bodyLine.startsWith('-')) {
                hunk.lines.push({ type: 'delete', content: bodyLine.slice(1) });
            } else if (bodyLine.startsWith(' ')) {
                hunk.lines.push({ type: 'equal', content: bodyLine.slice(1) });
            } else if (bodyLine === '') {
                // A bare empty line inside the hunk body is a context (equal)
                // line whose leading-space prefix was stripped or omitted by
                // the serializer.  BUT: the very last line of the patch
                // string after a final '\n' split is always '', so skip that.
                const isTrailingEnd = (i === patchLines.length - 1);
                if (!isTrailingEnd) {
                    hunk.lines.push({ type: 'equal', content: '' });
                }
            }
            i++;
        }

        hunks.push(hunk);
    }

    return hunks;
}

function applyUnifiedPatch(baseText: string, patch: string): string {
    const hunks = parseUnifiedPatch(patch);
    if (hunks.length === 0) return baseText;

    // Handle empty base text: split('') produces [''] which adds a phantom line
    const oldLines = baseText === '' ? [] : baseText.split('\n');
    const resultLines: string[] = [];

    // Pointer into the old file lines (0-indexed)
    let oldIdx = 0;

    for (const hunk of hunks) {
        // hunk.oldStart is 1-indexed → convert to 0-indexed
        const hunkStart = hunk.oldStart - 1;

        // Copy all unchanged lines BEFORE this hunk
        while (oldIdx < hunkStart) {
            resultLines.push(oldLines[oldIdx]);
            oldIdx++;
        }

        // Process the hunk lines
        for (const line of hunk.lines) {
            if (line.type === 'equal') {
                // Line exists in both old and new — copy it and advance old pointer
                resultLines.push(line.content);
                oldIdx++;
            } else if (line.type === 'delete') {
                // Line exists only in old file — skip it (advance old pointer, don't copy)
                oldIdx++;
            } else if (line.type === 'insert') {
                // Line exists only in new file — add it (don't advance old pointer)
                resultLines.push(line.content);
            }
        }
    }

    // Copy any remaining lines after the last hunk
    while (oldIdx < oldLines.length) {
        resultLines.push(oldLines[oldIdx]);
        oldIdx++;
    }

    return resultLines.join('\n');
}

// ─── File Reconstruction ─────────────────────────────────────────────────────
// Walks backward from `targetSnapshotId` through the delta chain until it
// finds a FullBlob, then applies patches forward to reconstruct the full text.

const MAX_CHAIN_DEPTH = 100;     // Safety limit to prevent infinite loops on corrupt data
const decoder = new TextDecoder();   // Shared instance — avoids allocation per call

export async function reconstructFile(targetSnapshotId: string): Promise<string> {
    const patchChain: ArrayBuffer[] = [];
    let currentId = targetSnapshotId;
    let baseText = '';
    let depth = 0;

    // ── Phase 1: Backward walk — collect patches until we hit a FullBlob ──
    while (true) {
        if (depth++ > MAX_CHAIN_DEPTH) {
            throw new Error(
                `Delta chain exceeded ${MAX_CHAIN_DEPTH} links from ${targetSnapshotId}. ` +
                `This likely indicates corrupt data or a missing FullBlob snapshot.`
            );
        }

        const { snapshot, blob } = await getFileMetadata(currentId);

        if (snapshot.storageType === 'full') {
            // Base case — decode the full content and stop walking
            baseText = decoder.decode((blob as FullBlob).content);
            break;
        } else if (snapshot.storageType === 'delta') {
            const delta = blob as DeltaBlob;
            // unshift so oldest patch ends up at index 0
            patchChain.unshift(delta.patchData);
            currentId = delta.baseSnapshotId;
        } else {
            throw new Error(`Unknown storageType '${snapshot.storageType}' for snapshot ${currentId}`);
        }
    }

    // ── Phase 2: Forward walk — apply patches chronologically ──
    let text = baseText;

    for (const patchBuffer of patchChain) {
        const patchString = decoder.decode(patchBuffer);
        text = applyUnifiedPatch(text, patchString);
    }

    return text;
}

// ─── VCS Helpers ─────────────────────────────────────────────────────────────

export async function getLatestSnapshotIdForFile(projectVersionId: string, filePath: string): Promise<string | null> {
    const map = await db.SnapshotFilemap.get([projectVersionId, filePath]);
    return map ? map.fileSnapshotId : null;
}

export async function getChainDepth(targetSnapshotId: string): Promise<number> {
    let currentId = targetSnapshotId;
    let depth = 0;

    while (true) {
        if (depth >= MAX_CHAIN_DEPTH) break;
        
        const snapshot = await db.FileSnapshot.get(currentId);
        if (!snapshot || snapshot.storageType === 'full') break;

        const blob = await getDraft(snapshot);
        if (!blob || snapshot.storageType !== 'delta') break;

        currentId = (blob as DeltaBlob).baseSnapshotId;
        depth++;
    }

    return depth;
}

// ─── Sync Helpers ─────────────────────────────────────────────────────────────

export async function getUnsyncedVCSMetadata() {
    const [snapshots, edges, fileMaps, branches] = await Promise.all([
        db.FileSnapshot.where('isSynced').equals(0).toArray(),
        db.FileEdge.where('isSynced').equals(0).toArray(),
        db.SnapshotFilemap.where('isSynced').equals(0).toArray(),
        db.BranchHead.where('isSynced').equals(0).toArray()
    ]);

    return { snapshots, edges, fileMaps, branches };
}

export async function markVCSMetadataAsSynced(payload: { 
    snapshots: string[], 
    edges: [string, string][], 
    fileMaps: [string, string][], 
    branches: string[] 
}) {
    await db.transaction('rw', [db.FileSnapshot, db.FileEdge, db.SnapshotFilemap, db.BranchHead], async () => {
        
        if (payload.snapshots.length > 0) {
            await db.FileSnapshot.where('id').anyOf(payload.snapshots).modify({ isSynced: 1 });
        }
        if (payload.edges.length > 0) {
            await db.FileEdge.where('[parentId+childId]').anyOf(payload.edges).modify({ isSynced: 1 });
        }
        if (payload.fileMaps.length > 0) {
            await db.SnapshotFilemap.where('[projectVersionId+filePath]').anyOf(payload.fileMaps).modify({ isSynced: 1 });
        }
        if (payload.branches.length > 0) {
            await db.BranchHead.where('branchName').anyOf(payload.branches).modify({ isSynced: 1 });
        }
    });
}

// ─── Graph Store Loader ───────────────────────────────────────────────────────

export async function loadActiveFileMapFromDB(): Promise<Record<string, FileSnapshot>> {
    try {
        const snapshots = await db.FileSnapshot.toArray();
        const map: Record<string, FileSnapshot> = {};
        // Sort chronologically so latest snapshot is default active for each file
        snapshots.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        for (const snap of snapshots) {
            if (snap.filePath) {
                map[snap.filePath] = snap;
            }
        }
        return map;
    } catch (err) {
        console.error('[loadActiveFileMapFromDB] Failed:', err);
        return {};
    }
}

// Loads FileSnapshots and FileEdges for a single specific file from IndexedDB
export async function loadGraphDataForFile(filePath: string): Promise<FileSnapshot[]> {
    try {
        if (!filePath) {
            useGraphDataStore.getState().setData([], new Map(), new Map(), null, null, '');
            return [];
        }

        const snapshots = await db.FileSnapshot.where('filePath').equals(filePath).toArray();
        const snapshotIds = new Set(snapshots.map(s => s.id));
        const edges = await db.FileEdge.filter(edge => 
            edge.filePath === filePath || snapshotIds.has(edge.childId)
        ).toArray();

        // Sort chronologically
        snapshots.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

        const childMap = new Map<string, string[]>();
        const categories = new Map<string, CommitCategory>();

        for (const snap of snapshots) {
            if (snap.category) {
                categories.set(snap.id, snap.category);
            }
        }

        for (const edge of edges) {
            const existing = childMap.get(edge.parentId) || [];
            if (!existing.includes(edge.childId)) {
                existing.push(edge.childId);
                childMap.set(edge.parentId, existing);
            }
        }

        // Also ensure all snap.parentIds are represented in childMap
        for (const snap of snapshots) {
            for (const parentId of snap.parentIds || []) {
                const existing = childMap.get(parentId) || [];
                if (!existing.includes(snap.id)) {
                    existing.push(snap.id);
                    childMap.set(parentId, existing);
                }
            }
        }

        const currentActive = useGraphDataStore.getState().activeFileMap[filePath] 
            || (snapshots.length > 0 ? snapshots[snapshots.length - 1] : null);
        const main = snapshots.find(s => s.id === 'root' || (!s.parentIds || s.parentIds.length === 0)) 
            || (snapshots.length > 0 ? snapshots[0] : null);

        useGraphDataStore.getState().setData(
            snapshots,
            childMap,
            categories,
            currentActive,
            main,
            filePath
        );

        const { useGraphSidebarStore } = await import('@/store/graph-sidebar');
        const { getAuthorName } = await import('@/lib/utils/project');
        const author = getAuthorName();
        const recentCommits = snapshots
            .filter(s => s.id !== 'root')
            .map(s => ({
                id: s.id,
                hash: s.id.substring(0, 7),
                message: s.name || 'Commit',
                author,
                timestamp: s.timestamp || Date.now(),
            }))
            .reverse();
        useGraphSidebarStore.setState({ recentCommits });

        return snapshots;
    } catch (err) {
        console.error(`[loadGraphDataForFile] Failed for ${filePath}:`, err);
        return [];
    }
}

// Loads all active file mappings from IndexedDB and scopes current graph to selected file
export async function loadGraphDataFromDB(): Promise<FileSnapshot[]> {
    try {
        const { useEditorStore } = await import('@/store/editor-store');
        const selectedFile = useEditorStore.getState().selectedFile;

        // 1. Populate activeFileMap for all files in the project
        const activeMap = await loadActiveFileMapFromDB();
        const currentStore = useGraphDataStore.getState();
        useGraphDataStore.setState({
            activeFileMap: {
                ...activeMap,
                ...currentStore.activeFileMap
            }
        });

        // 2. Load the specific version history for the selected file if present
        if (selectedFile) {
            return await loadGraphDataForFile(selectedFile);
        }

        return await db.FileSnapshot.toArray();
    } catch (err) {
        console.error('[loadGraphDataFromDB] Failed to load snapshots:', err);
        return [];
    }
}
