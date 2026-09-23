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
 * Patience Diff Algorithm.
 *
 * Strategy:
 *   1. Find lines that are unique in BOTH the old and new files.
 *   2. Match common unique lines by hash.
 *   3. Compute the Longest Increasing Subsequence (LIS) of their
 *      positions using O(n log n) patience sorting with binary search.
 *   4. Use LIS elements as anchors.
 *   5. Between anchors, fall back to a simple prefix/suffix diff.
 */
export class PatienceDiff implements IDiffAlgorithm {
  readonly name = 'patience';
  readonly supportsBinary = false;

  estimateCost(features: RegionFeatures, region: DiffRegion): CandidateAlgorithm {
    let score = 0;
    
    // Patience is O(N log N) dominated by LIS
    const n = region.oldEnd - region.oldStart;
    const m = region.newEnd - region.newStart;
    const size = Math.max(n, m);
    
    // Execution cost is moderate
    const executionCost = size * Math.log2(size || 1) * 0.01;
    
    // Expected quality is directly proportional to Anchor Density
    const expectedQuality = 20 + (features.anchorDensity * 80);
    
    score = 100 - executionCost + expectedQuality;

    return {
      algorithm: this.name,
      executionCost,
      expectedQuality,
      totalScore: score,
      reason: 'Anchors on unique lines. Best for refactored code (high anchor density).'
    };
  }

  execute(ctx: IDiffContext, region: DiffRegion): EditOperation[] {
    if (!ctx.normalizedOld || !ctx.normalizedNew) {
      throw new Error('PatienceDiff requires normalized files.');
    }

    const oldHashes = ctx.normalizedOld.lineHashes;
    const newHashes = ctx.normalizedNew.lineHashes;
    const oldLines = ctx.normalizedOld.lines;
    const newLines = ctx.normalizedNew.lines;
    
    const oldStart = region.oldStart;
    const oldEnd = region.oldEnd;
    const newStart = region.newStart;
    const newEnd = region.newEnd;

    const n = oldEnd - oldStart;
    const m = newEnd - newStart;

    // Edge cases
    if (n === 0 && m === 0) return [];
    if (n === 0) {
      return [{
        type: 'insert', oldStart, oldEnd, newStart, newEnd,
        oldLines: [], newLines: newLines.slice(newStart, newEnd)
      }];
    }
    if (m === 0) {
      return [{
        type: 'delete', oldStart, oldEnd, newStart, newEnd,
        oldLines: oldLines.slice(oldStart, oldEnd), newLines: []
      }];
    }

    if (ctx.checkDeadline(0, 1)) {
      throw new DiffTimeoutError(this.name, 0);
    }

    // ------------------------------------------------------------------
    // Step 1: Find lines unique in old
    // ------------------------------------------------------------------
    const oldCounts = new Map<number, number>();
    const oldFirstPos = new Map<number, number>(); 
    for (let i = oldStart; i < oldEnd; i++) {
      const h = oldHashes[i];
      const c = (oldCounts.get(h) || 0) + 1;
      oldCounts.set(h, c);
      if (c === 1) oldFirstPos.set(h, i);
    }

    // ------------------------------------------------------------------
    // Step 2: Find lines unique in new
    // ------------------------------------------------------------------
    const newCounts = new Map<number, number>();
    const newFirstPos = new Map<number, number>();
    for (let j = newStart; j < newEnd; j++) {
      const h = newHashes[j];
      const c = (newCounts.get(h) || 0) + 1;
      newCounts.set(h, c);
      if (c === 1) newFirstPos.set(h, j);
    }

    // ------------------------------------------------------------------
    // Step 3: Find common unique lines
    // ------------------------------------------------------------------
    const commonUnique: { oldIdx: number; newIdx: number }[] = [];
    for (const [hash, count] of newCounts) {
      if (count === 1 && oldCounts.get(hash) === 1) {
        commonUnique.push({
          oldIdx: oldFirstPos.get(hash)!,
          newIdx: newFirstPos.get(hash)!
        });
      }
    }
    commonUnique.sort((a, b) => a.newIdx - b.newIdx);

    // ------------------------------------------------------------------
    // Step 4: LIS of oldIdx values
    // ------------------------------------------------------------------
    const oldIndices = commonUnique.map(c => c.oldIdx);
    const lisIndices = this.longestIncreasingSubsequence(oldIndices);
    const anchors = lisIndices.map(i => commonUnique[i]);

    if (ctx.checkDeadline(1, 1)) {
      throw new DiffTimeoutError(this.name, 1);
    }

    // ------------------------------------------------------------------
    // Step 5: Diff between anchors using prefix/suffix stripping
    // ------------------------------------------------------------------
    const operations: EditOperation[] = [];
    let prevOldEnd = oldStart;
    let prevNewEnd = newStart;

    for (const anchor of anchors) {
      this.diffSubRegion(
        oldHashes, newHashes, oldLines, newLines,
        prevOldEnd, anchor.oldIdx, prevNewEnd, anchor.newIdx,
        operations
      );

      operations.push({
        type: 'equal',
        oldStart: anchor.oldIdx, oldEnd: anchor.oldIdx + 1,
        newStart: anchor.newIdx, newEnd: anchor.newIdx + 1,
        oldLines: [oldLines[anchor.oldIdx]],
        newLines: [newLines[anchor.newIdx]]
      });

      prevOldEnd = anchor.oldIdx + 1;
      prevNewEnd = anchor.newIdx + 1;
    }

    this.diffSubRegion(
      oldHashes, newHashes, oldLines, newLines,
      prevOldEnd, oldEnd, prevNewEnd, newEnd,
      operations
    );

    return operations;
  }

  private longestIncreasingSubsequence(arr: number[]): number[] {
    if (arr.length === 0) return [];

    const tails: number[] = [];
    const tailIndices: number[] = [];
    const prev: number[] = new Array(arr.length).fill(-1);

    for (let i = 0; i < arr.length; i++) {
      const val = arr[i];

      let lo = 0;
      let hi = tails.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (tails[mid] < val) lo = mid + 1;
        else hi = mid;
      }

      tails[lo] = val;
      tailIndices[lo] = i;
      prev[i] = lo > 0 ? tailIndices[lo - 1] : -1;
    }

    const result: number[] = [];
    let idx = tailIndices[tails.length - 1];
    while (idx !== -1) {
      result.push(idx);
      idx = prev[idx];
    }
    result.reverse();
    return result;
  }

  private diffSubRegion(
    oldHashes: Uint32Array, newHashes: Uint32Array,
    oldLines: string[], newLines: string[],
    oldStart: number, oldEnd: number,
    newStart: number, newEnd: number,
    operations: EditOperation[]
  ): void {
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

    const origOldEnd = oldEnd;
    const origNewEnd = newEnd;

    while (oldStart < oldEnd && newStart < newEnd && oldHashes[oldEnd - 1] === newHashes[newEnd - 1]) {
      oldEnd--;
      newEnd--;
    }

    if (oldStart === oldEnd && newStart === newEnd) {
      // Nothing
    } else if (oldStart === oldEnd) {
      operations.push({
        type: 'insert', oldStart, oldEnd, newStart, newEnd,
        oldLines: [], newLines: newLines.slice(newStart, newEnd)
      });
    } else if (newStart === newEnd) {
      operations.push({
        type: 'delete', oldStart, oldEnd, newStart, newEnd,
        oldLines: oldLines.slice(oldStart, oldEnd), newLines: []
      });
    } else {
      operations.push({
        type: 'replace', oldStart, oldEnd, newStart, newEnd,
        oldLines: oldLines.slice(oldStart, oldEnd),
        newLines: newLines.slice(newStart, newEnd)
      });
    }

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
