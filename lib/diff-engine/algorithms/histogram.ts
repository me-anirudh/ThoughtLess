import {
  IDiffAlgorithm,
  IDiffContext,
  EditOperation,
  DiffRegion,
  RegionFeatures,
  CandidateAlgorithm,
  DiffTimeoutError
} from '../types';

/**
 * Histogram Diff Algorithm (modelled on JGit's implementation).
 *
 * Strategy:
 *   1. Build an occurrence-count histogram for lines in the old region.
 *   2. Scan the new region for the line with the LOWEST occurrence count
 *      in old (the "most unique" common line).
 *   3. Use that line as a split point.
 *   4. Recursively diff the regions before and after the split.
 */
export class HistogramDiff implements IDiffAlgorithm {
  readonly name = 'histogram';
  readonly supportsBinary = false;

  estimateCost(features: RegionFeatures, region: DiffRegion): CandidateAlgorithm {
    let score = 0;
    
    // Histogram is O(N) expected time because it splits on unique lines.
    const n = region.oldEnd - region.oldStart;
    const m = region.newEnd - region.newStart;
    const size = Math.max(n, m);
    
    // Low execution cost
    const executionCost = size * 0.005; 
    
    // High quality if there are many duplicate lines (low entropy/high collision), 
    // otherwise just average quality.
    const expectedQuality = features.hashCollisionDensity > 0.4 ? 90 : 70;
    
    score = 100 - executionCost + expectedQuality;

    return {
      algorithm: this.name,
      executionCost,
      expectedQuality,
      totalScore: score,
      reason: 'Splits on unique lines. Excellent for files with boilerplate/repeated structures.'
    };
  }

  execute(ctx: IDiffContext, region: DiffRegion): EditOperation[] {
    if (!ctx.normalizedOld || !ctx.normalizedNew) {
      throw new Error('HistogramDiff requires normalized files.');
    }

    const oldHashes = ctx.normalizedOld.lineHashes;
    const newHashes = ctx.normalizedNew.lineHashes;
    const oldLines = ctx.normalizedOld.lines;
    const newLines = ctx.normalizedNew.lines;

    const operations: EditOperation[] = [];
    const iter = { value: 0 }; 

    this.diffRegion(
      oldHashes, newHashes, oldLines, newLines,
      region.oldStart, region.oldEnd, region.newStart, region.newEnd,
      operations, ctx, iter
    );

    return operations;
  }

  private diffRegion(
    oldHashes: Uint32Array, newHashes: Uint32Array,
    oldLines: string[], newLines: string[],
    oldStart: number, oldEnd: number,
    newStart: number, newEnd: number,
    operations: EditOperation[],
    ctx: IDiffContext,
    iter: { value: number }
  ): void {
    iter.value++;
    if (ctx.checkDeadline(iter.value, 500)) {
      throw new DiffTimeoutError(this.name, iter.value);
    }

    // --- Strip common prefix ---
    const origOldStart = oldStart;
    const origNewStart = newStart;
    while (oldStart < oldEnd && newStart < newEnd && oldHashes[oldStart] === newHashes[newStart]) {
      oldStart++;
      newStart++;
    }
    if (oldStart > origOldStart) {
      operations.push({
        type: 'equal',
        oldStart: origOldStart, oldEnd: oldStart,
        newStart: origNewStart, newEnd: newStart,
        oldLines: oldLines.slice(origOldStart, oldStart),
        newLines: newLines.slice(origNewStart, newStart)
      });
    }

    // --- Strip common suffix ---
    const origOldEnd = oldEnd;
    const origNewEnd = newEnd;
    while (oldStart < oldEnd && newStart < newEnd && oldHashes[oldEnd - 1] === newHashes[newEnd - 1]) {
      oldEnd--;
      newEnd--;
    }

    // --- Base cases ---
    if (oldStart === oldEnd && newStart === newEnd) {
      // Nothing in the middle
    } else if (oldStart === oldEnd) {
      operations.push({
        type: 'insert',
        oldStart, oldEnd,
        newStart, newEnd,
        oldLines: [],
        newLines: newLines.slice(newStart, newEnd)
      });
    } else if (newStart === newEnd) {
      operations.push({
        type: 'delete',
        oldStart, oldEnd,
        newStart, newEnd,
        oldLines: oldLines.slice(oldStart, oldEnd),
        newLines: []
      });
    } else {
      // --- Build histogram of old region ---
      const histogram = new Map<number, number>();
      for (let i = oldStart; i < oldEnd; i++) {
        const h = oldHashes[i];
        histogram.set(h, (histogram.get(h) || 0) + 1);
      }

      // --- Find lowest-count line in new that exists in old ---
      let bestHash = -1;
      let bestCount = Infinity;
      let bestNewIdx = -1;

      for (let j = newStart; j < newEnd; j++) {
        const h = newHashes[j];
        const count = histogram.get(h);
        if (count !== undefined && count < bestCount) {
          bestCount = count;
          bestHash = h;
          bestNewIdx = j;
          if (bestCount === 1) break; // Can't do better than unique
        }
      }

      if (bestHash === -1) {
        // No common line
        operations.push({
          type: 'delete',
          oldStart, oldEnd,
          newStart, newEnd: newStart,
          oldLines: oldLines.slice(oldStart, oldEnd),
          newLines: []
        });
        operations.push({
          type: 'insert',
          oldStart: oldEnd, oldEnd,
          newStart, newEnd,
          oldLines: [],
          newLines: newLines.slice(newStart, newEnd)
        });
      } else {
        // Find first matching position in old
        let bestOldIdx = oldStart;
        while (bestOldIdx < oldEnd && oldHashes[bestOldIdx] !== bestHash) {
          bestOldIdx++;
        }

        // Recurse BEFORE
        this.diffRegion(
          oldHashes, newHashes, oldLines, newLines,
          oldStart, bestOldIdx, newStart, bestNewIdx,
          operations, ctx, iter
        );

        operations.push({
          type: 'equal',
          oldStart: bestOldIdx, oldEnd: bestOldIdx + 1,
          newStart: bestNewIdx, newEnd: bestNewIdx + 1,
          oldLines: [oldLines[bestOldIdx]],
          newLines: [newLines[bestNewIdx]]
        });

        // Recurse AFTER
        this.diffRegion(
          oldHashes, newHashes, oldLines, newLines,
          bestOldIdx + 1, oldEnd, bestNewIdx + 1, newEnd,
          operations, ctx, iter
        );
      }
    }

    // --- Emit deferred suffix ---
    if (origOldEnd > oldEnd) {
      operations.push({
        type: 'equal',
        oldStart: oldEnd, oldEnd: origOldEnd,
        newStart: newEnd, newEnd: origNewEnd,
        oldLines: oldLines.slice(oldEnd, origOldEnd),
        newLines: newLines.slice(newEnd, origNewEnd)
      });
    }
  }
}
