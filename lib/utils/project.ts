import { useSidebarStore } from "@/store/sidebar-store";
import { useEditorStore } from "@/store/editor-store";

export function getActiveProjectId(): string {
    const folderName = useSidebarStore.getState().folderName;
    const bucketName = useEditorStore.getState().bucketName;
    if (folderName) return folderName;
    if (bucketName) return bucketName;
    return 'project-main';
}

export function getActiveProjectVersionId(): string {
    const projectId = getActiveProjectId();
    return `${projectId}-v1`;
}

export function getAuthorName(): string {
    return 'You';
}
