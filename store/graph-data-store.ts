import {create} from "zustand"; 


import { CommitCategory  } from "@/types/interfaces";
import { FileSnapshot } from "@/types/indexed-db-schema";
type CategoryMap = Map<string, CommitCategory>; 


interface graphStore {

        commits : Array<FileSnapshot>, 

        childMap : Map<string, string[]>

        categories : CategoryMap, 

        mainFile : FileSnapshot | null,

        // Per-file active version map: filePath -> FileSnapshot
        activeFileMap : Record<string, FileSnapshot>,
        activeFile : FileSnapshot | null, 
        setActiveFile : (activeFile : FileSnapshot | null) => void,
        setActiveFileForPath : (filePath : string, snapshot : FileSnapshot | null) => void,
        getActiveFileForPath : (filePath : string) => FileSnapshot | null,

        // Scoping: which file's version history is currently in the graph
        currentFilePath : string,
        setCurrentFilePath : (filePath : string) => void,

        pendingDraft : { id: string; parentId: string; content: string; name: string; path: string } | null,
        setPendingDraft : (draft: { id: string; parentId: string; content: string; name: string; path: string } | null) => void,
        clearPendingDraft : () => void,

        isGraphViewOpen : boolean,
        setGraphViewOpen : (isOpen : boolean) => void,
        toggleGraphView : () => void,

        setData : (commits : FileSnapshot[], 
                   childMap : Map<string, string[]>, 
                   categories : CategoryMap, 
                   activeFile : FileSnapshot | null,
                   mainFile : FileSnapshot | null,
                   filePath ?: string) => void, 

        addCommit :(commit: Array<FileSnapshot>, parentIds: string[], category: CommitCategory, activeFile ?: FileSnapshot) => void;
        removeCommit : (commitToRemove : string) => void; 
        
        
}   

export const useGraphDataStore = create<graphStore>((set, get)=>({
        commits : [], 
        childMap : new Map(), 
        categories : new Map(), 
        mainFile : null, 
        activeFileMap : {},
        activeFile : null,
        currentFilePath : '',

        setCurrentFilePath : (filePath : string) => {
            const state = get();
            set({
                currentFilePath: filePath,
                activeFile: state.activeFileMap[filePath] || null
            });
        },

        setActiveFile : (activeFile) => {
            const state = get();
            const filePath = activeFile?.filePath || state.currentFilePath;
            if (filePath && activeFile) {
                set({
                    activeFile,
                    activeFileMap: {
                        ...state.activeFileMap,
                        [filePath]: activeFile
                    }
                });
            } else {
                set({ activeFile });
            }
        },

        setActiveFileForPath : (filePath: string, snapshot: FileSnapshot | null) => {
            set((state) => {
                const newMap = { ...state.activeFileMap };
                if (snapshot) {
                    newMap[filePath] = snapshot;
                } else {
                    delete newMap[filePath];
                }
                return {
                    activeFileMap: newMap,
                    activeFile: state.currentFilePath === filePath ? snapshot : state.activeFile
                };
            });
        },

        getActiveFileForPath : (filePath: string) => {
            return get().activeFileMap[filePath] || null;
        },

        pendingDraft : null,
        setPendingDraft : (draft) => set({ pendingDraft: draft }),
        clearPendingDraft : () => set({ pendingDraft: null }),
        isGraphViewOpen : false,
        setGraphViewOpen : (isOpen) => set({ isGraphViewOpen: isOpen }),
        toggleGraphView : () => set((state) => ({ isGraphViewOpen: !state.isGraphViewOpen })),
        

        setData : (commits, childMap, categories, activeFile, mainFile, filePath?) => {
            set((state) => {
                const targetFilePath = filePath || state.currentFilePath;
                const newMap = { ...state.activeFileMap };
                if (targetFilePath && activeFile) {
                    newMap[targetFilePath] = activeFile;
                }
                return {
                    commits, 
                    childMap, 
                    categories, 
                    mainFile, 
                    currentFilePath: targetFilePath,
                    activeFileMap: newMap,
                    activeFile: activeFile || (targetFilePath ? newMap[targetFilePath] : null) || null
                };
            });
        },

        addCommit : (commit, parentIds, category, newActiveFile)=>set((state) => {
    
            const newCommits = [...state.commits, ...commit];
            const newChildMap = new Map(state.childMap);
            const newCategories = new Map(state.categories);
            
            // 1. Extract all the new IDs at once
            const newCommitIds = commit.map(c => c.id);

            // 2. Batch-update the Categories
            for (const newId of newCommitIds) {
                newCategories.set(newId, category);
            }

            // 3. Batch-update the Parents
            for (const parentId of parentIds) {
                const existingChildren = newChildMap.get(parentId) || [];
                newChildMap.set(parentId, [...existingChildren, ...newCommitIds]);
            }

            const commitFilePath = commit[0]?.filePath || state.currentFilePath;
            const newActiveMap = { ...state.activeFileMap };
            if (newActiveFile && commitFilePath) {
                newActiveMap[commitFilePath] = newActiveFile;
            }

            return {
              commits: newCommits,
              childMap: newChildMap,
              categories: newCategories,
              activeFileMap: newActiveMap,
              activeFile: (newActiveFile && commitFilePath === state.currentFilePath) 
                  ? newActiveFile 
                  : state.activeFile 
            };
        }),       

        removeCommit: (commitIdToRemove: string) => set((state) => {
            // 1. Remove the commit from the main array
            const newCommits = state.commits.filter(c => c.id !== commitIdToRemove);
            
            // 2. Remove the commit from the Categories Map
            const newCategories = new Map(state.categories);
            newCategories.delete(commitIdToRemove);
            // 3. Remove the commit from its parents' ChildMap arrays
            const newChildMap = new Map(state.childMap);
            newChildMap.forEach((childrenArray, parentId) => {
                // Filter out the commit we are removing
                const filteredChildren = childrenArray.filter(id => id !== commitIdToRemove);
                newChildMap.set(parentId, filteredChildren);
            });
            // 4. Delete the commit's own children entry from the map
            newChildMap.delete(commitIdToRemove);

            const newActiveMap = { ...state.activeFileMap };
            for (const [path, snap] of Object.entries(newActiveMap)) {
                if (snap.id === commitIdToRemove) {
                    delete newActiveMap[path];
                }
            }

            return {
                commits: newCommits,
                categories: newCategories,
                childMap: newChildMap,
                activeFileMap: newActiveMap,
                // 5. Clear activeFile/mainFile if they point to the removed commit
                activeFile: state.activeFile?.id === commitIdToRemove ? null : state.activeFile,
                mainFile: state.mainFile?.id === commitIdToRemove ? null : state.mainFile
            };
        })
}))