import { Command } from "@/command/Command-history";
import { FileSnapshot } from "@/types/indexed-db-schema";
import { CommitCategory, RecentCommit } from "@/types/interfaces";
import { useGraphDataStore } from "@/store/graph-data-store";
import { mergeDraft, deleteSnapshotFromIndexedDB } from "@/lib/client/vcs-db";
import { useEditorStore } from "@/store/editor-store";
import { useGraphSidebarStore } from "@/store/graph-sidebar";
// import { CommandHistory } from "./Command-history";

export class commitCommand implements Command{
        private snapshotId : string;
        private content : string; 
        private draftPath : string; 
        private draftName : string; 
        private commitLabel: string;
        private fileSnapshot : FileSnapshot; 
        
        constructor(snapshotId: string, content: string, draftPath: string, fileSnapshot: FileSnapshot, commitLabel : string, draftName: string){
                this.snapshotId = snapshotId; 
                this.content = content; 
                this.draftPath = draftPath; 
                this.draftName = draftName; 
                this.fileSnapshot = fileSnapshot; 
                this.commitLabel = commitLabel;
        }
        async execute(){
                 const store = useEditorStore.getState();
                 const sidebarStore = useGraphSidebarStore.getState();
                 const minioPath = `.git/objects/${this.snapshotId}`;
                                        const uploadRes = await fetch('/api/files', {
                                                method: 'PUT',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({
                                                        path: minioPath,
                                                        content : this.content,
                                                        bucketName: store.bucketName
                                                })
                                        });
                                        if (!uploadRes.ok) {
                                                console.error('MinIO upload failed:', uploadRes.status);
                                        }
                
                                        // Soft-delete draft file from FileSystem (best-effort — may not exist)
                                        try {
                                                const deleteRes = await fetch('/api/files', {
                                                        method: 'DELETE',
                                                        headers: { 'Content-Type': 'application/json' },
                                                        body: JSON.stringify({
                                                                path: this.draftPath,
                                                                bucketName: store.bucketName
                                                        })
                                                });
                                                if (!deleteRes.ok && deleteRes.status !== 404) {
                                                        console.warn('Draft soft-delete returned:', deleteRes.status);
                                                }
                                        } catch (e) {
                                                // Non-critical: draft may not have a FileSystem entry
                                        }

                                        // Also delete from SQL so the metadata doesn't linger (best-effort)
                                        try {
                                                await fetch('/api/drafts/delete', {
                                                        method: 'DELETE',
                                                        headers: { 'Content-Type': 'application/json' },
                                                        body: JSON.stringify({
                                                                path: this.draftPath,
                                                                name: this.draftName
                                                        })
                                                });
                                        } catch (e) {
                                                // Non-critical
                                        }
                
                                        // Write FileSnapshot + blob to IndexedDB (idempotent — safe on first run AND redo)
                                        const contentBuffer = new TextEncoder().encode(this.content);
                                        const fullBlob = {
                                                fileSnapshotId: this.snapshotId,
                                                content: contentBuffer.buffer as ArrayBuffer,
                                                compressionAlgo: 'none' as const
                                        };
                                        await mergeDraft({ ...this.fileSnapshot, storageType: 'full' as const }, fullBlob);

                                        // Stay on the original file path, not the internal .git/objects path
                                        const filePath = this.fileSnapshot.filePath || this.draftPath;
                                        await store.setSelectedFile(filePath);
                                        useEditorStore.setState({ isDirty: false, saveStatus: 'saved' });
                
                                        const { getAuthorName } = await import('@/lib/utils/project');
                                        const newCommit: RecentCommit = {
                                                id: this.snapshotId,
                                                hash: this.snapshotId.substring(0, 7),
                                                message: this.commitLabel.trim() || new Date().toLocaleString(),
                                                author: getAuthorName(),
                                                timestamp: Date.now(),
                                        };
                                        sidebarStore.addRecentCommit(newCommit);
                
                                        // Update Graph Store instantly
                                        useGraphDataStore.getState().addCommit(
                                            [this.fileSnapshot], 
                                            this.fileSnapshot.parentIds, 
                                            this.fileSnapshot.category || "unknown", 
                                            this.fileSnapshot
                                        );
                                        
                                        sidebarStore.setCommitLabel(""); 
        } 
        async undo (){
                const store = useEditorStore.getState();
                const sidebarStore = useGraphSidebarStore.getState();
                // 1. Revert UI (Zustand)
                useGraphDataStore.getState().removeCommit(this.snapshotId);
                sidebarStore.removeRecentCommit(this.snapshotId);
                
                // 2. Revert Remotely (MinIO)
                const minioPath = `.git/objects/${this.snapshotId}`;
                const deleteRes = await fetch('/api/files', {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                                path: minioPath,
                                bucketName: store.bucketName
                        })
                });
                
                if (!deleteRes.ok) {
                        console.error('Failed to undo MinIO upload:', deleteRes.status);
                }

                // 3. Revert Locally (IndexedDB)
                await deleteSnapshotFromIndexedDB(this.snapshotId);

                // 4. Restore Draft Remotely (MinIO)
                await fetch('/api/files', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                                path: this.draftPath,
                                content: this.content,
                                bucketName: store.bucketName
                        })
                });

                // 5. Restore Draft Locally (IndexedDB)
                const { saveDraft } = await import('@/lib/client/text-editor-db');
                await saveDraft({
                        path: this.draftPath,
                        name: this.draftName,
                        content: this.content,
                        bucketName: store.bucketName,
                        modified: Date.now(),
                        etag: "",
                }, {
                        fileId: this.snapshotId,
                        name: this.draftName,
                        parentName: this.fileSnapshot.parentIds[0] || '',
                        isSync: 0,
                        modified: Date.now(),
                        created: Date.now()
                });
        }

}