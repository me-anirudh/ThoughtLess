// import GraphSideBar from "@/components/graph/GraphSidebar";
import { RecentCommit } from "@/types/interfaces";
import { create } from "zustand";

interface graphSidebar{
        recentCommits : RecentCommit[], 
        commitLabel : string, 
        addRecentCommit : (input : RecentCommit) => void; 
        removeRecentCommit : (commitId : string) => void;
        setCommitLabel : (input : string) => void; 
}

export const useGraphSidebarStore = create<graphSidebar>((set) => ({
        recentCommits : [], 
        commitLabel : "", 
        setCommitLabel : (input) => {
        set({
                commitLabel : input
        })
        } , 
        addRecentCommit : (input) => set((state)=> {
                return{
              recentCommits: [input, ...state.recentCommits]
                } 
        }

),
        removeRecentCommit : (commitId) => set((state) => ({
                recentCommits: state.recentCommits.filter(c => c.id !== commitId)
        }))
})); 