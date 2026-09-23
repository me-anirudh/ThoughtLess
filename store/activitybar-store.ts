import {create } from "zustand"; 
import { activeFile } from "@/types/interfaces";
export const useActiveFile = create<activeFile>((set)=>({

        id : "files", 
        setId : (newId : string) => set({
                id : newId
        })
})); 
