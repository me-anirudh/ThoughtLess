import { create } from "zustand";

interface NodeOffsetState {
    offsets: Record<string, { x: number; y: number }>;
    setNodeOffset: (id: string, x: number, y: number) => void;
    updateNodeOffset: (id: string, dx: number, dy: number) => void;
    resetOffsets: () => void;
}

export const useNodeOffsetStore = create<NodeOffsetState>((set) => ({
    offsets: {},
    setNodeOffset: (id, x, y) => set((state) => ({
        offsets: {
            ...state.offsets,
            [id]: { x, y }
        }
    })),
    updateNodeOffset: (id, dx, dy) => set((state) => {
        const current = state.offsets[id] || { x: 0, y: 0 };
        return {
            offsets: {
                ...state.offsets,
                [id]: { x: current.x + dx, y: current.y + dy }
            }
        };
    }),
    resetOffsets: () => set({ offsets: {} })
}));
