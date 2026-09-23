import { IPipelineStage, IDiffContext, EditOperation } from '../types';

export class EditOptimizerStage implements IPipelineStage {
  readonly name = 'EditOptimizer';

  execute(ctx: IDiffContext): void {
    if (ctx.identical || ctx.rawEditScript.length === 0) {
      ctx.optimizedEditScript = [];
      return;
    }

    const raw = ctx.rawEditScript.slice(); // Defensive copy — never modify the main data, we'll just edit in a copy. 
    const optimized: EditOperation[] = [];
    
    // Sort just in case they came out of order (though algorithms should produce ordered)
    raw.sort((a, b) => a.oldStart - b.oldStart || a.newStart - b.newStart);

    let current = raw[0];

    for (let i = 1; i < raw.length; i++) {
      const next = raw[i];

      // If same type and contiguous, merge them and put them together
      if (current.type === next.type && current.oldEnd === next.oldStart && current.newEnd === next.newStart) {
        current = {
          type: current.type,
          oldStart: current.oldStart,
          oldEnd: next.oldEnd,
          newStart: current.newStart,
          newEnd: next.newEnd,
          oldLines: ctx.normalizedOld?.lines.slice(current.oldStart, next.oldEnd) || [],
          newLines: ctx.normalizedNew?.lines.slice(current.newStart, next.newEnd) || []
        };
      } else {
        optimized.push(current);
        current = next;
      }
    }
    optimized.push(current);

    // Second pass: collapse adjacent delete + insert into replace
    const finalOps: EditOperation[] = [];
    for (let i = 0; i < optimized.length; i++) {
      const op = optimized[i];
      if (op.type === 'delete' && i + 1 < optimized.length && optimized[i+1].type === 'insert') {
        const next = optimized[i+1];
        if (op.oldEnd === next.oldStart) {
          finalOps.push({
            type: 'replace',
            oldStart: op.oldStart,
            oldEnd: op.oldEnd,
            newStart: next.newStart,
            newEnd: next.newEnd,
            oldLines: op.oldLines,
            newLines: next.newLines
          });
          i++; // Skip the insert
          continue;
        }
      }
      // Or insert + delete
      if (op.type === 'insert' && i + 1 < optimized.length && optimized[i+1].type === 'delete') {
        const next = optimized[i+1];
        if (op.newEnd === next.newStart) {
          finalOps.push({
            type: 'replace',
            oldStart: next.oldStart,
            oldEnd: next.oldEnd,
            newStart: op.newStart,
            newEnd: op.newEnd,
            oldLines: next.oldLines,
            newLines: op.newLines
          });
          i++;
          continue;
        }
      }
      finalOps.push(op);
    }

    // Filter out zero-length operations
    ctx.optimizedEditScript = finalOps.filter(op => 
      op.oldEnd > op.oldStart || op.newEnd > op.newStart
    );
  }
}
