import { IPipelineStage, IDiffContext, DiffStatistics } from '../types';

/**
 * Output Builder — Stage 11.
 *
 * Assembles the final `DiffStatistics` from the optimized edit script,
 * character changes, move information, and patches.
 */
export class OutputBuilderStage implements IPipelineStage {
  readonly name = 'OutputBuilder';

  execute(ctx: IDiffContext): void {
    let addedLines = 0;
    let deletedLines = 0;
    let modifiedLines = 0;
    let unchangedLines = 0;

    for (const op of ctx.optimizedEditScript) {
      if (op.type === 'insert') {
        addedLines += op.newLines.length;
      } else if (op.type === 'delete') {
        deletedLines += op.oldLines.length;
      } else if (op.type === 'replace') {
        modifiedLines += Math.max(op.oldLines.length, op.newLines.length);
      } else if (op.type === 'equal') {
        unchangedLines += op.oldLines.length;
      }
    }

    let addedChars = 0;
    let deletedChars = 0;
    for (const charChange of ctx.characterChanges) {
      for (const ic of charChange.changes) {
        if (ic.type === 'insert') addedChars += ic.value.length;
        if (ic.type === 'delete') deletedChars += ic.value.length;
      }
    }

    const patchSize = ctx.patches.unified
      ? new Blob([ctx.patches.unified]).size
      : 0;

    const oldLineCount = ctx.oldFileFeatures?.lineCount
      ?? ctx.normalizedOld?.lines.length
      ?? 0;
    const newLineCount = ctx.newFileFeatures?.lineCount
      ?? ctx.normalizedNew?.lines.length
      ?? 0;

    const stats: DiffStatistics = {
      totalLines: Math.max(oldLineCount, newLineCount),
      addedLines,
      deletedLines,
      modifiedLines,
      unchangedLines,
      addedCharacters: addedChars,
      deletedCharacters: deletedChars,
      moveCount: ctx.moveAnchors.length,
      editCount: ctx.optimizedEditScript.filter(op => op.type !== 'equal').length,
      patchSizeBytes: patchSize,
    };
    ctx.statistics = stats;
  }
}
