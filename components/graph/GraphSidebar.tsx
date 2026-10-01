"use client";
import { useState, useEffect } from "react";
import CreateBranchPopup from "@/components/shared/CreateBranchPopup";
import UncommitConfirmPopup from "@/components/shared/UncommitConfirmPopup";
import DeleteDraftConfirmPopup from "@/components/shared/DeleteDraftConfirmPopup";
import { useActiveFile } from "@/store/activitybar-store";
import {
        VscChevronRight,
        VscSourceControl,
        VscGitMerge,
        VscTrash,
        VscInfo,
        VscDiscard,
} from "react-icons/vsc";
import { RecentCommit, MergeStrategy, CommitCategory } from "@/types/interfaces";
import { useGraphDataStore } from "@/store/graph-data-store";
import { saveDraft, deleteDraftFull } from "@/lib/client/text-editor-db";
import { mergeDraft, getLatestSnapshotIdForFile, getChainDepth, loadGraphDataFromDB, loadGraphDataForFile, reconstructFile } from "@/lib/client/vcs-db";
import { FileSnapshot, FullBlob, DeltaBlob } from "@/types/indexed-db-schema";
import { useEditorStore } from "@/store/editor-store"; 
import { commitCommand } from "@/command/commit-command";
import { UncommitCommand } from "@/command/uncommit-command";
import { syncAllOfflineData } from "@/lib/client/sync-manager";
import { CommandManager } from "@/command/Command-history";
import { useGraphSidebarStore } from "@/store/graph-sidebar";
import { useSidebarStore } from "@/store/sidebar-store";
import { getActiveProjectId, getActiveProjectVersionId, getAuthorName } from "@/lib/utils/project";
import { computeSHA256 } from "@/lib/utils/hash";

function ActionButton({
	children,
	onClick,
}: {
	children: React.ReactNode;
	onClick?: () => void;
}) {
	return (
		<button
			onClick={onClick}
			className="
				w-full flex items-center justify-between
				px-4 py-[10px]
				rounded-md
				border border-[#1f384c]
				bg-[#0b253a]
				text-[13px] text-[#d6deeb]
				cursor-pointer
				transition-all duration-150
				hover:border-[#82aaff] hover:bg-[#1d3b53]
				group
			"
		>
			{children}
			<VscChevronRight
				size={16}
				className="text-[#5f7e97] group-hover:text-[#82aaff] transition-colors"
			/>
		</button>
	);
}

function DraftStatusBadge() {
	const isDirty = useEditorStore((state) => state.isDirty);
	const saveStatus = useEditorStore((state) => state.saveStatus);
	const selectedDraft = useEditorStore((state) => state.selectedDraft);

	const statusText = saveStatus === 'saving'
		? 'Saving changes…'
		: isDirty
		? 'Unsaved changes'
		: saveStatus === 'error'
		? 'Save error'
		: 'All changes saved';

	const color = saveStatus === 'error'
		? '#ef5350'
		: isDirty
		? '#ecc48d'
		: '#addb67';

	return (
		<div className="flex items-center gap-3 px-4 py-3 bg-[#0b253a]/60 border-b border-[#122d42]">
			<div 
				className="relative flex items-center justify-center w-9 h-9 rounded-full border-2 flex-shrink-0"
				style={{ borderColor: color, backgroundColor: `${color}20` }}
			>
				<div className="w-4 h-4 rounded-full border-2" style={{ borderColor: color }} />
				<span className="absolute -top-[2px] -right-[2px] w-2.5 h-2.5 rounded-full ring-2 ring-[#01111d]" style={{ backgroundColor: color }} />
			</div>
			<div className="flex flex-col min-w-0">
				<span className="text-[13px] font-semibold text-[#ffffff] leading-tight truncate">
					{selectedDraft ? `Draft: ${selectedDraft}` : 'Draft'}
				</span>
				<span className="text-[11px] text-[#5f7e97] leading-tight mt-0.5">
					{statusText}
				</span>
			</div>
			<span 
				className="ml-auto w-2 h-2 rounded-full animate-pulse flex-shrink-0" 
				style={{ backgroundColor: color }}
			/>
		</div>
	);
}

function CommitForm({
	commitLabel,
	setCommitLabel,
	commitCategory,
	setCommitCategory,
	mergeStrategy,
	setMergeStrategy,
	onCommit,
	onDiscard,
}: {
	commitLabel: string;
	setCommitLabel: (val: string) => void;
	commitCategory: CommitCategory;
	setCommitCategory: (val: CommitCategory) => void;
	mergeStrategy: MergeStrategy;
	setMergeStrategy: (val: MergeStrategy) => void;
	onCommit: () => void;
	onDiscard: () => void;
}) {
	return (
		<div className="flex flex-col gap-4 px-4">
			{/* Label input */}
			<div className="flex flex-col gap-1.5">
				<label className="text-[11px] text-[#5f7e97]">
					Label this commit
				</label>
				<input
					type="text"
					value={commitLabel}
					onChange={(e) => setCommitLabel(e.target.value)}
					placeholder="Name the Change"
					className="
						w-full px-3 py-2
						rounded-md
						bg-[#0b253a]
						border border-[#1f384c]
						text-[13px] text-[#d6deeb]
						placeholder:text-[#5f7e97]
						outline-none
						transition-colors duration-150
						focus:border-[#82aaff] focus:ring-1 focus:ring-[#82aaff33]
					"
				/>
			</div>

			{/* Category Selection */}
			<div className="flex flex-col gap-1.5 mt-1 mb-1">
				<label className="text-[11px] text-[#5f7e97]">
					Category
				</label>
				<select
					value={commitCategory}
					onChange={(e) => setCommitCategory(e.target.value as CommitCategory)}
					className="
						w-full px-3 py-2
						rounded-md
						bg-[#0b253a]
						border border-[#1f384c]
						text-[13px] text-[#d6deeb]
						outline-none
						transition-colors duration-150
						focus:border-[#82aaff] focus:ring-1 focus:ring-[#82aaff33]
					"
				>
					<option value="feature" className="bg-[#01111d] text-[#d6deeb]">✨ Feature</option>
					<option value="bugfix" className="bg-[#01111d] text-[#d6deeb]">🐛 Bugfix</option>
					<option value="refactor" className="bg-[#01111d] text-[#d6deeb]">♻️ Refactor</option>
					<option value="docs" className="bg-[#01111d] text-[#d6deeb]">📚 Documentation</option>
					<option value="chore" className="bg-[#01111d] text-[#d6deeb]">🔧 Chore</option>
					<option value="merge" className="bg-[#01111d] text-[#d6deeb]">🔀 Merge</option>
					<option value="unknown" className="bg-[#01111d] text-[#d6deeb]">❓ Unknown</option>
				</select>
			</div>

			{/* Merge strategy */}
			<div className="flex flex-col gap-2">
				<div className="flex items-center gap-1.5">
					<span className="text-[11px] text-[#5f7e97]">
						Merge strategy
					</span>
					<VscInfo
						size={13}
						className="text-[#5f7e97] cursor-help hover:text-[#82aaff]"
						title="Choose how this commit integrates into the graph"
					/>
				</div>

				{/* Option: direct child */}
				<label
					className={`
						flex items-start gap-3 p-2.5 rounded-md cursor-pointer transition-colors duration-150
						${mergeStrategy === "direct-child"
							? "bg-[#0b2942] border border-[#82aaff]"
							: "border border-transparent hover:bg-[#0e293f]"
						}
					`}
					onClick={() => setMergeStrategy("direct-child")}
				>
					<span
						className={`
							mt-0.5 w-[14px] h-[14px] rounded-full border-2 flex items-center justify-center flex-shrink-0
							${mergeStrategy === "direct-child"
								? "border-[#82aaff]"
								: "border-[#1f384c]"
							}
						`}
					>
						{mergeStrategy === "direct-child" && (
							<span className="w-[6px] h-[6px] rounded-full bg-[#82aaff]" />
						)}
					</span>
					<div className="flex flex-col min-w-0">
						<span className="text-[12px] font-medium text-[#d6deeb] leading-tight">
							Add as direct child
						</span>
						<span className="text-[11px] text-[#5f7e97] leading-snug mt-0.5">
							Create a new node from the current draft
						</span>
					</div>
				</label>

				{/* Option: merge into */}
				<label
					className={`
						flex items-start gap-3 p-2.5 rounded-md cursor-pointer transition-colors duration-150
						${mergeStrategy === "merge-into"
							? "bg-[#0b2942] border border-[#82aaff]"
							: "border border-transparent hover:bg-[#0e293f]"
						}
					`}
					onClick={() => setMergeStrategy("merge-into")}
				>
					<span
						className={`
							mt-0.5 w-[14px] h-[14px] rounded-full border-2 flex items-center justify-center flex-shrink-0
							${mergeStrategy === "merge-into"
								? "border-[#82aaff]"
								: "border-[#1f384c]"
							}
						`}
					>
						{mergeStrategy === "merge-into" && (
							<span className="w-[6px] h-[6px] rounded-full bg-[#82aaff]" />
						)}
					</span>
					<div className="flex flex-col min-w-0">
						<span className="text-[12px] font-medium text-[#d6deeb] leading-tight">
							Merge with another node
						</span>
						<span className="text-[11px] text-[#5f7e97] leading-snug mt-0.5">
							Select an existing node to merge into
						</span>
					</div>
				</label>
			</div>

			<button
				onClick={onCommit}
				className="
					w-full flex items-center justify-center gap-2
					py-[10px]
					rounded-md
					bg-[#82aaff]
					text-[13px] font-bold text-[#011627]
					cursor-pointer
					transition-all duration-150
					hover:bg-[#9abaff]
					shadow-md
					active:scale-[0.98]
				"
			>
				<VscSourceControl size={16} />
				Commit Draft
			</button>
			<button
				onClick={onDiscard}
				className="
					w-full flex items-center justify-center gap-2
					py-[8px]
					rounded-md
					bg-transparent
					border border-[#ef535055]
					text-[13px] text-[#ef5350]
					cursor-pointer
					transition-colors duration-150
					hover:bg-[#ef535022] hover:border-[#ef5350]
				"
			>
				<VscTrash size={14} />
				Delete Draft
			</button>
		</div>
	);
}

function formatTimeAgo(timestamp: number): string {
        const seconds = Math.floor((Date.now() - timestamp) / 1000);
        if (seconds < 60) return "just now";
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        return `${days}d ago`;
}

function RecentCommitsSection({ commits, onUncommit }: { commits: RecentCommit[]; onUncommit: (commit: RecentCommit) => void }) {
        // Force re-render every minute to keep timeAgo updated
        const [, setTick] = useState(0);
        useEffect(() => {
                const interval = setInterval(() => setTick(t => t + 1), 60000);
                return () => clearInterval(interval);
        }, []);

        return (
		<div className="flex flex-col px-4 pt-1 pb-4">
			{/* Header */}
			<div className="flex items-center justify-between mb-3">
				<span className="text-[13px] font-semibold text-[#d6deeb]">
					Recent Commits
				</span>
				<button className="text-[11px] text-[#82aaff] hover:underline cursor-pointer bg-transparent border-none font-medium">
					View all
				</button>
			</div>
					
			{/* Commit list */}
			<div className="flex flex-col gap-2">
				{commits.map((commit) => (
					<div
						key={commit.id}
						className="
							group flex items-start gap-3 py-2 px-2
							rounded-md
							transition-colors duration-100
							hover:bg-[#0e293f]
							cursor-default
						"
					>
						{/* dot */}
						<span className="mt-[5px] w-2 h-2 rounded-full bg-[#82aaff] flex-shrink-0" />

						{/* info */}
						<div className="flex flex-col min-w-0 flex-1">
							<span className="text-[12px] text-[#d6deeb] leading-tight truncate">
								{commit.message}
							</span>
							<span className="text-[11px] text-[#5f7e97] mt-0.5">
								{commit.author} • {formatTimeAgo(commit.timestamp)}
							</span>
						</div>

						{/* hash badge */}
						<span className="mt-[2px] px-2 py-[2px] rounded bg-[#01111d] border border-[#1f384c] text-[10px] font-mono text-[#7fdbca] flex-shrink-0 select-all">
							{commit.hash}
						</span>

						{/* Uncommit button — visible on hover */}
						<button
							onClick={(e) => {
								e.stopPropagation();
								onUncommit(commit);
							}}
							title="Uncommit"
							className="
								mt-[2px] p-1
								rounded
								text-[#5f7e97]
								bg-transparent border-none
								cursor-pointer
								transition-all duration-100
								opacity-0 group-hover:opacity-100
								hover:text-[#ef5350] hover:bg-[#ef535022]
								flex-shrink-0
							"
						>
							<VscDiscard size={14} />
						</button>
					</div>
				))}
			</div>
		</div>
        );
}


export default function GraphSideBar() {
        const activeId = useActiveFile((state) => state.id); 
        // const [commitLabel, setCommitLabel] = useState("");
        const commitLabel = useGraphSidebarStore((state) => state.commitLabel); 
        const setCommitLabel = useGraphSidebarStore((state) => state.setCommitLabel); 
        const [commitCategory, setCommitCategory] = useState<CommitCategory>("feature");
        // const [recentCommits, setRecentCommits] = useState<RecentCommit[]>(INITIAL_COMMITS);
        const recentCommits = useGraphSidebarStore((state) => state.recentCommits); 
         const [mergeStrategy, setMergeStrategy] =
                useState<MergeStrategy>("direct-child");
        const [isBranchPopupOpen, setIsBranchPopupOpen] = useState(false);
        const [isCommitting, setIsCommitting] = useState(false);

        // Uncommit state
        const [uncommitTarget, setUncommitTarget] = useState<RecentCommit | null>(null);
        const [isUncommitPopupOpen, setIsUncommitPopupOpen] = useState(false);
        const [isUncommitting, setIsUncommitting] = useState(false);

        // Discard draft state
        const [isDiscardPopupOpen, setIsDiscardPopupOpen] = useState(false);
        const [isDiscarding, setIsDiscarding] = useState(false);

        const isGraphViewOpen = useGraphDataStore((state) => state.isGraphViewOpen);
        const setGraphViewOpen = useGraphDataStore((state) => state.setGraphViewOpen);
        
        // const diffworker = new Worker('../workers/diff-engine.worker.ts'); 
        if (activeId !== "graph") return null;

        const finishCommitUpload = async (snapshotId: string, content: string, draftPath: string, fileSnapshot: FileSnapshot, draftName: string, precomputedBlob?: FullBlob | DeltaBlob | null) => {
                try {
                        const cmd = new commitCommand(snapshotId, content, draftPath, fileSnapshot, commitLabel, draftName, precomputedBlob); 

                        // Wait for MinIO upload to finish
                        await CommandManager.executeCommand(cmd); 
                        useGraphDataStore.getState().clearPendingDraft();
                        useGraphDataStore.getState().setActiveFileForPath(fileSnapshot.filePath, fileSnapshot);
           
                } finally {
                        setIsCommitting(false);
                }
        };

        const handleCommit = async () => {
                if (!commitLabel.trim() || isCommitting) return;
                
                const store = useEditorStore.getState();
                const draftPath = store.selectedFile;
                if (!draftPath) return;

                setIsCommitting(true);

                try {
                        const draftName = store.selectedDraft || draftPath.split('/').pop() || 'Untitled';
                        const cacheKey = `${draftPath}::${draftName}`;
                        const content = store.fileBuffers.get(cacheKey)?.content || store.buffer;
                        // 1. Generate Identity
                        const snapshotId = crypto.randomUUID();
                        const contentBuffer = new TextEncoder().encode(content);
                        const contentHash = await computeSHA256(contentBuffer);
                        
                        const targetFilePath = (store.parentName && store.parentName !== 'root') ? store.parentName : draftPath; 

                        // 2. Query parent snapshot and depth
                        const projectVersionId = getActiveProjectVersionId();
                        const projectId = getActiveProjectId();
                        const parentSnapshotId = await getLatestSnapshotIdForFile(projectVersionId, targetFilePath);
                        let isFullBlob = true;
                        
                        if (parentSnapshotId) {
                                const depth = await getChainDepth(parentSnapshotId);
                                if (depth < 9) {
                                        isFullBlob = false;
                                }
                        }

                        const currentFileActive = useGraphDataStore.getState().activeFileMap[targetFilePath];
                        const activeGraphNodeId = currentFileActive?.id || useGraphDataStore.getState().activeFile?.id;
                        const resolvedParentId = parentSnapshotId 
                                ? parentSnapshotId 
                                : (activeGraphNodeId && activeGraphNodeId !== snapshotId ? activeGraphNodeId : 'root');

                        const fileSnapshot: FileSnapshot = {
                                id: snapshotId,
                                projectId: projectId,
                                projectVersionId: projectVersionId,
                                filePath: targetFilePath,
                                contentHash: contentHash,
                                storageType: isFullBlob ? 'full' : 'delta', 
                                parentIds: [resolvedParentId], 
                                byteSize: contentBuffer.byteLength,
                                language: null,
                                timestamp: Date.now(),
                                category: commitCategory,
                                name: commitLabel.trim() || new Date().toLocaleString(),
                                isSynced: 0
                        };

                        // 3. Save to IndexedDB (Full or Delta)
                        if (isFullBlob) {
                                const fullBlob: FullBlob = {
                                        fileSnapshotId: snapshotId,
                                        content: contentBuffer.buffer as ArrayBuffer,
                                        compressionAlgo: 'none'
                                };
                                await deleteDraftFull(draftPath, draftName);
                                await finishCommitUpload(snapshotId, content, draftPath, fileSnapshot, draftName, fullBlob);
                        } else {
                                const diffWorker = new Worker(new URL('../../workers/diff-engine.worker.ts', import.meta.url));
                                
                                diffWorker.onmessage = async (e) => {
                                        try {
                                                if (e.data.success) {
                                                        const diffResult = e.data.result;
                                                        const patchString = diffResult.patches?.unified || '';
                                                        const patchBuffer = new TextEncoder().encode(patchString);

                                                        const deltaBlob: DeltaBlob = {
                                                                fileSnapshotId: snapshotId,
                                                                baseSnapshotId: parentSnapshotId!,
                                                                patchData: patchBuffer.buffer as ArrayBuffer,
                                                                patchFormat: 'myers-unified'
                                                        };

                                                        await deleteDraftFull(draftPath, draftName);
                                                        await finishCommitUpload(snapshotId, content, draftPath, fileSnapshot, draftName, deltaBlob);
                                                } else {
                                                        console.error('Worker failed to compute diff:', e.data.error);
                                                        setIsCommitting(false);
                                                }
                                        } finally {
                                                diffWorker.terminate();
                                        }
                                };

                                diffWorker.onerror = (err) => {
                                        console.error('Diff worker error:', err);
                                        setIsCommitting(false);
                                        diffWorker.terminate();
                                };

                                diffWorker.postMessage({ parentSnapshotId: parentSnapshotId!, draftContent: content });
                                return;
                        }
                } catch (err) {
                        console.error('Commit failed:', err);
                        setIsCommitting(false);
                }
        };

        const handleDiscardRequest = () => {
                const store = useEditorStore.getState();
                if (!store.selectedFile) return;
                setIsDiscardPopupOpen(true);
        };

        const handleDiscardConfirm = async () => {
                const store = useEditorStore.getState();
                const draftPath = store.selectedFile;
                if (!draftPath || isDiscarding) return;

                const draftName = store.selectedDraft || draftPath.split('/').pop() || 'Untitled';
                setIsDiscarding(true);

                try {
                        // 1. Delete from IndexedDB (drafts + draftMetadata)
                        await deleteDraftFull(draftPath, draftName);

                        // 2. Delete from SQL database (best-effort)
                        fetch('/api/drafts/delete', {
                                method: 'DELETE',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ path: draftPath, name: draftName }),
                        }).catch(() => {});

                        // 3. Clear from RAM cache
                        const cacheKey = `${draftPath}::${draftName}`;
                        const newBuffers = new Map(store.fileBuffers);
                        newBuffers.delete(cacheKey);

                        const newDirty = new Set(store.dirtyFiles);
                        newDirty.delete(cacheKey);

                        useEditorStore.setState({
                                fileBuffers: newBuffers,
                                dirtyFiles: newDirty,
                                isDirty: false,
                                buffer: '',
                                selectedFile: '',
                                selectedDraft: '',
                                saveStatus: 'idle',
                                fileVersion: store.fileVersion + 1,
                        });
                        setIsDiscardPopupOpen(false);
                } catch (err) {
                        console.error('Discard failed:', err);
                } finally {
                        setIsDiscarding(false);
                }
        };

        // Trigger the uncommit confirmation modal
        const handleUncommitRequest = (commit: RecentCommit) => {
                setUncommitTarget(commit);
                setIsUncommitPopupOpen(true);
        };

        // Executed after user confirms in the modal
        const handleUncommitConfirm = async () => {
                if (!uncommitTarget || isUncommitting) return;

                setIsUncommitting(true);
                try {
                        const graphState = useGraphDataStore.getState();
                        const store = useEditorStore.getState();
                        const fileSnapshot = graphState.commits.find(c => c.id === uncommitTarget.id) || {
                                id: uncommitTarget.id,
                                projectId: getActiveProjectId(),
                                projectVersionId: getActiveProjectVersionId(),
                                filePath: store.selectedFile || 'root',
                                contentHash: uncommitTarget.hash,
                                storageType: 'full' as const,
                                parentIds: [],
                                byteSize: 0,
                                language: null,
                                timestamp: uncommitTarget.timestamp,
                                category: 'feature' as const,
                                name: uncommitTarget.message,
                                isSynced: 0 as const
                        };

                        const cmd = new UncommitCommand(
                                uncommitTarget.id,
                                fileSnapshot,
                                uncommitTarget.message
                        );
                        await CommandManager.executeCommand(cmd);
                } catch (err) {
                        console.error('Uncommit failed:', err);
                } finally {
                        setIsUncommitting(false);
                        setIsUncommitPopupOpen(false);
                        setUncommitTarget(null);
                }
        };

        const handleClick = async () => {
                const selectedFile = useEditorStore.getState().selectedFile;
                try {
                        if (selectedFile) {
                                useGraphDataStore.getState().setCurrentFilePath(selectedFile);
                                await loadGraphDataForFile(selectedFile);
                        } else {
                                await loadGraphDataFromDB();
                        }
                } catch (err) {
                        console.error('Failed to load graph data from IndexedDB:', err);
                }
                setGraphViewOpen(true);
        };
        const handleCreateBranch = async (branchName: string, parent : string) => {
                const store = useEditorStore.getState();
                const graphStore = useGraphDataStore.getState();
                const time = Date.now(); 
                
                const resolvedParent = parent || store.selectedFile || useSidebarStore.getState().folderName || 'root';
                const defaultDraft = resolvedParent.split('/').pop() || 'Untitled';
                const parentDraft = store.activeDrafts[resolvedParent] || defaultDraft;
                const cacheKey = `${resolvedParent}::${parentDraft}`;
                let actualContent = store.fileBuffers.get(cacheKey)?.content || store.fileBuffers.get(resolvedParent)?.content || store.buffer;
                if (!actualContent && graphStore.activeFile) {
                        try {
                                actualContent = await reconstructFile(graphStore.activeFile.id);
                        } catch (e) {
                                console.error('Failed to reconstruct parent content:', e);
                        }
                }

                const snapshotId = crypto.randomUUID();

                // 1. Save draft to TextEditor database as a working draft
                await saveDraft({
                        path: resolvedParent,
                        name: branchName,
                        content: actualContent,
                        bucketName: store.bucketName,
                        modified: time,
                        etag: store.currentETag,
                }, {
                        fileId: snapshotId,
                        name: branchName,
                        parentName: resolvedParent,
                        path: resolvedParent,
                        modified: time,
                        created: time,
                        isSync: 0
                });

                // 2. Select this new draft/branch in editor
                store.setActiveDraft(resolvedParent, branchName);
                await store.setSelectedFile(resolvedParent, branchName);

                // Update RAM buffer
                const branchCacheKey = `${resolvedParent}::${branchName}`;
                const newBuffers = new Map(store.fileBuffers);
                newBuffers.set(branchCacheKey, { content: actualContent, etag: store.currentETag });
                useEditorStore.setState({
                        buffer: actualContent,
                        fileBuffers: newBuffers,
                        isDirty: true,
                        saveStatus: 'idle',
                        fileVersion: store.fileVersion + 1
                });

                // 3. Track pending draft in graphStore (RAM only, NOT a committed graph node)
                const parentId = graphStore.activeFile?.id || 'root';
                graphStore.setPendingDraft({
                        id: snapshotId,
                        parentId,
                        content: actualContent,
                        name: branchName,
                        path: resolvedParent
                });

                // 4. Automatically redirect/focus the user to the draft editor
                setGraphViewOpen(false);
                useActiveFile.getState().setId('files');
        };
        
        return (<>
		<aside className="w-[300px] h-screen bg-[#01111d] border-r border-[#122d42] flex flex-col text-[#d6deeb] font-sans selection:bg-[#1d3b53] overflow-hidden">
			{/* ── Header ── */}
			<div className="flex items-center justify-between px-5 pt-3 pb-2 text-[11px] text-[#5f7e97] tracking-wider mb-1">
				<span className="uppercase font-semibold">Source Control</span>
				<span className="cursor-pointer hover:text-white font-bold tracking-widest pb-1">
					···
				</span>
			</div>

			{/* ── Scrollable body ── */}
			<div className="flex-1 overflow-y-auto scrollbar-hide">
				{/* Top action buttons */}
				<div className="flex flex-col gap-2 px-4 pb-4">
					<ActionButton onClick={handleClick}>
						<span className="flex items-center gap-2">
							<VscSourceControl size={16} className={isGraphViewOpen ? "text-[#82aaff]" : "text-[#5f7e97]"} />
							<span className={isGraphViewOpen ? "text-[#82aaff] font-semibold" : ""}>
								{isGraphViewOpen ? "Thought Threads (Open)" : "Open Threads"}
							</span>
						</span>
					</ActionButton>
					<ActionButton onClick={() => setIsBranchPopupOpen(true)}>
						<span className="flex items-center gap-2">
							<VscGitMerge size={16} className="text-[#82aaff]" />
							<span>Create a Branch</span>
						</span>
					</ActionButton>
				</div>

				{/* Draft status */}
				<DraftStatusBadge />

				{/* Divider */}
				<div className="h-px bg-[#122d42] mx-4 my-3" />

				{/* Commit form */}
				<CommitForm
					commitLabel={commitLabel}
					setCommitLabel={setCommitLabel}
					commitCategory={commitCategory}
					setCommitCategory={setCommitCategory}
					mergeStrategy={mergeStrategy}
					setMergeStrategy={setMergeStrategy}
					onCommit={handleCommit}
					onDiscard={handleDiscardRequest}
				/>

				{/* Divider */}
				<div className="h-px bg-[#122d42] mx-4 my-3" />

				{/* Recent commits */}
				<RecentCommitsSection commits={recentCommits} onUncommit={handleUncommitRequest} />
			</div>
		</aside>

                {/* Branch creation popup — rendered outside the sidebar */}
                <CreateBranchPopup
                        isOpen={isBranchPopupOpen}
                        onClose={() => setIsBranchPopupOpen(false)}
                        onCreate={handleCreateBranch}
                />

                {/* Uncommit confirmation popup */}
                <UncommitConfirmPopup
                        isOpen={isUncommitPopupOpen}
                        onClose={() => {
                                if (!isUncommitting) {
                                        setIsUncommitPopupOpen(false);
                                        setUncommitTarget(null);
                                }
                        }}
                        onConfirm={handleUncommitConfirm}
                        commitInfo={uncommitTarget ? {
                                id: uncommitTarget.id,
                                hash: uncommitTarget.hash,
                                filePath: useGraphDataStore.getState().commits.find(c => c.id === uncommitTarget.id)?.filePath || 'unknown',
                                message: uncommitTarget.message,
                        } : null}
                        isProcessing={isUncommitting}
                />

                {/* Draft discard confirmation popup */}
                <DeleteDraftConfirmPopup
                        isOpen={isDiscardPopupOpen}
                        onClose={() => {
                                if (!isDiscarding) setIsDiscardPopupOpen(false);
                        }}
                        onConfirm={handleDiscardConfirm}
                        draftInfo={useEditorStore.getState().selectedFile ? {
                                name: useEditorStore.getState().selectedDraft || 'Untitled Draft',
                                path: useEditorStore.getState().selectedFile,
                        } : null}
                        isProcessing={isDiscarding}
                />
        </>);
}
