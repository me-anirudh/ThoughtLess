import { CommitCategory } from '@/types/interfaces';
import { create } from 'zustand';

// Assuming you have this defined somewhere
// export type CommitCategory = 'feature' | 'bugfix' | 'refactor' | 'docs' | 'chore' | 'merge' | 'unknown';

export interface FilterState {
  activeCategories: CommitCategory[];
  searchQuery: string;
  
  setSearch: (query: string) => void;
  
  toggleCategory: (category: CommitCategory) => void;
  
  clearFilters: () => void;
}

export const useFilterStore = create<FilterState>((set) => ({
  activeCategories: [], // Empty means "show everything"
  searchQuery: '',

  setSearch: (query) => set({ searchQuery: query }),

  toggleCategory: (category) => set((state) => {
    const isAlreadyActive = state.activeCategories.includes(category);
    
    if (isAlreadyActive) {
      return { 
        activeCategories: state.activeCategories.filter(c => c !== category) 
      };
    } else {
      return { 
        activeCategories: [...state.activeCategories, category] 
      };
    }
  }),

  clearFilters: () => set({ activeCategories: [], searchQuery: '' }),
}));