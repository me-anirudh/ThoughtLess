import { IPipelineStage, IDiffContext, CharacterChange, InlineChange, DiffTimeoutError, EditOperation } from '../types';

/**
 * Character-Level Refinement — Stage 8.
 *
 * For each 'replace' operation in the optimized edit script, computes
 * character-level inline diffs showing exactly which characters were
 * inserted, deleted, or kept equal.
 *
 * Uses a full character-level Myers diff (not just prefix/suffix stripping)
 * to produce precise inline changes even when the middle of a line changes
 * in a complex way.
 *
 * Cooperative timeout via ctx.checkDeadline().
 */
export class CharacterRefinerStage implements IPipelineStage {
  readonly name = 'CharacterRefiner';

  execute(ctx: IDiffContext): void {
    if (ctx.identical || ctx.options.characterLevel === false || ctx.optimizedEditScript.length === 0) {
      ctx.characterChanges = [];
      return;
    }

    const changes: CharacterChange[] = [];
    let iterCount = 0;

    for (let opIdx = 0; opIdx < ctx.optimizedEditScript.length; opIdx++) {
      const op = ctx.optimizedEditScript[opIdx];

      if (op.type === 'replace') {
        const lineCount = Math.min(op.oldLines.length, op.newLines.length);

        for (let i = 0; i < lineCount; i++) {
          const oldLine = op.oldLines[i];
          const newLine = op.newLines[i];

          iterCount++;
          if (ctx.checkDeadline(iterCount, 100)) {
            throw new DiffTimeoutError(this.name, iterCount);
          }

          const inlineChanges = this.computeInlineDiff(oldLine, newLine, ctx, iterCount);
          if (inlineChanges.length > 0) {
            changes.push({
              operationIndex: opIdx,
              lineIndex: i,
              oldLine,
              newLine,
              changes: inlineChanges
            });
          }
        }

        // Handle excess lines in an unbalanced replace:
        // Lines only in old → character-level "delete entire line"
        for (let i = lineCount; i < op.oldLines.length; i++) {
          changes.push({
            operationIndex: opIdx,
            lineIndex: i,
            oldLine: op.oldLines[i],
            newLine: '',
            changes: [{
              type: 'delete',
              value: op.oldLines[i],
              oldStart: 0,
              oldEnd: op.oldLines[i].length,
              newStart: 0,
              newEnd: 0,
            }]
          });
        }
        // Lines only in new → character-level "insert entire line"
        for (let i = lineCount; i < op.newLines.length; i++) {
          changes.push({
            operationIndex: opIdx,
            lineIndex: i,
            oldLine: '',
            newLine: op.newLines[i],
            changes: [{
              type: 'insert',
              value: op.newLines[i],
              oldStart: 0,
              oldEnd: 0,
              newStart: 0,
              newEnd: op.newLines[i].length,
            }]
          });
        }
      }
    }

    ctx.characterChanges = changes;
  }

  /**
   * Character-level Myers diff between two strings.
   *
   * Uses a simplified Myers on individual characters. Falls back to
   * prefix/suffix stripping for very long lines (> 500 chars in the
   * middle region) to avoid O(n·d) blowup on huge one-liners.
   */
  private computeInlineDiff(
    oldLine: string,
    newLine: string,
    ctx: IDiffContext,
    iterCount: number
  ): InlineChange[] {
    // --- Strip common prefix ---
    let prefixLen = 0;
    while (prefixLen < oldLine.length && prefixLen < newLine.length && oldLine[prefixLen] === newLine[prefixLen]) {
      prefixLen++;
    }

    // --- Strip common suffix ---
    let suffixLen = 0;
    while (
      suffixLen < oldLine.length - prefixLen &&
      suffixLen < newLine.length - prefixLen &&
      oldLine[oldLine.length - 1 - suffixLen] === newLine[newLine.length - 1 - suffixLen]
    ) {
      suffixLen++;
    }

    const oldMiddle = oldLine.substring(prefixLen, oldLine.length - suffixLen);
    const newMiddle = newLine.substring(prefixLen, newLine.length - suffixLen);

    // If there's no actual change in the middle, we're done
    if (oldMiddle.length === 0 && newMiddle.length === 0) {
      // Entirely equal line — nothing to report
      return [];
    }

    const changes: InlineChange[] = [];

    // Emit common prefix
    if (prefixLen > 0) {
      changes.push({
        type: 'equal',
        value: oldLine.substring(0, prefixLen),
        oldStart: 0, oldEnd: prefixLen,
        newStart: 0, newEnd: prefixLen,
      });
    }

    // For small middle regions, run a character-level Myers for precise diffs.
    // For large regions (> 500 chars each), fall back to simple delete+insert
    // to avoid O(n·d) blowup on huge one-liners.
    if (oldMiddle.length <= 500 && newMiddle.length <= 500 && oldMiddle.length + newMiddle.length > 0) {
      const middleChanges = this.charMyers(oldMiddle, newMiddle, prefixLen, ctx, iterCount);
      changes.push(...middleChanges);
    } else {
      // Fallback: simple delete + insert
      if (oldMiddle.length > 0) {
        changes.push({
          type: 'delete',
          value: oldMiddle,
          oldStart: prefixLen,
          oldEnd: prefixLen + oldMiddle.length,
          newStart: prefixLen,
          newEnd: prefixLen,
        });
      }
      if (newMiddle.length > 0) {
        changes.push({
          type: 'insert',
          value: newMiddle,
          oldStart: prefixLen + oldMiddle.length,
          oldEnd: prefixLen + oldMiddle.length,
          newStart: prefixLen,
          newEnd: prefixLen + newMiddle.length,
        });
      }
    }

    // Emit common suffix
    if (suffixLen > 0) {
      changes.push({
        type: 'equal',
        value: oldLine.substring(oldLine.length - suffixLen),
        oldStart: oldLine.length - suffixLen,
        oldEnd: oldLine.length,
        newStart: newLine.length - suffixLen,
        newEnd: newLine.length,
      });
    }

    return changes;
  }

  /**
   * Simplified character-level Myers diff on the "middle" (after prefix/suffix
   * stripping). Produces InlineChange[] with correct absolute positions.
   */
  private charMyers(
    oldStr: string,
    newStr: string,
    offset: number,
    ctx: IDiffContext,
    iterCount: number
  ): InlineChange[] {
    const n = oldStr.length;
    const m = newStr.length;

    if (n === 0) {
      return [{ type: 'insert', value: newStr, oldStart: offset, oldEnd: offset, newStart: offset, newEnd: offset + m }];
    }
    if (m === 0) {
      return [{ type: 'delete', value: oldStr, oldStart: offset, oldEnd: offset + n, newStart: offset, newEnd: offset }];
    }

    const maxD = n + m;
    const vOffset = maxD;
    const v = new Int32Array(2 * maxD + 1);
    const trace: Int32Array[] = [];

    v[vOffset + 1] = 0;

    let foundD = -1;

    outer:
    for (let d = 0; d <= maxD; d++) {
      // Budget check: character-level diffs shouldn't dominate
      if (d > 0 && d % 200 === 0 && ctx.checkDeadline(iterCount + d, 1)) {
        // Over budget — fall back to simple delete+insert
        return [
          { type: 'delete', value: oldStr, oldStart: offset, oldEnd: offset + n, newStart: offset, newEnd: offset },
          { type: 'insert', value: newStr, oldStart: offset + n, oldEnd: offset + n, newStart: offset, newEnd: offset + m },
        ];
      }

      trace.push(new Int32Array(v));

      for (let k = -d; k <= d; k += 2) {
        let x: number;
        if (k === -d || (k !== d && v[vOffset + k - 1] < v[vOffset + k + 1])) {
          x = v[vOffset + k + 1];
        } else {
          x = v[vOffset + k - 1] + 1;
        }
        let y = x - k;
        while (x < n && y < m && oldStr[x] === newStr[y]) { x++; y++; }
        v[vOffset + k] = x;
        if (x >= n && y >= m) { foundD = d; break outer; }
      }
    }

    if (foundD === -1) {
      return [
        { type: 'delete', value: oldStr, oldStart: offset, oldEnd: offset + n, newStart: offset, newEnd: offset },
        { type: 'insert', value: newStr, oldStart: offset + n, oldEnd: offset + n, newStart: offset, newEnd: offset + m },
      ];
    }

    // Backtrack to produce changes
    const ops: { type: 'insert' | 'delete' | 'equal'; oldIdx: number; newIdx: number; len: number }[] = [];
    let x = n, y = m;

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
        ops.push({ type: 'equal', oldIdx: midX, newIdx: midY, len: x - midX });
      }
      if (prevK > k) {
        ops.push({ type: 'insert', oldIdx: prevX, newIdx: prevY, len: 1 });
      } else {
        ops.push({ type: 'delete', oldIdx: prevX, newIdx: prevY, len: 1 });
      }
      x = prevX;
      y = prevY;
    }
    if (x > 0) {
      ops.push({ type: 'equal', oldIdx: 0, newIdx: 0, len: x });
    }
    ops.reverse();

    // Merge consecutive ops of same type and convert to InlineChange[]
    const merged: InlineChange[] = [];
    for (const op of ops) {
      if (op.type === 'equal') {
        const value = oldStr.substring(op.oldIdx, op.oldIdx + op.len);
        const last = merged.length > 0 ? merged[merged.length - 1] : null;
        if (last && last.type === 'equal' && last.oldEnd === offset + op.oldIdx) {
          last.value += value;
          last.oldEnd += op.len;
          last.newEnd += op.len;
        } else {
          merged.push({
            type: 'equal', value,
            oldStart: offset + op.oldIdx, oldEnd: offset + op.oldIdx + op.len,
            newStart: offset + op.newIdx, newEnd: offset + op.newIdx + op.len,
          });
        }
      } else if (op.type === 'delete') {
        const value = oldStr.substring(op.oldIdx, op.oldIdx + op.len);
        const last = merged.length > 0 ? merged[merged.length - 1] : null;
        if (last && last.type === 'delete' && last.oldEnd === offset + op.oldIdx) {
          last.value += value;
          last.oldEnd += op.len;
        } else {
          merged.push({
            type: 'delete', value,
            oldStart: offset + op.oldIdx, oldEnd: offset + op.oldIdx + op.len,
            newStart: offset + op.newIdx, newEnd: offset + op.newIdx,
          });
        }
      } else {
        const value = newStr.substring(op.newIdx, op.newIdx + op.len);
        const last = merged.length > 0 ? merged[merged.length - 1] : null;
        if (last && last.type === 'insert' && last.newEnd === offset + op.newIdx) {
          last.value += value;
          last.newEnd += op.len;
        } else {
          merged.push({
            type: 'insert', value,
            oldStart: offset + op.oldIdx, oldEnd: offset + op.oldIdx,
            newStart: offset + op.newIdx, newEnd: offset + op.newIdx + op.len,
          });
        }
      }
    }

    return merged;
  }
}
