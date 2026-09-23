import { create } from 'zustand';
import type { NodeDiffSummary } from '@/lib/client/diff-service';

interface DiffStoreState {
    diffCache: Record<string, NodeDiffSummary>;
    loadingNodeIds: Record<string, boolean>;
    selectedCommitId: string | null;
    isInspectorOpen: boolean;

    setDiff: (commitId: string, summary: NodeDiffSummary) => void;
    setLoading: (commitId: string, loading: boolean) => void;
    selectCommit: (commitId: string | null) => void;
    openInspector: (commitId?: string) => void;
    closeInspector: () => void;
    clearCache: () => void;
}

export const useDiffStore = create<DiffStoreState>((set) => ({
    diffCache: {},
    loadingNodeIds: {},
    selectedCommitId: null,
    isInspectorOpen: false,

    setDiff: (commitId, summary) =>
        set((state) => ({
            diffCache: { ...state.diffCache, [commitId]: summary },
            loadingNodeIds: { ...state.loadingNodeIds, [commitId]: false },
        })),

    setLoading: (commitId, loading) =>
        set((state) => ({
            loadingNodeIds: { ...state.loadingNodeIds, [commitId]: loading },
        })),

    selectCommit: (commitId) =>
        set({
            selectedCommitId: commitId,
            isInspectorOpen: commitId !== null,
        }),

    openInspector: (commitId) =>
        set((state) => ({
            selectedCommitId: commitId || state.selectedCommitId,
            isInspectorOpen: true,
        })),

    closeInspector: () =>
        set({
            selectedCommitId: null,
            isInspectorOpen: false,
        }),

    clearCache: () =>
        set({
            diffCache: {},
            loadingNodeIds: {},
            selectedCommitId: null,
            isInspectorOpen: false,
        }),
}));
