import { Command } from "@/command/Command-history";
import { FileSnapshot } from "@/types/indexed-db-schema";
import { RecentCommit } from "@/types/interfaces";
import { useGraphDataStore } from "@/store/graph-data-store";
import { useEditorStore } from "@/store/editor-store";
import { useGraphSidebarStore } from "@/store/graph-sidebar";
import { reconstructFile, deleteSnapshotFromIndexedDB, mergeDraft } from "@/lib/client/vcs-db";
import { saveDraft } from "@/lib/client/text-editor-db";
import type { DraftRecord, DraftMetadata } from "@/types/interfaces";
import type { FullBlob } from "@/types/indexed-db-schema";

function formatUncommitDraftName(date: Date): string {
        const months = [
                "Jan", "Feb", "Mar", "Apr", "May", "Jun",
                "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
        ];
        const month = months[date.getMonth()];
        const day = date.getDate();
        const year = date.getFullYear();
        const hours = date.getHours();
        const minutes = date.getMinutes().toString().padStart(2, "0");
        const ampm = hours >= 12 ? "PM" : "AM";
        const hour12 = hours % 12 || 12;

        return `uncommited-${month}-${day}-${year}-${hour12}-${minutes}-${ampm}`;
}

export class UncommitCommand implements Command {
        private snapshotId: string;
        private fileSnapshot: FileSnapshot;
        private commitMessage: string;

        // Stashed data for undo (populated during execute)
        private reconstructedContent: string = "";
        private draftPath: string = "";
        private draftName: string = "";

        constructor(
                snapshotId: string,
                fileSnapshot: FileSnapshot,
                commitMessage: string
        ) {
                this.snapshotId = snapshotId;
                this.fileSnapshot = fileSnapshot;
                this.commitMessage = commitMessage;
        }

        async execute() {
                const store = useEditorStore.getState();
                
                // 1. Reconstruct the full file content from the IndexedDB delta chain
                const content = await reconstructFile(this.snapshotId);
                this.reconstructedContent = content;

                // 2. Generate draft name and path
                const now = new Date();
                this.draftName = formatUncommitDraftName(now);
                this.draftPath = `.drafts/${this.fileSnapshot.filePath}/${this.draftName}`;

                // 3. Save as a draft in the TextEditor IndexedDB
                const draftRecord: DraftRecord = {
                        path: this.draftPath,
                        name: this.draftName,
                        content: this.reconstructedContent,
                        bucketName: store.bucketName,
                        modified: now.getTime(),
                        etag: "",
                };

                const draftMetadata: DraftMetadata = {
                        name: this.draftName,
                        parentName: this.fileSnapshot.filePath,
                        isSync: 0,
                        path: this.draftPath,
                        modified: now.getTime(),
                        created: now.getTime(),
                };

                await saveDraft(draftRecord, draftMetadata);

                // 4. Remove commit from the graph store (UI)
                useGraphDataStore.getState().removeCommit(this.snapshotId);

                // 5. Delete from MinIO
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
                        console.error('Failed to delete commit from MinIO:', deleteRes.status);
                }

                // 6. Delete from VCS IndexedDB
                await deleteSnapshotFromIndexedDB(this.snapshotId);

                // 7. Remove from recent commits in sidebar store
                useGraphSidebarStore.getState().removeRecentCommit(this.snapshotId);

                // 8. Switch editor to the new draft
                store.setSelectedFile(this.draftPath);
                useEditorStore.setState({
                        buffer: this.reconstructedContent,
                        isDirty: true,
                        saveStatus: 'idle'
                });
        }

        async undo() {
                const store = useEditorStore.getState();
                // Re-commit: restore the snapshot back to its original state

                // 1. Re-save the FileSnapshot + FullBlob to VCS IndexedDB
                const contentBuffer = new TextEncoder().encode(this.reconstructedContent);
                const fullBlob: FullBlob = {
                        fileSnapshotId: this.snapshotId,
                        content: contentBuffer.buffer as ArrayBuffer,
                        compressionAlgo: 'none'
                };

                // Force storageType to 'full' for the re-commit (simplest recovery)
                const restoredSnapshot: FileSnapshot = {
                        ...this.fileSnapshot,
                        storageType: 'full'
                };

                await mergeDraft(restoredSnapshot, fullBlob);

                // 2. Re-upload to MinIO
                const minioPath = `.git/objects/${this.snapshotId}`;
                const uploadRes = await fetch('/api/files', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                                path: minioPath,
                                content: this.reconstructedContent,
                                bucketName: store.bucketName
                        })
                });

                if (!uploadRes.ok) {
                        console.error('Failed to re-upload commit to MinIO:', uploadRes.status);
                }

                // 3. Restore in graph store
                useGraphDataStore.getState().addCommit(
                        [restoredSnapshot],
                        restoredSnapshot.parentIds,
                        restoredSnapshot.category || "unknown",
                        restoredSnapshot
                );

                // 4. Restore in recent commits
                const { getAuthorName } = await import('@/lib/utils/project');
                const newCommit: RecentCommit = {
                        id: this.snapshotId,
                        hash: this.snapshotId.substring(0, 7),
                        message: this.commitMessage,
                        author: getAuthorName(),
                        timestamp: Date.now(),
                };
                useGraphSidebarStore.getState().addRecentCommit(newCommit);

                // 5. Delete the draft that was created during execute()
                const { deleteDraftFull } = await import('@/lib/client/text-editor-db');
                await deleteDraftFull(this.draftPath, this.draftName);

                // 6. Switch editor back to the committed path
                useEditorStore.getState().setSelectedFile(minioPath);
                useEditorStore.setState({ isDirty: false });
        }
}
