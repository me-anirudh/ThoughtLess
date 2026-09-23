import { IPipelineStage, IDiffContext, MoveAnchor, DiffRegion } from '../types';

export class MovementEstimatorStage implements IPipelineStage {
  readonly name = 'MovementEstimator';

  execute(ctx: IDiffContext): void {
    if (ctx.identical || ctx.binary || ctx.options.detectMoves === false) {
      ctx.moveAnchors = [];
      return;
    }

    const MIN_MOVE_LINES = 3;
    //Got all the line hashes of old Code

    const oldHashes = ctx.normalizedOld!.lineHashes; //Trust me Bro, this aint undefined

    //Got all the line hashes of new Code
    const newHashes = ctx.normalizedNew!.lineHashes;

    // We only look for moves within 'changed' regions.
    // The stable regions are already anchored.
    const changedRegions = ctx.regions.filter(r => r.type === 'changed');

    // Collect all candidate deleted blocks and inserted blocks
    const deletedBlocks: { hash: string; lines: number[]; region: DiffRegion }[] = [];
    const insertedBlocks: { hash: string; lines: number[]; region: DiffRegion }[] = [];

    // Simple sliding window fingerprinting
    // What is Rolling Hash and why didnt we use it here. -> See Obisidian for that. (TLDR -> It was Overkill for 3 sized sliding window)


    const hashLines = (hashes: Uint32Array, start: number, length: number): string => {
      let h = 0x811c9dc5;
      for (let i = 0; i < length; i++) {
        h ^= hashes[start + i];
        h = (h * 0x01000193) | 0;
        h ^= 0x0A; // delimiter
        h = (h * 0x01000193) | 0;
      }
      return (h >>> 0).toString(16);
    };

    // To keep it simple and fast, we just look for exact identical blocks of length MIN_MOVE_LINES
    // If a block is moved AND modified, that's a much harder problem (handled by fuzzy matching later if needed).
    // For early anchors, we want exact matches.

    for (const region of changedRegions) {
      const oldLen = region.oldEnd - region.oldStart;
      const newLen = region.newEnd - region.newStart;

      // Collect all windows in old region
      if (oldLen >= MIN_MOVE_LINES) {
        for (let i = region.oldStart; i <= region.oldEnd - MIN_MOVE_LINES; i++) {
          deletedBlocks.push({
            hash: hashLines(oldHashes, i, MIN_MOVE_LINES),
            lines: [i, i + MIN_MOVE_LINES],
            region
          });
        }
      }

      // Collect all windows in new region
      if (newLen >= MIN_MOVE_LINES) {
        for (let i = region.newStart; i <= region.newEnd - MIN_MOVE_LINES; i++) {
          insertedBlocks.push({
            hash: hashLines(newHashes, i, MIN_MOVE_LINES),
            lines: [i, i + MIN_MOVE_LINES],
            region
          });
        }
      }
    }

    // Match them and mark them
    const insertBuckets = new Map<string, typeof insertedBlocks[0][]>();
    for (const b of insertedBlocks) {
      if (!insertBuckets.has(b.hash)) insertBuckets.set(b.hash, []);
      insertBuckets.get(b.hash)!.push(b);
    }

    const anchors: MoveAnchor[] = [];
    const matchedInserted = new Set<string>(); // avoid double matching the same target block

    // Find longest contiguous matches by growing the seeds
    for (let i = 0; i < deletedBlocks.length; i++) {
      const del = deletedBlocks[i];
      const matches = insertBuckets.get(del.hash);
      
      if (matches && matches.length > 0) {
        for (const ins of matches) {
          const matchKey = `${ins.lines[0]}-${ins.lines[1]}`;
          if (matchedInserted.has(matchKey)) continue;

          // We found a seed match of MIN_MOVE_LINES. Now try to grow it forwards
          let length = MIN_MOVE_LINES;
          while (
            del.lines[0] + length < del.region.oldEnd &&
            ins.lines[0] + length < ins.region.newEnd &&
            oldHashes[del.lines[0] + length] === newHashes[ins.lines[0] + length]
          ) {
            length++;
          }

          anchors.push({
            oldStart: del.lines[0],
            oldEnd: del.lines[0] + length,
            newStart: ins.lines[0],
            newEnd: ins.lines[0] + length,
            fingerprint: del.hash, // seed hash
            similarityScore: 1.0 //A cool AI name i heard from my friend 
          });

          // Mark all overlapping inserted blocks as consumed to prevent overlapping moves
          for (let k = 0; k < length; k++) {
            matchedInserted.add(`${ins.lines[0] + k}-${ins.lines[0] + k + MIN_MOVE_LINES}`);
          }
          
          // Skip ahead in our deletion scan by `length` so we don't re-match sub-blocks
          i += length - 1; 
          break; // move on to next deleted block
        }
      }
    }

    ctx.moveAnchors = anchors;
  }
}
