import React, { useMemo, useEffect } from 'react';
import { LayoutPosition, EdgeLayout } from '@/types/interfaces';
import { FileSnapshot } from '@/types/indexed-db-schema';
import { VscFile, VscChevronDown } from 'react-icons/vsc';
import { useDiffStore } from '@/store/diff-store';
import { computeNodeDiff } from '@/lib/client/diff-service';

interface VisibleNode {
    id: string;
    position: LayoutPosition;
}

interface RadialGraphRendererProps {
    visibleNodes: VisibleNode[];
    allPositions?: ReadonlyMap<string, LayoutPosition>;
    edges: readonly EdgeLayout[];
    highlightedNodeIds: Set<string> | null; // null = no filter active, show all normally
    commitMap?: Map<string, FileSnapshot>;
    activeFileId?: string | null;
    nodeOffsets: Record<string, { x: number; y: number }>;
    onNodeMouseDown?: (id: string, e: React.MouseEvent) => void;
    onNodeClick?: (id: string) => void;
    onNodeHover?: (id: string | null) => void;
    onSetActiveNode?: (id: string) => void;
}

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

const RadialGraphRenderer = React.memo(function RadialGraphRenderer({ 
    visibleNodes, 
    allPositions,
    edges,
    highlightedNodeIds,
    commitMap,
    activeFileId,
    nodeOffsets,
    onNodeMouseDown,
    onNodeClick,
    onNodeHover,
    onSetActiveNode
}: RadialGraphRendererProps) {
    const diffCache = useDiffStore((state) => state.diffCache);
    const setDiff = useDiffStore((state) => state.setDiff);
    const selectCommit = useDiffStore((state) => state.selectCommit);
    
    // Automatically compute diffs for visible nodes in the background
    useEffect(() => {
        if (!commitMap) return;

        visibleNodes.forEach(({ id }) => {
            const commit = commitMap.get(id);
            if (!commit) return;
            if (useDiffStore.getState().diffCache[id]) return; // Already cached

            const parentId = commit.parentIds && commit.parentIds.length > 0 ? commit.parentIds[0] : null;
            const parentCommit = parentId ? commitMap.get(parentId) : null;

            computeNodeDiff(commit, parentCommit)
                .then((summary) => setDiff(id, summary))
                .catch((err) => console.warn(`[RadialGraph] Error calculating diff for ${id}:`, err));
        });
    }, [visibleNodes, commitMap, setDiff]);

    // Position map including current offsets for all nodes
    const positionMap = useMemo(() => {
        const map = new Map<string, { x: number; y: number }>();
        if (allPositions) {
            allPositions.forEach((pos, id) => {
                const off = nodeOffsets[id] || { x: 0, y: 0 };
                map.set(id, { x: pos.x + off.x, y: pos.y + off.y });
            });
        }
        visibleNodes.forEach(({ id, position }) => {
            const off = nodeOffsets[id] || { x: 0, y: 0 };
            map.set(id, { x: position.x + off.x, y: position.y + off.y });
        });
        return map;
    }, [allPositions, visibleNodes, nodeOffsets]);

    // 1. Edge Virtualization and Dynamic Path Calculation
    const visibleEdges = useMemo(() => {
        const visibleIds = new Set(visibleNodes.map(n => n.id));
        
        return edges.filter(edge => 
            visibleIds.has(edge.sourceId) || visibleIds.has(edge.targetId)
        );
    }, [visibleNodes, edges]);

    // Helper: is a specific node highlighted (or is filtering inactive)?
    const isNodeHighlighted = (id: string): boolean => {
        if (highlightedNodeIds === null) return true; // No filter active
        return highlightedNodeIds.has(id);
    };

    // Helper: is a specific edge highlighted?
    const isEdgeHighlighted = (edge: EdgeLayout): boolean => {
        if (highlightedNodeIds === null) return true; // No filter active
        return highlightedNodeIds.has(edge.sourceId) || highlightedNodeIds.has(edge.targetId);
    };

    return (
        <div className="absolute inset-0">
            
            {/* --- THE SVG LAYER (Lines) --- */}
            <svg 
                className="absolute overflow-visible pointer-events-none" 
                style={{ zIndex: 0 }}
            >
                {visibleEdges.map(edge => {
                    const highlighted = isEdgeHighlighted(edge);
                    const srcOffset = nodeOffsets[edge.sourceId];
                    const tgtOffset = nodeOffsets[edge.targetId];
                    const hasOffset = (srcOffset && (srcOffset.x !== 0 || srcOffset.y !== 0)) || 
                                      (tgtOffset && (tgtOffset.x !== 0 || tgtOffset.y !== 0));

                    let pathD = edge.svgPath;
                    if (hasOffset) {
                        const src = positionMap.get(edge.sourceId);
                        const tgt = positionMap.get(edge.targetId);
                        if (src && tgt) {
                            const dx = tgt.x - src.x;
                            const dy = tgt.y - src.y;
                            const cx1 = src.x + dx * 0.5;
                            const cy1 = src.y;
                            const cx2 = src.x + dx * 0.5;
                            const cy2 = tgt.y;
                            pathD = `M ${src.x} ${src.y} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${tgt.x} ${tgt.y}`;
                        }
                    }

                    return (
                        <path
                            key={`${edge.sourceId}-${edge.targetId}`}
                            d={pathD}
                            fill="none"
                            stroke={edge.color}
                            strokeWidth={2}
                            opacity={highlighted ? edge.opacity : 0.15}
                            style={{
                                transition: hasOffset ? 'none' : 'opacity 0.3s ease',
                            }}
                        />
                    );
                })}
            </svg>

            {/* --- THE HTML LAYER (Commit Cards) --- */}
            {visibleNodes.map(({ id, position }) => {
                const highlighted = isNodeHighlighted(id);
                const commit = commitMap?.get(id);
                const isRoot = id === 'root' || (!commit?.parentIds || commit.parentIds.length === 0);
                const commitTitle = commit?.name || (isRoot ? 'Initial Root' : `Commit: ${id.substring(0, 7)}`);
                const category = commit?.category || (isRoot ? 'base' : 'feature');
                const isActive = activeFileId ? (id === activeFileId) : isRoot;
                const fileName = commit?.filePath ? (commit.filePath.split('/').pop() || commit.filePath) : 'file.tsx';
                const timeStr = formatTimeAgo(commit?.timestamp);
                const diff = diffCache[id];

                const offset = nodeOffsets[id] || { x: 0, y: 0 };
                const curX = position.x + offset.x;
                const curY = position.y + offset.y;

                return (
                    <div
                        key={id}
                        className="absolute shadow-xl rounded-xl border p-3 cursor-pointer select-none group flex flex-col justify-between transition-all duration-150"
                        style={{ 
                            transform: `translate(${curX - position.width / 2}px, ${curY - position.height / 2}px)`,
                            width: position.width,
                            height: position.height,
                            zIndex: isActive ? 25 : (highlighted ? 10 : 5),
                            opacity: highlighted ? 1 : 0.25,
                            backgroundColor: '#011627',
                            borderColor: isActive 
                                ? '#82aaff' 
                                : (isRoot 
                                    ? (highlighted ? '#7fdbca' : '#7fdbca66') 
                                    : (highlighted ? '#1f384c' : '#122d42')),
                            borderWidth: (isActive || isRoot) ? '2px' : '1px',
                            boxShadow: isActive 
                                ? '0 0 24px rgba(130, 170, 255, 0.35), 0 8px 24px rgba(0, 0, 0, 0.6)' 
                                : '0 8px 24px rgba(0, 0, 0, 0.45)',
                            filter: highlighted ? 'none' : 'grayscale(60%)',
                        }}
                        onClick={() => {
                            selectCommit(id);
                            onNodeClick && onNodeClick(id);
                        }}
                        onMouseDown={(e) => {
                            if (e.button !== 0) return;
                            e.stopPropagation();
                            onNodeMouseDown && onNodeMouseDown(id, e);
                        }}
                        onMouseEnter={() => onNodeHover && onNodeHover(id)}
                        onMouseLeave={() => onNodeHover && onNodeHover(null)}
                    >
                        {/* 1. Header & Badges */}
                        <div>
                            {/* Title & Time */}
                            <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                    {isRoot && (
                                        <span className="text-[9px] px-1.5 py-0.5 bg-[#7fdbca] text-[#011627] rounded font-bold uppercase tracking-wider flex-shrink-0">
                                            ROOT
                                        </span>
                                    )}
                                    <span className="font-semibold text-[12px] truncate text-[#d6deeb]" title={commitTitle}>
                                        {commitTitle}
                                    </span>
                                </div>
                                <span className="text-[#5f7e97] text-[10px] flex-shrink-0 font-mono">
                                    {timeStr}
                                </span>
                            </div>

                            {/* Badges Row */}
                            <div className="flex items-center justify-between mt-1 gap-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-[#01111d] border border-[#1f384c] text-[#7fdbca]">
                                        {isRoot ? 'root' : id.substring(0, 7)}
                                    </span>
                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#82aaff]/15 border border-[#82aaff]/30 text-[#82aaff] font-medium capitalize">
                                        {category}
                                    </span>
                                    {isActive && (
                                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#addb67]/15 border border-[#addb67]/40 text-[#addb67] font-bold tracking-wider">
                                            ACTIVE
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-1 text-[10px] font-mono font-semibold flex-shrink-0">
                                    <span className="text-[#addb67]">+{diff?.addedLines ?? 0}</span>
                                    <span className="text-[#ef5350]">-{diff?.deletedLines ?? 0}</span>
                                </div>
                            </div>
                        </div>

                        {/* 2. Inner Diff Preview Box (Computed Dynamically) */}
                        <div className="my-1 rounded-lg border border-[#1f384c] bg-[#01111d] overflow-hidden text-[10px] font-mono flex flex-col">
                            {/* File bar inside diff */}
                            <div className="px-2 py-0.5 bg-[#0b253a]/70 border-b border-[#1f384c] flex items-center justify-between text-[#89a4bb]">
                                <div className="flex items-center gap-1 truncate">
                                    <VscChevronDown size={11} className="text-[#5f7e97] flex-shrink-0" />
                                    <span className="truncate text-[#7fdbca] text-[9.5px]">{fileName}</span>
                                </div>
                                <span className="text-[9px] text-[#5f7e97] flex-shrink-0">diff</span>
                            </div>
                            {/* Code Diff Lines */}
                            <div className="px-1 py-1 space-y-0.5 text-[9px] leading-tight select-none min-h-[50px] flex flex-col justify-center">
                                {diff?.previewLines && diff.previewLines.length > 0 ? (
                                    diff.previewLines.slice(0, 3).map((line, lIdx) => {
                                        const isInsert = line.type === 'insert';
                                        const isDelete = line.type === 'delete';

                                        return (
                                            <div 
                                                key={lIdx} 
                                                className={`flex items-center px-1 rounded-[2px] gap-2 ${
                                                    isInsert 
                                                        ? 'bg-[#addb67]/15 text-[#addb67]' 
                                                        : isDelete 
                                                        ? 'bg-[#ef5350]/15 text-[#ef5350]' 
                                                        : 'text-[#d6deeb]'
                                                }`}
                                            >
                                                <span className={`w-3 text-right flex-shrink-0 ${
                                                    isInsert ? 'text-[#addb67]' : isDelete ? 'text-[#ef5350]' : 'text-[#4b6479]'
                                                }`}>
                                                    {line.lineNum}
                                                </span>
                                                <span className="truncate">
                                                    {isInsert ? `+ ${line.content}` : isDelete ? `- ${line.content}` : `  ${line.content}`}
                                                </span>
                                            </div>
                                        );
                                    })
                                ) : (
                                    <div className="px-2 py-1 text-[#5f7e97] italic text-[9px] text-center">
                                        {isRoot ? 'Initial baseline commit' : 'No changes detected'}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* 3. Footer Bar */}
                        <div className="flex items-center justify-between pt-1 border-t border-[#122d42] text-[10px]">
                            <div className="flex items-center gap-1 text-[#5f7e97]">
                                <VscFile size={12} className="text-[#7fdbca]" />
                                <span>1 file changed</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onSetActiveNode && onSetActiveNode(id);
                                    }}
                                    title={isActive ? "Active branch head" : "Set this version as active"}
                                    className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors ${
                                        isActive
                                            ? "bg-[#addb67]/15 border-[#addb67]/40 text-[#addb67]"
                                            : "bg-[#0b253a] border-[#1f384c] text-[#5f7e97] hover:text-[#82aaff] hover:border-[#82aaff]"
                                    }`}
                                >
                                    {isActive ? "✓ Head" : "Set Head"}
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        selectCommit(id);
                                        onNodeClick && onNodeClick(id);
                                    }}
                                    className="bg-[#0b253a] hover:bg-[#1d3b53] border border-[#1f384c] text-[#d6deeb] text-[9.5px] px-2 py-0.5 rounded transition-colors"
                                >
                                    View diff
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
});

export default RadialGraphRenderer;

