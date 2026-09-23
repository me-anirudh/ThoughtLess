import { EdgeLayout, LayoutPosition, LayoutSnapshot } from "@/types/interfaces";
import { D3TreeNode, MergeEdge } from "./tree-data-converter";
import { hierarchy, tree } from 'd3-hierarchy';
import { linkRadial } from 'd3-shape';

const RING_SPACING = 240;
const NODE_WIDTH = 340;
const NODE_HEIGHT = 200;

// BUG-37 fix: incrementing revision counter instead of hardcoded 0
let _revisionCounter = 0;

export function compute(d3TreeRoot: D3TreeNode, centerX: number = 0, centerY: number = 0, mergeEdges: MergeEdge[] = []): LayoutSnapshot {

        const start = performance.now(); //Will help us to give us the stats of how much time it took

        const root = hierarchy(d3TreeRoot); 

        const maxDepth = root.height; 

        const totalRadius = maxDepth * RING_SPACING;
   
        tree<D3TreeNode>()
        .size([2 * Math.PI, totalRadius])    // full circle, max radius
        .separation((a, b) => {
            const depth = Math.max(1, a.depth); 

            return (a.parent === b.parent ? 1 : 2) / depth; 
        })
        (root);
        const grid = new Map<string, string[]>();  
        const positions = new Map<string, LayoutPosition>();
    root.each(node => {
        const angle = node.x!;                // D3's x = angle in radians
        const radius = node.y!;               // D3's y = radius in pixels
        // Converting to coordinates in cartesian. 
        const screenX = centerX + radius * Math.cos(angle - Math.PI / 2); 
        const screenY = centerY + radius * Math.sin(angle - Math.PI / 2);
        
        positions.set(node.data.id, {
            x: screenX,
            y: screenY,
            width: NODE_WIDTH,
            height: NODE_HEIGHT,
            depth: node.depth,
            angle, 
            radius
        });
        const cellX = Math.floor(screenX / 350);
        const cellY = Math.floor(screenY / 350);
        const cellKey = `${cellX},${cellY}`;

         if (!grid.has(cellKey)) grid.set(cellKey, []);
        grid.get(cellKey)!.push(node.data.id);
    });
   
    const edges: EdgeLayout[] = [];
    root.links().forEach(link => {
        const pathGenerator = linkRadial<any, any>()
            .angle(d => d.x)
            .radius(d => d.y);

        const svgPathString = pathGenerator(link as any) || '';
        const newSourceX : number = centerX + link.source.y! * Math.cos(link.source.x! - Math.PI / 2); 
        const newSourceY : number = centerY + link.source.y! * Math.sin(link.source.x! - Math.PI / 2); 
        const newTargetX : number = centerX + link.target.y! * Math.cos(link.target.x! - Math.PI / 2); 
        const newTargetY : number = centerY + link.target.y! * Math.sin(link.target.x! - Math.PI / 2);
        edges.push({
            sourceId: link.source.data.id,
            targetId: link.target.data.id,
            controlPoints: [
                { x: newSourceX,
                  y:  newSourceY},
                { x: newTargetX,
                  y: newTargetY}
            ],
            svgPath: svgPathString,   // The curved path string for <path d="...">
            color: '#1f384c',
            opacity: 0.8
        });

        
    });

    // BUG-13 fix: Add merge edges (cross-branch connections pruned from the tree)
    for (const mergeEdge of mergeEdges) {
        const sourcePos = positions.get(mergeEdge.sourceId);
        const targetPos = positions.get(mergeEdge.targetId);
        if (sourcePos && targetPos) {
            edges.push({
                sourceId: mergeEdge.sourceId,
                targetId: mergeEdge.targetId,
                controlPoints: [
                    { x: sourcePos.x, y: sourcePos.y },
                    { x: targetPos.x, y: targetPos.y }
                ],
                svgPath: `M${sourcePos.x},${sourcePos.y}L${targetPos.x},${targetPos.y}`,
                color: '#82aaff',  // Night Owl blue accent for merge edges
                opacity: 0.7
            });
        }
    }

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    positions.forEach(pos => {
        minX = Math.min(minX, pos.x);
        maxX = Math.max(maxX, pos.x);
        minY = Math.min(minY, pos.y);
        maxY = Math.max(maxY, pos.y);
    });

    return Object.freeze({ 
        // Makes something immutable 
        revision: ++_revisionCounter,
        nodes: positions,
        edges: Object.freeze(edges),
        grid : Object.freeze(grid), 
        bounds: Object.freeze({
            width: maxX - minX + NODE_WIDTH,
            height: maxY - minY + NODE_HEIGHT
        }),
        stats: Object.freeze({
            totalNodes: positions.size,
            totalEdges: edges.length,
            maxDepth: root.height,
            layoutTimeMs: performance.now() - start
        })
    });
}
