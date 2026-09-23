import { IPipelineStage, IDiffContext, JsonPatch, JsonHunk, EditOpType } from '../types';

export class SerializersStage implements IPipelineStage {
  readonly name = 'Serializers';

  execute(ctx: IDiffContext): void {
    if (!ctx.patchAST) return;

    if (ctx.options.patchFormats.includes('unified')) {
      ctx.patches.unified = this.generateUnified(ctx);
    }

    if (ctx.options.patchFormats.includes('json')) {
      ctx.patches.json = this.generateJson(ctx);
    }
  }

  private generateUnified(ctx: IDiffContext): string {
    const ast = ctx.patchAST!;
    let out = `--- a/${ast.oldFile}\n+++ b/${ast.newFile}\n`;

    for (const hunk of ast.hunks) {
      out += `@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@\n`;
      for (const line of hunk.lines) {
        if (line.type === 'equal') out += ` ${line.content}\n`;
        else if (line.type === 'insert') out += `+${line.content}\n`;
        else if (line.type === 'delete') out += `-${line.content}\n`;
      }
    }

    return out;
  }

  private generateJson(ctx: IDiffContext): JsonPatch {
    const ast = ctx.patchAST!;
    
    // We map semantic PatchHunks back to a strict machine-readable format.
    const jsonHunks: JsonHunk[] = ast.hunks.map(hunk => {
      // Instead of an array of lines, JSON patch typically wants discrete operations.
      // We can rebuild discrete ops from the lines.
      let currentType: EditOpType | null = null;
      let currentLines: string[] = [];
      let oldOffset = hunk.oldStart;
      let newOffset = hunk.newStart;

      const ops: import('../types').JsonPatchOperation[] = [];

      const flush = () => {
        if (!currentType) return;
        
        let oldRange: [number, number] = [oldOffset, oldOffset];
        let newRange: [number, number] = [newOffset, newOffset];

        if (currentType === 'equal') {
          oldRange[1] += currentLines.length;
          newRange[1] += currentLines.length;
          oldOffset += currentLines.length;
          newOffset += currentLines.length;
        } else if (currentType === 'delete') {
          oldRange[1] += currentLines.length;
          oldOffset += currentLines.length;
        } else if (currentType === 'insert') {
          newRange[1] += currentLines.length;
          newOffset += currentLines.length;
        }

        ops.push({
          op: currentType,
          oldRange,
          newRange,
          content: currentType !== 'equal' ? currentLines : undefined
        });

        currentLines = [];
      };

      for (const line of hunk.lines) {
        if (line.type !== currentType) {
          flush();
          currentType = line.type === 'equal' ? 'equal' : line.type; // simple mapping
        }
        currentLines.push(line.content);
      }
      flush();

      return {
        oldStart: hunk.oldStart,
        oldCount: hunk.oldCount,
        newStart: hunk.newStart,
        newCount: hunk.newCount,
        operations: ops
      };
    });

    return {
      oldFile: ast.oldFile,
      newFile: ast.newFile,
      hunks: jsonHunks
    };
  }
}
