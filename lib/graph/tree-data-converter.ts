import { FileSnapshot } from "@/types/indexed-db-schema";
import { getActiveProjectId, getActiveProjectVersionId } from "@/lib/utils/project";

export interface D3TreeNode{
        id : string, 
        children ?: D3TreeNode[], 
        snapshot : FileSnapshot
}

export interface MergeEdge {
        sourceId: string;  // parent that was skipped
        targetId: string;  // the merge commit
}

export interface TreeBuildResult {
        root: D3TreeNode;
        mergeEdges: MergeEdge[];
}

export default function buildD3Tree(
        rootId : string, 
        childMap : Map<string, string[]>, 
        snapshotMap : Map<string, FileSnapshot>, 
        visited ?: Set<string>,
        mergeEdges ?: MergeEdge[]
): TreeBuildResult {

        const seen = visited || new Set<string>(); 
        const edges = mergeEdges || [];
        seen.add(rootId); 

        const childIds = childMap.get(rootId) || [];
        const children: D3TreeNode[] = [];

        for (const childId of childIds) {
                if (seen.has(childId)) {
                        // This is a merge edge — the child was already placed in another parent's subtree
                        edges.push({ sourceId: rootId, targetId: childId });
                } else if (snapshotMap.has(childId) || childMap.has(childId)) {
                        const childResult = buildD3Tree(childId, childMap, snapshotMap, seen, edges);
                        children.push(childResult.root);
                }
        }

        const snapshot: FileSnapshot = snapshotMap.get(rootId) || {
                id: rootId,
                projectId: getActiveProjectId(),
                projectVersionId: getActiveProjectVersionId(),
                filePath: rootId,
                contentHash: rootId,
                storageType: 'full',
                parentIds: [],
                byteSize: 0,
                language: null,
                timestamp: Date.now(),
                category: 'feature',
                name: rootId,
                isSynced: 1
        };

        const node: D3TreeNode = {
                id : rootId, 
                snapshot : snapshot, 
                children : children.length > 0 ? children : undefined
        };

        return { root: node, mergeEdges: edges };
}
