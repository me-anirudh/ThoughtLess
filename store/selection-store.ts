import { create } from "zustand"; 

interface SelectionState {
        selectedId : string | null, // The commit selected to show diff in sidebar
        setSelectedId : (id : string | null) => void
        clearSelection : () => void

        toggleId : string | null // The commit clicked to navigate to IDE
        setToggleId : (id : string | null) => void
        clearToggle : () => void
}

export const useExpandedStore = create<SelectionState>((set) => ({
        selectedId : null, 
        setSelectedId : (inputId) => {
                set ({selectedId : inputId})
        },
        clearSelection : () => set({ selectedId: null }),
        toggleId : null, 
        setToggleId : (id) => {
                set({toggleId : id})
        },
        clearToggle : () => set({ toggleId: null })
})); 
