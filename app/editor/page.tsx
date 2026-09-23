"use client";

import { useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import ActivityBar from "@/components/layout/ActivityBar";
import ExplorerManager from "@/components/editor/FileSidebar";
import GraphSideBar from "@/components/graph/GraphSidebar";
import MainBar from "@/components/layout/MainArea";
import { useDraftRecovery } from "@/custom-hooks/use-draft-recovery";
import { useDeathIntercept } from "@/custom-hooks/use-death-intercept";
import { useDraftSync } from "@/custom-hooks/use-draft-sync";
import { useAutoSave } from "@/custom-hooks/use-auto-save";
import { useSidebarStore } from "@/store/sidebar-store";
import { useEditorStore } from "@/store/editor-store";
import { buildFolderTree } from "@/lib/client/folder-tree";

import { useActiveFile } from "@/store/activitybar-store";

function EditorContent() {
    const searchParams = useSearchParams();
    const projectId = searchParams.get("projectId");
    const bucketName = searchParams.get("bucketName");
    const projectName = searchParams.get("name") || searchParams.get("projectName");

    useDraftRecovery();
    useDeathIntercept();
    useDraftSync();
    useAutoSave();

    // Hydrate project files when opening editor with project query params
    useEffect(() => {
        if (!bucketName) return;

        // Ensure Explorer sidebar is active and project is marked as open
        useActiveFile.getState().setId("files");
        useSidebarStore.getState().setProjectSelected(true);
        useEditorStore.getState().setBucketName(bucketName);

        if (projectName) {
            useSidebarStore.getState().setFolderName(projectName);
        }

        // 1. Instant hydration from treeCache if available (0ms)
        const cachedTree = useSidebarStore.getState().treeCache[bucketName];
        if (cachedTree && cachedTree.length > 0) {
            useSidebarStore.getState().setFileTree(cachedTree);
        }

        let isCancelled = false;
        const controller = new AbortController();

        const loadProjectFiles = async () => {
            try {
                const res = await fetch(`/api/projects?bucketName=${encodeURIComponent(bucketName)}&filesOnly=true`, {
                    signal: controller.signal
                });
                if (res.ok && !isCancelled) {
                    const files = await res.json();
                    if (Array.isArray(files) && !isCancelled) {
                        const tree = buildFolderTree(files);
                        useSidebarStore.getState().setFileTree(tree);
                        useSidebarStore.getState().cacheTree(bucketName, tree);
                        
                        const currentFolderName = useSidebarStore.getState().folderName;
                        if (!currentFolderName || currentFolderName === "project-files") {
                            useSidebarStore.getState().setFolderName(projectName || bucketName);
                        }
                    }
                }
            } catch (err: any) {
                if (err?.name !== 'AbortError') {
                    console.error("Failed to load project files for editor:", err);
                }
            }
        };

        loadProjectFiles();

        return () => {
            isCancelled = true;
            controller.abort();
        };
    }, [bucketName, projectId, projectName]);

    return (
        <div className="flex h-screen w-full bg-[#01111d] text-[#ffffff] overflow-hidden">
            {/* 1. Far Left: Activity Bar */}
            <ActivityBar />
            
            {/* 2. Middle: Conditional Sidebars */}
            <ExplorerManager />
            <GraphSideBar />
            
            {/* 3. Right: Main Editor Canvas */}
            <MainBar />
        </div>
    );
}

export default function App() {
    return (
        <Suspense fallback={
            <div className="flex items-center justify-center h-screen w-full bg-[#01111d] text-[#5f7e97] text-sm">
                Loading workspace…
            </div>
        }>
            <EditorContent />
        </Suspense>
    );
}