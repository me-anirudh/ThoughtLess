import {create} from "zustand"; 


interface HoverState{
        hoverId : string | null; 

        setHover : (id : string | null) => void 
}

export const useHoverStore = create<HoverState>((set) => ({
        hoverId : null, 
        setHover : (id) => {
                set({hoverId : id})
        }
})) ; 