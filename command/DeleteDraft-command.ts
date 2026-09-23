import { Command } from "./Command-history";
import { useEditorStore } from "@/store/editor-store";
import { deleteDraftFull, saveDraft, getDraft } from "@/lib/client/text-editor-db";
import type { DraftRecord, DraftMetadata } from "@/types/interfaces";

export class DeleteDraftCommand implements Command {
        private draftPath: string;
        private draftName: string;
        private bucketName: string;

        // Stashed for undo — populated during execute()
        private stashedContent: string = "";
        private stashedMetadata: DraftMetadata | null = null;

        constructor(draftPath: string, draftName: string, bucketName: string) {
                this.draftPath = draftPath;
                this.draftName = draftName;
                this.bucketName = bucketName;
        }

        async execute() {
                const store = useEditorStore.getState();

                // 1. Stash the current content for undo
                const cacheKey = `${this.draftPath}::${this.draftName}`;
                const cached = store.fileBuffers.get(cacheKey);
                this.stashedContent = cached?.content || store.buffer || "";

                // 2. Delete from TextEditor IndexedDB
                await deleteDraftFull(this.draftPath, this.draftName);

                // 3. Delete from MinIO
                const deleteRes = await fetch('/api/files', {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                                path: this.draftPath,
                                bucketName: this.bucketName
                        })
                });

                if (!deleteRes.ok) {
                        console.error('Failed to delete draft from MinIO:', deleteRes.status);
                }

                // 4. Clear editor state
                useEditorStore.setState({
                        buffer: '',
                        isDirty: false,
                        saveStatus: 'idle'
                });
        }

        async undo() {
                // 1. Re-save the draft to TextEditor IndexedDB
                const draftRecord: DraftRecord = {
                        path: this.draftPath,
                        name: this.draftName,
                        content: this.stashedContent,
                        bucketName: this.bucketName,
                        modified: Date.now(),
                        etag: "",
                };

                const draftMetadata: DraftMetadata = {
                        name: this.draftName,
                        parentName: this.draftPath.split('/').slice(0, -1).join('/'),
                        isSync: 0,
                        path: this.draftPath,
                        modified: Date.now(),
                        created: Date.now(),
                };

                await saveDraft(draftRecord, draftMetadata);

                // 2. Re-upload to MinIO
                await fetch('/api/files', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                                path: this.draftPath,
                                content: this.stashedContent,
                                bucketName: this.bucketName
                        })
                });

                // 3. Restore editor state
                useEditorStore.getState().setSelectedFile(this.draftPath, this.draftName);
                useEditorStore.setState({
                        buffer: this.stashedContent,
                        isDirty: true,
                        saveStatus: 'idle'
                });
        }
}