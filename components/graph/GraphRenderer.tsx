'use client'; // This must be a client component since it uses state and DOM events

import React, { useMemo, useState, useEffect } from 'react';
import { useGraphDataStore } from '@/store/graph-data-store';
import { useCameraStore } from '@/store/camera-store';
import { useFilterStore } from '@/store/filter-store';
import { useHoverStore } from '@/store/hover-store';
import { useExpandedStore } from '@/store/selection-store';
import { useDiffStore } from '@/store/diff-store';
import { useEditorStore } from '@/store/editor-store';
import { useSidebarStore } from '@/store/sidebar-store';
import { useNodeOffsetStore } from '@/store/node-offset-store';
import { useActiveFile } from '@/store/activitybar-store';
import { compute } from '@/lib/graph/layout-constructor';
import RadialGraphRenderer from '@/components/graph/RadialGraphRenderer';
import { FileSnapshot } from '@/types/indexed-db-schema';
import { LayoutPosition } from '@/types/interfaces';
import buildD3Tree from '@/lib/graph/tree-data-converter';
import { getActiveProjectId, getActiveProjectVersionId } from '@/lib/utils/project';
import { reconstructFile, loadGraphDataForFile } from '@/lib/client/vcs-db';

const createFallbackPosition = (x: number, y: number, depth: number = 0): LayoutPosition => ({
    x,
    y,
    width: 340,
    height: 200,
    depth,
    angle: 0,
    radius: 0
});

const CELL_SIZE = 300; 
const BUFFER = 500; 

interface DragState {
    type: 'canvas' | 'node';
    nodeId?: string;
    startX: number;
    startY: number;
    hasMoved: boolean;
}

export default function GraphController() {
    // 1. Get our raw data from Zustand
    const commits = useGraphDataStore(state => state.commits);
    const activeFile = useGraphDataStore(state => state.activeFile);
    const currentFilePath = useGraphDataStore(state => state.currentFilePath);
    const childMap = useGraphDataStore(state => state.childMap);
    const categories = useGraphDataStore(state => state.categories);
    const selectedFile = useEditorStore(state => state.selectedFile);
    const folderName = useSidebarStore(state => state.folderName);
    const nodeOffsets = useNodeOffsetStore(state => state.offsets);

    // 2. Get our camera coordinates from Zustand
    const { panX, panY, zoom } = useCameraStore();

    // Auto-center camera around the root node on first mount if not panned
    useEffect(() => {
        const { panX: currentPanX, panY: currentPanY } = useCameraStore.getState();
        if (currentPanX === 0 && currentPanY === 0 && typeof window !== 'undefined') {
            const containerWidth = window.innerWidth - 348;
            const containerHeight = window.innerHeight;
            useCameraStore.setState({
                panX: Math.max(containerWidth / 2, 350),
                panY: Math.max(containerHeight / 2, 250),
                zoom: 1
            });
        }
    }, []);

    // Ensure the graph always shows the selected file's version history
    useEffect(() => {
        if (selectedFile) {
            useGraphDataStore.getState().setCurrentFilePath(selectedFile);
            loadGraphDataForFile(selectedFile).catch(err => {
                console.error('[GraphController] Failed to load graph data for file:', err);
            });
        }
    }, [selectedFile]);

    // 3. Get filter state
    const activeCategories = useFilterStore(state => state.activeCategories);
    const searchQuery = useFilterStore(state => state.searchQuery);

    const setHover = useHoverStore(state => state.setHover);
    const setSelectedId = useExpandedStore(state => state.setSelectedId);

    const handleNodeHover = (id: string | null) => setHover(id);

    // Local state for dragging (canvas vs independent node)
    const [dragState, setDragState] = useState<DragState | null>(null);

    // 3.1 Root Node Resolution (scoped to the active file)
    const effectiveCommits = useMemo<FileSnapshot[]>(() => {
        const targetPath = currentFilePath || selectedFile || folderName || 'root';
        const rootName = targetPath ? (targetPath.split('/').pop() || targetPath) : (folderName || 'root');
        const defaultRootSnapshot: FileSnapshot = {
            id: 'root',
            projectId: getActiveProjectId(),
            projectVersionId: getActiveProjectVersionId(),
            filePath: targetPath,
            contentHash: rootName,
            storageType: 'full',
            parentIds: [],
            byteSize: 0,
            language: null,
            timestamp: Date.now(),
            category: 'feature',
            name: rootName,
            isSynced: 1
        };

        if (commits && commits.length > 0) {
            const hasRoot = commits.some(c => c.id === 'root' || (!c.parentIds || c.parentIds.length === 0));
            if (hasRoot) return commits;
            return [defaultRootSnapshot, ...commits];
        }

        return [defaultRootSnapshot];
    }, [commits, currentFilePath, selectedFile, folderName]);

    // Handle clicking a node -> opens the right-side Diff Inspector
    const handleNodeClick = (id: string) => {
        setSelectedId(id);
        useDiffStore.getState().selectCommit(id);
    };

    // Explicitly set isActive version for this specific file
    const handleSetActiveNode = (id: string) => {
        const clickedCommit = effectiveCommits.find(c => c.id === id);
        if (clickedCommit) {
            const targetPath = clickedCommit.filePath || currentFilePath || selectedFile;
            if (targetPath) {
                useGraphDataStore.getState().setActiveFileForPath(targetPath, clickedCommit);
            } else {
                useGraphDataStore.getState().setActiveFile(clickedCommit);
            }
        }
    };

    // 3. THE REVISION CACHE (The Math Engine)
    const snapshot = useMemo(() => {
        try {
            if (!effectiveCommits || effectiveCommits.length === 0) {
                const fallbackNodes = new Map<string, LayoutPosition>();
                fallbackNodes.set('root', createFallbackPosition(0, 0));
                const fallbackGrid = new Map<string, string[]>();
                fallbackGrid.set('0,0', ['root']);
                return {
                    nodes: fallbackNodes,
                    edges: [],
                    grid: fallbackGrid
                };
            }
            
            const rootCommit = effectiveCommits.find(c => c.id === 'root' || (!c.parentIds || c.parentIds.length === 0)) || effectiveCommits[0];
            const rootId = rootCommit.id;

            const snapshotMap = new Map<string, FileSnapshot>();
            effectiveCommits.forEach(commit => snapshotMap.set(commit.id, commit));

            const effectiveChildMap = new Map(childMap);
            effectiveCommits.forEach(commit => {
                for (const parentId of commit.parentIds || []) {
                    const existing = effectiveChildMap.get(parentId) || [];
                    if (!existing.includes(commit.id)) {
                        effectiveChildMap.set(parentId, [...existing, commit.id]);
                    }
                }
            });

            const { root: d3Tree, mergeEdges } = buildD3Tree(rootId, effectiveChildMap, snapshotMap);
            return compute(d3Tree, 0, 0, mergeEdges); 
        } catch (err) {
            console.error('[GraphController] Layout computation error:', err);
            const fallbackNodes = new Map<string, LayoutPosition>();
            const fallbackGrid = new Map<string, string[]>();
            if (effectiveCommits && effectiveCommits.length > 0) {
                effectiveCommits.forEach((c, idx) => {
                    fallbackNodes.set(c.id, createFallbackPosition(idx * 300, 0));
                });
                fallbackGrid.set('0,0', effectiveCommits.map(c => c.id));
            } else {
                fallbackNodes.set('root', createFallbackPosition(0, 0));
                fallbackGrid.set('0,0', ['root']);
            }
            return {
                nodes: fallbackNodes,
                edges: [],
                grid: fallbackGrid
            };
        }
    }, [effectiveCommits, childMap]);

    // 4. INTERACTION: Zooming
    const handleWheel = (e: React.WheelEvent) => {
        const mx = e.clientX; 
        const my = e.clientY; 

        const worldX = (mx - panX) / zoom;
        const worldY = (my - panY) / zoom;

        const newZoomUnclamped = zoom * (1 + e.deltaY * -0.001);
        const newZoom = Math.min(Math.max(newZoomUnclamped, 0.1), 3.0);

        const newPanX = mx - worldX * newZoom;
        const newPanY = my - worldY * newZoom;

        useCameraStore.setState({ zoom: newZoom, panX: newPanX, panY: newPanY });
    };

    // 5. INTERACTION: Canvas Panning (Click & Drag on Canvas Background)
    const handleCanvasMouseDown = (e: React.MouseEvent) => {
        if (e.button !== 0) return;
        setDragState({
            type: 'canvas',
            startX: e.clientX,
            startY: e.clientY,
            hasMoved: false
        });
    };

    // Node drag start
    const handleNodeMouseDown = (id: string, e: React.MouseEvent) => {
        if (e.button !== 0) return;
        setDragState({
            type: 'node',
            nodeId: id,
            startX: e.clientX,
            startY: e.clientY,
            hasMoved: false
        });
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!dragState) return;

        const dist = Math.hypot(e.clientX - dragState.startX, e.clientY - dragState.startY);
        const isMoved = dragState.hasMoved || dist > 3;

        if (dragState.type === 'canvas') {
            const dx = e.movementX;
            const dy = e.movementY;
            useCameraStore.setState(state => ({ panX: state.panX + dx, panY: state.panY + dy }));
            if (!dragState.hasMoved && isMoved) {
                setDragState(prev => prev ? { ...prev, hasMoved: true } : null);
            }
        } else if (dragState.type === 'node' && dragState.nodeId) {
            // Independent node drag! World coordinates adjusted by zoom.
            const currentZoom = useCameraStore.getState().zoom || 1;
            const dxWorld = e.movementX / currentZoom;
            const dyWorld = e.movementY / currentZoom;

            useNodeOffsetStore.getState().updateNodeOffset(dragState.nodeId, dxWorld, dyWorld);

            if (!dragState.hasMoved && isMoved) {
                setDragState(prev => prev ? { ...prev, hasMoved: true } : null);
            }
        }
    };

    const handleMouseUp = () => {
        if (!dragState) return;

        if (dragState.type === 'node' && dragState.nodeId) {
            if (!dragState.hasMoved) {
                // Click without dragging -> open editor
                handleNodeClick(dragState.nodeId);
            }
        }
        setDragState(null);
    };

    // Viewport bounds calculation
    const minWorldX = (0 - panX) / zoom;
    const minWorldY = (0 - panY) / zoom;
    const maxWorldX = ((typeof window !== 'undefined' ? window.innerWidth : 1024) - panX) / zoom;
    const maxWorldY = ((typeof window !== 'undefined' ? window.innerHeight : 768) - panY) / zoom;

    const minCellX = Math.floor((minWorldX - BUFFER) / CELL_SIZE);
    const maxCellX = Math.floor((maxWorldX + BUFFER) / CELL_SIZE);
    const minCellY = Math.floor((minWorldY - BUFFER) / CELL_SIZE);
    const maxCellY = Math.floor((maxWorldY + BUFFER) / CELL_SIZE);

    const visibleNodes = useMemo(() => {
        if (!snapshot) return [];
        
        const visibleIds = new Set<string>();

        for (let x = minCellX; x <= maxCellX; x++) {
            for (let y = minCellY; y <= maxCellY; y++) {
                const cellKey = `${x},${y}`;
                const nodesInCell = snapshot.grid.get(cellKey) || [];
                nodesInCell.forEach(id => visibleIds.add(id));
            }
        }
        
        // Also ensure any dragged node is always visible
        Object.keys(nodeOffsets).forEach(id => visibleIds.add(id));

        return Array.from(visibleIds).map(id => ({
            id,
            position: snapshot.nodes.get(id)!
        })).filter(n => !!n.position);
    }, [snapshot, minCellX, maxCellX, minCellY, maxCellY, nodeOffsets]);

    const highlightedNodeIds = useMemo(() => {
        if (activeCategories.length === 0 && !searchQuery.trim()) return null;

        const matched = new Set<string>();
        const query = searchQuery.trim().toLowerCase();

        for (const commit of effectiveCommits) {
            const matchesCategory = activeCategories.length === 0 || (categories.get(commit.id) && activeCategories.includes(categories.get(commit.id)!));
            const matchesSearch = !query || commit.name.toLowerCase().includes(query) || commit.id.toLowerCase().includes(query);

            if (matchesCategory && matchesSearch) {
                matched.add(commit.id);
            }
        }
        return matched;
    }, [activeCategories, categories, effectiveCommits, searchQuery]);

    const commitMap = useMemo(() => {
        const map = new Map<string, FileSnapshot>();
        effectiveCommits.forEach(commit => map.set(commit.id, commit));
        return map;
    }, [effectiveCommits]);

    if (!snapshot) {
        return (
            <div className="w-full h-full flex items-center justify-center bg-[#011627] text-[#5f7e97] text-sm select-none">
                <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#82aaff] animate-ping" />
                    <span>Calculating graph layout…</span>
                </div>
            </div>
        );
    }

    const isGrabbing = dragState?.type === 'canvas' || dragState?.type === 'node';

    return (
        <div 
            className="w-full h-full overflow-hidden bg-[#011627] relative" 
            onWheel={handleWheel}
            onMouseDown={handleCanvasMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            style={{ 
                cursor: isGrabbing ? 'grabbing' : 'grab'
            }}
        >
            {/* The Camera Layer */}
            <div 
                className="absolute inset-0 origin-top-left"
                style={{ 
                    transform: `translate(${panX}px, ${panY}px) scale(${zoom})`
                }}
            >
                <RadialGraphRenderer 
                    edges={snapshot.edges} 
                    visibleNodes={visibleNodes}
                    allPositions={snapshot.nodes}
                    highlightedNodeIds={highlightedNodeIds}
                    commitMap={commitMap}
                    activeFileId={activeFile?.id}
                    nodeOffsets={nodeOffsets}
                    onNodeMouseDown={handleNodeMouseDown}
                    onNodeClick={handleNodeClick}
                    onNodeHover={handleNodeHover}
                    onSetActiveNode={handleSetActiveNode}
                />
            </div>
        </div>
    );
}
