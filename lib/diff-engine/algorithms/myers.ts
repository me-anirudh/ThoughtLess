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
 * Myers (1986) shortest-edit-script diff algorithm.
 * 
 * V3 Regional Execution:
 * Operates strictly within the bounds defined by `DiffRegion`.
 * 
 * Time: O(N·D) where N = max(old, new) length, D = edit distance
 * Space: O(N·D) for trace storage (V snapshots per D)
 */
export class MyersDiff implements IDiffAlgorithm {
  readonly name = 'myers';
  readonly supportsBinary = false;

  estimateCost(features: RegionFeatures, region: DiffRegion): CandidateAlgorithm {
    let score = 0;
    
    // O(N*D) cost estimation. If it's a huge region and expected edit distance is high, it's very expensive.
    const n = region.oldEnd - region.oldStart;
    const m = region.newEnd - region.newStart;
    const size = Math.max(n, m);
    
    // Rough theoretical execution cost in arbitrary units
    const executionCost = size * (features.expectedEditDistance || 1) * 0.01;
    
    // Myers produces high quality (minimal) scripts, but struggles visually with repeats
    const expectedQuality = features.hashCollisionDensity > 0.4 ? 50 : 95;
    
    // Simple composite score (higher is better for CandidateAlgorithm)
    // In a real ML model, this would be w1 * Cost + w2 * Quality
    score = 100 - executionCost + expectedQuality;

    return {
      algorithm: this.name,
      executionCost,
      expectedQuality,
      totalScore: score,
      reason: 'General purpose O(ND) shortest-edit-script algorithm.'
    };
  }

  execute(ctx: IDiffContext, region: DiffRegion): EditOperation[] {
    if (!ctx.normalizedOld || !ctx.normalizedNew) {
      throw new Error('MyersDiff requires normalized files.');
    }

    const oldHashes = ctx.normalizedOld.lineHashes;
    const newHashes = ctx.normalizedNew.lineHashes;
    const oldLines = ctx.normalizedOld.lines;
    const newLines = ctx.normalizedNew.lines;

    const n = region.oldEnd - region.oldStart;
    const m = region.newEnd - region.newStart;
    const oldOffset = region.oldStart;
    const newOffset = region.newStart;

    // Edge cases
    if (n === 0 && m === 0) return [];
    if (n === 0) {
      return [{
        type: 'insert', oldStart: oldOffset, oldEnd: oldOffset, newStart: newOffset, newEnd: newOffset + m,
        oldLines: [], newLines: newLines.slice(newOffset, newOffset + m)
      }];
    }
    if (m === 0) {
      return [{
        type: 'delete', oldStart: oldOffset, oldEnd: oldOffset + n, newStart: newOffset, newEnd: newOffset,
        oldLines: oldLines.slice(oldOffset, oldOffset + n), newLines: []
      }];
    }

    const maxD = n + m;
    const vOffset = maxD; // shift so k ranges map into non-negative indices
    const vSize = 2 * maxD + 1;

    const v = new Int32Array(vSize);
    // trace[d] stores V BEFORE iteration d modifies it (= V after iteration d-1)
    const trace: Int32Array[] = [];

    v[vOffset + 1] = 0;

    let foundD = -1;

    outer:
    for (let d = 0; d <= maxD; d++) {
      if (ctx.checkDeadline(d, 10)) {
        throw new DiffTimeoutError(this.name, d);
      }

      // Snapshot V BEFORE this iteration modifies it
      trace.push(new Int32Array(v));

      for (let k = -d; k <= d; k += 2) {
        let x: number;

        // Choose direction: down (insert) or right (delete)
        if (k === -d || (k !== d && v[vOffset + k - 1] < v[vOffset + k + 1])) {
          x = v[vOffset + k + 1]; // insert
        } else {
          x = v[vOffset + k - 1] + 1; // delete
        }

        let y = x - k;

        // Extend snake diagonally while lines match (respecting region bounds)
        while (x < n && y < m && oldHashes[oldOffset + x] === newHashes[newOffset + y]) {
          x++;
          y++;
        }

        v[vOffset + k] = x;

        if (x >= n && y >= m) {
          foundD = d;
          break outer;
        }
      }
    }

    if (foundD === -1) return []; // Should not happen with correct Myers

    // Backtracking
    const operations: EditOperation[] = [];
    let x = n;
    let y = m;

    for (let d = foundD; d > 0; d--) {
      const vPrev = trace[d];
      const k = x - y;

      let prevK: number;
      if (k === -d || (k !== d && vPrev[vOffset + k - 1] < vPrev[vOffset + k + 1])) {
        prevK = k + 1; 
      } else {
        prevK = k - 1;
      }

      const prevX = vPrev[vOffset + prevK];
      const prevY = prevX - prevK;

      const midX = prevK < k ? prevX + 1 : prevX;
      const midY = prevK > k ? prevY + 1 : prevY;

      if (x > midX) {
        operations.push({
          type: 'equal',
          oldStart: oldOffset + midX, oldEnd: oldOffset + x,
          newStart: newOffset + midY, newEnd: newOffset + y,
          oldLines: oldLines.slice(oldOffset + midX, oldOffset + x),
          newLines: newLines.slice(newOffset + midY, newOffset + y)
        });
      }

      if (prevK > k) {
        operations.push({
          type: 'insert',
          oldStart: oldOffset + prevX, oldEnd: oldOffset + prevX,
          newStart: newOffset + prevY, newEnd: newOffset + prevY + 1,
          oldLines: [],
          newLines: [newLines[newOffset + prevY]]
        });
      } else {
        operations.push({
          type: 'delete',
          oldStart: oldOffset + prevX, oldEnd: oldOffset + prevX + 1,
          newStart: newOffset + prevY, newEnd: newOffset + prevY,
          oldLines: [oldLines[oldOffset + prevX]],
          newLines: []
        });
      }

      x = prevX;
      y = prevY;
    }

    if (x > 0) {
      operations.push({
        type: 'equal',
        oldStart: oldOffset, oldEnd: oldOffset + x,
        newStart: newOffset, newEnd: newOffset + y,
        oldLines: oldLines.slice(oldOffset, oldOffset + x),
        newLines: newLines.slice(newOffset, newOffset + y)
      });
    }

    operations.reverse();
    return operations;
  }
}
