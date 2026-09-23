import { IPipelineStage, IDiffContext, DiffRegion } from '../types';

export class PartitionEngineStage implements IPipelineStage {
  readonly name = 'PartitionEngine';

  execute(ctx: IDiffContext): void {
    if (ctx.binary || !ctx.normalizedOld || !ctx.normalizedNew) {
      // Binary files don't get partitioned by line
      if (ctx.binary) {
        ctx.regions = [{
          id: 'region-0',
          type: ctx.identical ? 'stable' : 'changed',
          oldStart: 0, oldEnd: 1,
          newStart: 0, newEnd: 1
        }];
      }
      return;
    }

    if (ctx.identical) {
      ctx.regions = [{
        id: 'region-0',
        type: 'stable',
        oldStart: 0, oldEnd: ctx.normalizedOld.lineHashes.length,
        newStart: 0, newEnd: ctx.normalizedNew.lineHashes.length
      }];
      return;
    }

    const MIN_STABLE_BLOCK = 15; // Minimum lines to consider a block "stable"

{/*
     const MERGE_THRESHOLD = 5;   // If stable block is < 5 lines, merge adjacent changed regions (Boundary Expansion)

    We abandoned this logic. 
 */}


    const oldHashes = ctx.normalizedOld.lineHashes;
    const newHashes = ctx.normalizedNew.lineHashes;
    
    // Find stable blocks using a rolling match
    const stableBlocks: { oldStart: number; newStart: number; length: number }[] = [];
    
    let oldIdx = 0;
    let newIdx = 0;

    // Simple greedy match (could use LCS, but greedy is fast and good enough for large identical blocks)
    // We scan to find the longest match from the current position
    while (oldIdx < oldHashes.length && newIdx < newHashes.length) {
      let bestMatch = { oldStart: -1, newStart: -1, length: 0 };

      // Look for the longest contiguous match starting anywhere in the remaining new hashes
      // To keep it O(N) in the typical case, we only search a reasonable window or use a hash map.
      // For V3, let's use a hash map to find candidate starts quickly.
      
      const newPosMap = new Map<number, number[]>();
      for (let j = newIdx; j < newHashes.length; j++) {
        const h = newHashes[j];
        if (!newPosMap.has(h)) newPosMap.set(h, []);
        newPosMap.get(h)!.push(j);  //Telling the compiler to trust me bro, this isn't undefined, i have already resolved this, this isnt undefined. 
      }

      for (let i = oldIdx; i < oldHashes.length; i++) {
        const h = oldHashes[i];
        const newPositions = newPosMap.get(h);
        if (newPositions) {
          for (const j of newPositions) {
            // if (j < newIdx) continue;   
            
            // Measure contiguous match length
            let k = 0;
            while (i + k < oldHashes.length && j + k < newHashes.length && oldHashes[i + k] === newHashes[j + k]) {
              k++;
            }

            if (k > bestMatch.length) {
              bestMatch = { oldStart: i, newStart: j, length: k };
            }
          }
        }
        // If we found a substantial block, we don't need to keep searching every single old line
        if (bestMatch.length >= MIN_STABLE_BLOCK) break; 
      }

      if (bestMatch.length >= MIN_STABLE_BLOCK) {
        stableBlocks.push(bestMatch);
        oldIdx = bestMatch.oldStart + bestMatch.length;
        newIdx = bestMatch.newStart + bestMatch.length;
      } else {
        break; // No more large stable blocks
      }
    }

    // Sort blocks by oldStart to ensure monotonic progression
    stableBlocks.sort((a, b) => a.oldStart - b.oldStart);

    // Resolve overlaps and non-monotonic jumps (which are moves, not stable partitions)
    const validStableBlocks: typeof stableBlocks = []; // stableBlocks: { oldStart: number; newStart: number; length: number }
    // let lastOldEnd = 0;
    // let lastNewEnd = 0;
    // for (const block of stableBlocks) {
    //   if (block.oldStart >= lastOldEnd && block.newStart >= lastNewEnd) {
    //     validStableBlocks.push(block);
    //     lastOldEnd = block.oldStart + block.length;
    //     lastNewEnd = block.newStart + block.length;
    //   }
    //   else if(block.oldStart < lastOldEnd && block.newStart < lastNewEnd){
    //   }
    // }

    // Merge Intervals -> Leetcode 56
    if (stableBlocks.length > 0) {
      let currentBlock = { ...stableBlocks[0] };
      
      for (let i = 1; i < stableBlocks.length; i++) {
        const nextBlock = stableBlocks[i];
        
        const currentOldEnd = currentBlock.oldStart + currentBlock.length;
        const currentNewEnd = currentBlock.newStart + currentBlock.length;
        
        // Check if the intervals overlap or touch on both old and new streams
        if (nextBlock.oldStart <= currentOldEnd && nextBlock.newStart <= currentNewEnd) {
          // Merge by extending the end to the maximum of both blocks
          const maxOldEnd = Math.max(currentOldEnd, nextBlock.oldStart + nextBlock.length);
          currentBlock.length = maxOldEnd - currentBlock.oldStart;
        } else {
          // No overlap, push the current merged block and start tracking the next one
          validStableBlocks.push(currentBlock);
          currentBlock = { ...nextBlock };
        }
      }
      // Push the final block
      validStableBlocks.push(currentBlock);
    }

{/*Ignore this shit
   
    // Boundary Expansion: Filter out stable blocks that are too small. 
    // const expandedStableBlocks = validStableBlocks.filter(block => block.length >= MERGE_THRESHOLD);
    // Eventually we have to remove this because we changed the approach.  

*/}
    // Convert blocks into Regions
    const regions: DiffRegion[] = [];
    let curOld = 0;
    let curNew = 0;
    let regionCount = 0;

    for (const block of validStableBlocks) {
      // Changed region before the stable block
      if (curOld < block.oldStart || curNew < block.newStart) {
        regions.push({
          id: `region-${regionCount++}`,
          type: 'changed',
          oldStart: curOld, oldEnd: block.oldStart,
          newStart: curNew, newEnd: block.newStart
        });
      }
      
      // The stable block itself
      regions.push({
        id: `region-${regionCount++}`,
        type: 'stable',
        oldStart: block.oldStart, oldEnd: block.oldStart + block.length,
        newStart: block.newStart, newEnd: block.newStart + block.length
      });

      curOld = block.oldStart + block.length;
      curNew = block.newStart + block.length;
    }

    // Final changed region at the end
    if (curOld < oldHashes.length || curNew < newHashes.length) {
      regions.push({
        id: `region-${regionCount++}`,
        type: 'changed',
        oldStart: curOld, oldEnd: oldHashes.length,
        newStart: curNew, newEnd: newHashes.length
      });
    }
{/*
    // If no regions were formed, the whole file is one changed region
    if (regions.length === 0) {
      regions.push({
        id: 'region-0',
        type: 'changed',
        oldStart: 0, oldEnd: oldHashes.length,
        newStart: 0, newEnd: newHashes.length
      });
    }  */}

    ctx.regions = regions;
  }
}
