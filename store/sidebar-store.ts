import { create } from 'zustand';
import type { SidebarState } from '@/types/interfaces';


export const useSidebarStore = create<SidebarState>((set) => ({
  folderName: '',
  fileTree: [],
  isProjectSelected: false,
  treeCache: {},
  setFolderName: (name: string) => set({ folderName: name }),
  setFileTree: (tree) => set({ fileTree: tree }),
  setProjectSelected: (selected: boolean) => set({ isProjectSelected: selected }),
  cacheTree: (bucket: string, tree: any[]) => set((state) => ({
    treeCache: { ...state.treeCache, [bucket]: tree }
  })),
}));

