"use client";

import React, { useEffect, useState, useMemo } from 'react';
import { useDiffStore } from '@/store/diff-store';
import { useGraphDataStore } from '@/store/graph-data-store';
import { useEditorStore } from '@/store/editor-store';
import { useActiveFile } from '@/store/activitybar-store';
import { computeNodeDiff, resolveSnapshotContent } from '@/lib/client/diff-service';
import { 
    VscGitCompare, 
    VscClose, 
    VscFile, 
    VscFileCode, 
    VscCopy, 
    VscCheck, 
    VscGoToFile, 
    VscHistory 
} from 'react-icons/vsc';

function formatTimeAgo(timestamp?: number): string {
    if (!timestamp) return 'just now';
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return "just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

export default function DiffInspector() {
    const { isInspectorOpen, selectedCommitId, closeInspector, diffCache, setDiff } = useDiffStore();
    const commits = useGraphDataStore((state) => state.commits);
    const [isLoading, setIsLoading] = useState(false);
    const [copied, setCopied] = useState(false);

    // Selected commit snapshot from the graph data
    const commit = useMemo(() => {
        if (!selectedCommitId) return null;
        return commits.find((c) => c.id === selectedCommitId) || null;
    }, [selectedCommitId, commits]);

    const isRoot = !commit?.parentIds || commit.parentIds.length === 0 || commit.id === 'root';
    const parentId = commit?.parentIds?.[0] || null;
    const parentCommit = useMemo(() => {
        if (!parentId) return null;
        return commits.find((c) => c.id === parentId) || null;
    }, [parentId, commits]);

    const diff = selectedCommitId ? diffCache[selectedCommitId] : null;

    // Trigger diff calculation when a commit is selected
    useEffect(() => {
        if (!selectedCommitId || !commit) return;

        if (diffCache[selectedCommitId]) return;

        let cancelled = false;
        setIsLoading(true);

        computeNodeDiff(commit, parentCommit)
            .then((result) => {
                if (!cancelled) {
                    setDiff(selectedCommitId, result);
                    setIsLoading(false);
                }
            })
            .catch((err) => {
                console.error('[DiffInspector] Failed to compute diff:', err);
                if (!cancelled) setIsLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [selectedCommitId, commit, parentCommit, diffCache, setDiff]);

    if (!isInspectorOpen || !selectedCommitId) {
        return null;
    }

    const commitTitle = commit?.name || (isRoot ? 'Initial Root' : `Commit: ${selectedCommitId.substring(0, 7)}`);
    const fileName = commit?.filePath ? (commit.filePath.split('/').pop() || commit.filePath) : 'file.tsx';
    const addedLines = diff?.addedLines ?? 0;
    const deletedLines = diff?.deletedLines ?? 0;
    const totalChanges = addedLines + deletedLines;
    const addedPercent = totalChanges > 0 ? (addedLines / totalChanges) * 100 : 50;

    const handleCopy = () => {
        if (!diff?.unifiedDiff) return;
        navigator.clipboard.writeText(diff.unifiedDiff).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    const handleOpenInEditor = async () => {
        if (!commit) return;
        const store = useEditorStore.getState();
        const filePath = commit.filePath || store.selectedFile || 'file.tsx';
        const draftName = commit.name || (commit.id === 'root' ? 'root' : commit.id.substring(0, 7));

        try {
            const content = await resolveSnapshotContent(commit.id, filePath);
            const cacheKey = `${filePath}::${draftName}`;
            const newBuffers = new Map(store.fileBuffers);
            newBuffers.set(cacheKey, { content, etag: '' });

            store.setActiveDraft(filePath, draftName);
            await store.setSelectedFile(filePath, draftName);

            useEditorStore.setState({
                buffer: content,
                fileBuffers: newBuffers,
                isDirty: false,
                saveStatus: 'idle',
                fileVersion: store.fileVersion + 1,
            });

            // Close graph view and switch to code editor
            useGraphDataStore.getState().setGraphViewOpen(false);
            useActiveFile.getState().setId('files');
        } catch (err) {
            console.error('[handleOpenInEditor] Error opening commit in editor:', err);
        }
    };

    return (
        <aside className="w-[460px] max-w-[50vw] h-full bg-[#01111d] border-l border-[#122d42] flex flex-col z-20 text-[#d6deeb] font-sans selection:bg-[#1d3b53] shadow-2xl overflow-hidden flex-shrink-0">
            {/* 1. Top Bar */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#122d42] bg-[#01111d] flex-shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                    <VscGitCompare size={16} className="text-[#82aaff] flex-shrink-0" />
                    <span className="text-[13px] font-semibold text-white truncate">
                        Diff Inspector
                    </span>
                    <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-[#011627] border border-[#1f384c] text-[#7fdbca] flex-shrink-0 select-all">
                        {isRoot ? 'root' : selectedCommitId.substring(0, 7)}
                    </span>
                </div>
                <button
                    onClick={closeInspector}
                    title="Close Diff Inspector"
                    className="p-1 rounded text-[#5f7e97] hover:text-white hover:bg-[#0b253a] transition-colors cursor-pointer bg-transparent border-none flex-shrink-0"
                >
                    <VscClose size={18} />
                </button>
            </div>

            {/* 2. Scrollable Body */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col">
                {/* Commit Meta Card */}
                <div className="m-3 p-3 rounded-lg bg-[#011627] border border-[#1f384c] flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-2">
                        <span className="text-[13px] font-bold text-white leading-tight">
                            {commitTitle}
                        </span>
                        {commit?.category && (
                            <span className="text-[10px] px-2 py-0.5 rounded bg-[#82aaff]/15 border border-[#82aaff]/30 text-[#82aaff] font-medium capitalize flex-shrink-0">
                                {commit.category}
                            </span>
                        )}
                    </div>

                    <div className="flex items-center gap-2 text-[11px] text-[#5f7e97] flex-wrap">
                        <span className="flex items-center gap-1">
                            <VscHistory size={12} className="text-[#82aaff]" />
                            {formatTimeAgo(commit?.timestamp)}
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1 min-w-0 truncate text-[#7fdbca]">
                            <VscFile size={12} className="flex-shrink-0" />
                            <span className="truncate font-mono">{fileName}</span>
                        </span>
                    </div>

                    <div className="text-[10px] text-[#5f7e97] pt-1 border-t border-[#122d42]/60 flex items-center justify-between">
                        <span>
                            {isRoot 
                                ? "Baseline snapshot (no parent)" 
                                : `Compared with parent: ${parentId?.substring(0, 7)}`}
                        </span>
                    </div>
                </div>

                {/* Diff Stats & Actions */}
                <div className="px-3 pb-3 flex flex-col gap-2.5">
                    {/* Metrics row */}
                    <div className="flex items-center justify-between text-[11px] font-mono">
                        <div className="flex items-center gap-2 font-semibold">
                            <span className="px-1.5 py-0.5 rounded bg-[#addb67]/15 text-[#addb67] border border-[#addb67]/30">
                                +{addedLines} additions
                            </span>
                            <span className="px-1.5 py-0.5 rounded bg-[#ef5350]/15 text-[#ef5350] border border-[#ef5350]/30">
                                -{deletedLines} deletions
                            </span>
                        </div>
                        <span className="text-[#5f7e97]">
                            {diff?.totalLines ?? 0} lines total
                        </span>
                    </div>

                    {/* Proportion bar */}
                    {totalChanges > 0 && (
                        <div className="w-full h-1.5 bg-[#0b253a] rounded-full overflow-hidden flex">
                            <div 
                                className="h-full bg-[#addb67]" 
                                style={{ width: `${addedPercent}%` }} 
                                title={`${addedLines} additions`}
                            />
                            <div 
                                className="h-full bg-[#ef5350]" 
                                style={{ width: `${100 - addedPercent}%` }} 
                                title={`${deletedLines} deletions`}
                            />
                        </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex items-center gap-2 pt-1">
                        <button
                            onClick={handleOpenInEditor}
                            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-md bg-[#82aaff] hover:bg-[#9abaff] text-[#011627] font-semibold text-[12px] transition-colors cursor-pointer shadow-sm"
                        >
                            <VscGoToFile size={14} />
                            Open in Editor
                        </button>
                        <button
                            onClick={handleCopy}
                            disabled={!diff?.unifiedDiff}
                            className="flex items-center gap-1.5 py-1.5 px-3 rounded-md bg-[#0b253a] hover:bg-[#1d3b53] border border-[#1f384c] text-[#d6deeb] text-[12px] transition-colors cursor-pointer disabled:opacity-40"
                        >
                            {copied ? (
                                <>
                                    <VscCheck size={14} className="text-[#addb67]" />
                                    <span className="text-[#addb67]">Copied</span>
                                </>
                            ) : (
                                <>
                                    <VscCopy size={14} className="text-[#82aaff]" />
                                    <span>Copy Patch</span>
                                </>
                            )}
                        </button>
                    </div>
                </div>

                {/* 3. Code Diff Canvas */}
                <div className="flex-1 flex flex-col min-h-0 border-t border-[#122d42]">
                    {/* Header bar */}
                    <div className="px-3 py-1.5 bg-[#0b253a]/60 border-b border-[#122d42] flex items-center justify-between text-[11px] text-[#5f7e97] font-mono flex-shrink-0">
                        <div className="flex items-center gap-1.5">
                            <VscFileCode size={13} className="text-[#7fdbca]" />
                            <span className="text-[#d6deeb] font-semibold">{fileName}</span>
                        </div>
                        <span>
                            {diff?.hunks?.length ?? 0} {diff?.hunks?.length === 1 ? 'hunk' : 'hunks'}
                        </span>
                    </div>

                    {/* Code Diff Body */}
                    <div className="flex-1 overflow-auto bg-[#011627] text-[11px] font-mono leading-tight">
                        {isLoading ? (
                            <div className="p-8 flex flex-col items-center justify-center gap-2 text-[#5f7e97]">
                                <span className="w-3 h-3 rounded-full border-2 border-[#82aaff] border-t-transparent animate-spin" />
                                <span>Computing diff with DiffEngine…</span>
                            </div>
                        ) : diff?.identical ? (
                            <div className="p-8 flex flex-col items-center justify-center gap-2 text-[#5f7e97] text-center">
                                <VscCheck size={24} className="text-[#addb67]" />
                                <span className="font-semibold text-[#d6deeb]">No Changes</span>
                                <span className="text-[11px]">This snapshot has identical content to its parent.</span>
                            </div>
                        ) : diff?.hunks && diff.hunks.length > 0 ? (
                            <div className="divide-y divide-[#1f384c]/50">
                                {diff.hunks.map((hunk, hIdx) => (
                                    <div key={hIdx} className="flex flex-col">
                                        {/* Hunk Header */}
                                        <div className="px-3 py-1 bg-[#0b253a]/80 text-[#82aaff] text-[10px] font-mono border-y border-[#1f384c] select-none">
                                            {hunk.header}
                                        </div>

                                        {/* Lines */}
                                        <div className="py-0.5">
                                            {hunk.lines.map((line, lIdx) => {
                                                const isInsert = line.type === 'insert';
                                                const isDelete = line.type === 'delete';

                                                return (
                                                    <div
                                                        key={lIdx}
                                                        className={`flex items-start transition-colors ${
                                                            isInsert
                                                                ? 'bg-[#addb67]/10 text-[#addb67]'
                                                                : isDelete
                                                                ? 'bg-[#ef5350]/10 text-[#ef5350]'
                                                                : 'hover:bg-[#0b253a]/40 text-[#d6deeb]'
                                                        }`}
                                                    >
                                                        {/* Old Line Gutter */}
                                                        <span className="w-10 text-right pr-2 text-[10px] text-[#4b6479] select-none flex-shrink-0">
                                                            {line.oldLineNum ?? ''}
                                                        </span>
                                                        {/* New Line Gutter */}
                                                        <span className="w-10 text-right pr-2 text-[10px] text-[#4b6479] select-none flex-shrink-0">
                                                            {line.newLineNum ?? ''}
                                                        </span>
                                                        {/* Sign */}
                                                        <span className={`w-4 text-center select-none font-bold flex-shrink-0 ${
                                                            isInsert ? 'text-[#addb67]' : isDelete ? 'text-[#ef5350]' : 'text-transparent'
                                                        }`}>
                                                            {isInsert ? '+' : isDelete ? '-' : ' '}
                                                        </span>
                                                        {/* Line Content */}
                                                        <span className="flex-1 whitespace-pre overflow-x-auto pr-3">
                                                            {line.content || '\n'}
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="p-8 text-center text-[#5f7e97] text-[11px]">
                                {isRoot ? 'Initial commit baseline (all lines added)' : 'No hunks generated.'}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </aside>
    );
}
