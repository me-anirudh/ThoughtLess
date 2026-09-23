import { IPipelineStage, IDiffContext, PatchAST, PatchHunk, PatchLine, EditOperation } from '../types';
{/** WHAT IT DOES
  
  1. Truncating Massive Unchanged Blocks
Imagine you have a file with 10,000 lines and you only change line 5,000. The optimizedEditScript evaluates the entire file. It would look like this:

equal: Lines 1 to 4,999
replace: Line 5,000
equal: Lines 5,001 to 10,000
If your UI rendered this directly, the user would have to scroll through 4,999 unchanged lines just to see what they edited!

PatchASTBuilderStage fixes this by stripping out the massive equal blocks and keeping only the changes plus a few context lines (usually 3 lines above and 3 lines below the change).

2. Grouping Changes into "Hunks"
If you make a change on line 10 and another change on line 12, they are close enough to be grouped together. If you make a change on line 10 and another on line 5,000, they should be shown as completely separate blocks.

PatchASTBuilderStage handles this math:

It looks at the distance between changes.
It groups nearby changes into a single PatchHunk.
It splits distant changes into separate PatchHunks.

*/}
export class PatchASTBuilderStage implements IPipelineStage {
  readonly name = 'PatchASTBuilder';

  execute(ctx: IDiffContext): void {
    if (ctx.identical || ctx.optimizedEditScript.length === 0) {
      ctx.patchAST = null;
      return;
    }

    const contextLines = ctx.options.contextLines ?? 3;
    const hunks: PatchHunk[] = [];
    
   
    let currentHunk: PatchHunk | null = null;

    const pushCurrentHunk = () => {
      if (currentHunk && currentHunk.lines.length > 0) {
        hunks.push(currentHunk);
      }
      currentHunk = null;
    };

    for (let i = 0; i < ctx.optimizedEditScript.length; i++) {
      const op = ctx.optimizedEditScript[i];

      if (op.type === 'equal') {
        // If it's a huge equal block, it might split hunks
        if (op.oldLines.length > contextLines * 2) {
          if (currentHunk) {
            // Add trailing context to current hunk
            for (let j = 0; j < contextLines; j++) {
              currentHunk.lines.push({ type: 'equal', content: op.oldLines[j] });
              currentHunk.oldCount++;
              currentHunk.newCount++;
            }
            pushCurrentHunk();
          }

          // Peek ahead to see if there's another operation after this equal block
          // If so, we need leading context for the NEXT hunk
          if (i + 1 < ctx.optimizedEditScript.length) {
            currentHunk = {
              oldStart: op.oldEnd - contextLines + 1,
              oldCount: contextLines,
              newStart: op.newEnd - contextLines + 1,
              newCount: contextLines,
              lines: []
            };
            for (let j = op.oldLines.length - contextLines; j < op.oldLines.length; j++) {
              currentHunk.lines.push({ type: 'equal', content: op.oldLines[j] });
            }
          }
        } else {
          // Small equal block, include entirely in current hunk (or start a new one)
          if (!currentHunk) {
            currentHunk = {
              oldStart: op.oldStart + 1,
              oldCount: 0,
              newStart: op.newStart + 1,
              newCount: 0,
              lines: []
            };
          }
          for (const line of op.oldLines) {
            currentHunk.lines.push({ type: 'equal', content: line });
            currentHunk.oldCount++;
            currentHunk.newCount++;
          }
        }
      } else {
        // Insert, Delete, or Replace
        if (!currentHunk) {
          currentHunk = {
            oldStart: op.oldStart + 1, // 1-indexed
            oldCount: 0,
            newStart: op.newStart + 1,
            newCount: 0,
            lines: []
          };
        }

        if (op.type === 'delete' || op.type === 'replace') {
          for (const line of op.oldLines) {
            currentHunk.lines.push({ type: 'delete', content: line });
            currentHunk.oldCount++;
          }
        }
        if (op.type === 'insert' || op.type === 'replace') {
          for (const line of op.newLines) {
            currentHunk.lines.push({ type: 'insert', content: line });
            currentHunk.newCount++;
          }
        }
      }
    }

    pushCurrentHunk();

    ctx.patchAST = {
      oldFile: ctx.options.filePath || 'a',
      newFile: ctx.options.filePath || 'b',
      hunks
    };
  }
}
