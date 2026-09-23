import { DiffEngine } from '@/lib/diff-engine';
import { reconstructFile } from '@/lib/client/vcs-db';
import { useEditorStore } from '@/store/editor-store';
import type { FileSnapshot } from '@/types/indexed-db-schema';

export interface DiffPreviewLine {
    type: 'insert' | 'delete' | 'equal';
    lineNum: number | string;
    content: string;
}

export interface FormattedDiffLine {
    type: 'insert' | 'delete' | 'equal';
    oldLineNum?: number;
    newLineNum?: number;
    content: string;
}

export interface FormattedHunk {
    oldStart: number;
    oldCount: number;
    newStart: number;
    newCount: number;
    header: string;
    lines: FormattedDiffLine[];
}

export interface NodeDiffSummary {
    commitId: string;
    parentCommitId: string | null;
    oldContent: string;
    newContent: string;
    addedLines: number;
    deletedLines: number;
    totalLines: number;
    previewLines: DiffPreviewLine[];
    hunks: FormattedHunk[];
    unifiedDiff: string;
    identical: boolean;
}

// In-memory cache for fast repeated lookups across re-renders
const diffCache = new Map<string, NodeDiffSummary>();
const inFlightPromises = new Map<string, Promise<NodeDiffSummary>>();

/**
 * Resolves the full text content of a snapshot from IndexedDB or editor RAM buffer.
 */
export async function resolveSnapshotContent(snapshotId: string, filePath?: string): Promise<string> {
    if (snapshotId === 'root') {
        try {
            return await reconstructFile(snapshotId);
        } catch {
            const store = useEditorStore.getState();
            const cacheKey = filePath || store.selectedFile || '';
            return store.fileBuffers.get(cacheKey)?.content || store.buffer || '';
        }
    }

    try {
        return await reconstructFile(snapshotId);
    } catch (err) {
        console.warn(`[resolveSnapshotContent] Failed to reconstruct file for ${snapshotId}:`, err);
        const store = useEditorStore.getState();
        const cacheKey = filePath || store.selectedFile || '';
        return store.fileBuffers.get(cacheKey)?.content || store.buffer || '';
    }
}

/**
 * Computes a rich diff for a snapshot against its parent (or empty if root).
 */
export async function computeNodeDiff(
    commit: FileSnapshot,
    parentCommit?: FileSnapshot | null
): Promise<NodeDiffSummary> {
    const commitId = commit.id;
    const parentId = parentCommit?.id || (commit.parentIds && commit.parentIds.length > 0 ? commit.parentIds[0] : null);
    const cacheKey = `${commitId}::${parentId || 'none'}`;

    if (diffCache.has(cacheKey)) {
        return diffCache.get(cacheKey)!;
    }

    // Deduplicate concurrent requests for the same diff
    if (inFlightPromises.has(cacheKey)) {
        return inFlightPromises.get(cacheKey)!;
    }

    const promise = (async () => {
        try {
            // 1. Resolve content for both sides
            const newContent = await resolveSnapshotContent(commitId, commit.filePath);
            const oldContent = parentId
                ? await resolveSnapshotContent(parentId, commit.filePath)
                : '';

            // 2. Run DiffEngine comparison
            const engine = new DiffEngine();
            const result = engine.compare({
                oldContent,
                newContent,
                options: {
                    filePath: commit.filePath || 'file',
                },
            });

            const addedLines = result.statistics?.addedLines ?? 0;
            const deletedLines = result.statistics?.deletedLines ?? 0;
            const totalLines = result.statistics?.totalLines ?? 0;
            const unifiedDiff = result.patches?.unified || '';
            const identical = result.metadata?.identical ?? (oldContent === newContent);

            // 3. Extract formatted hunks with line numbers
            const formattedHunks: FormattedHunk[] = [];
            const previewLines: DiffPreviewLine[] = [];

            if (result.patchAST?.hunks) {
                for (const rawHunk of result.patchAST.hunks) {
                    let curOld = rawHunk.oldStart;
                    let curNew = rawHunk.newStart;
                    const lines: FormattedDiffLine[] = [];

                    for (const line of rawHunk.lines) {
                        if (line.type === 'equal') {
                            lines.push({
                                type: 'equal',
                                oldLineNum: curOld++,
                                newLineNum: curNew++,
                                content: line.content,
                            });
                        } else if (line.type === 'delete') {
                            lines.push({
                                type: 'delete',
                                oldLineNum: curOld++,
                                newLineNum: undefined,
                                content: line.content,
                            });
                        } else if (line.type === 'insert') {
                            lines.push({
                                type: 'insert',
                                oldLineNum: undefined,
                                newLineNum: curNew++,
                                content: line.content,
                            });
                        }
                    }

                    formattedHunks.push({
                        oldStart: rawHunk.oldStart,
                        oldCount: rawHunk.oldCount,
                        newStart: rawHunk.newStart,
                        newCount: rawHunk.newCount,
                        header: `@@ -${rawHunk.oldStart},${rawHunk.oldCount} +${rawHunk.newStart},${rawHunk.newCount} @@`,
                        lines,
                    });
                }
            }

            // 4. Extract card preview lines (pick up to 3 key changed/context lines)
            if (formattedHunks.length > 0) {
                // Find first hunk with changes
                const targetHunk = formattedHunks.find(h => h.lines.some(l => l.type !== 'equal')) || formattedHunks[0];
                const changeIdx = targetHunk.lines.findIndex(l => l.type !== 'equal');
                
                // Select a slice centered around the first change
                const startIdx = Math.max(0, changeIdx - 1);
                const selectedLines = targetHunk.lines.slice(startIdx, startIdx + 3);

                for (const line of selectedLines) {
                    previewLines.push({
                        type: line.type,
                        lineNum: line.newLineNum || line.oldLineNum || '·',
                        content: line.content,
                    });
                }
            } else if (newContent.trim().length > 0) {
                // If no hunks (e.g. root initial file or all content)
                const contentLines = newContent.split('\n').slice(0, 3);
                contentLines.forEach((line, idx) => {
                    previewLines.push({
                        type: 'insert',
                        lineNum: idx + 1,
                        content: line,
                    });
                });
            }

            const summary: NodeDiffSummary = {
                commitId,
                parentCommitId: parentId,
                oldContent,
                newContent,
                addedLines,
                deletedLines,
                totalLines,
                previewLines,
                hunks: formattedHunks,
                unifiedDiff,
                identical,
            };

            diffCache.set(cacheKey, summary);
            return summary;
        } finally {
            inFlightPromises.delete(cacheKey);
        }
    })();

    inFlightPromises.set(cacheKey, promise);
    return promise;
}

export function getCachedNodeDiff(commitId: string, parentId?: string | null): NodeDiffSummary | undefined {
    const key = `${commitId}::${parentId || 'none'}`;
    return diffCache.get(key);
}
