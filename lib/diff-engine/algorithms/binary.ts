import { 
  IDiffAlgorithm, 
  IDiffContext, 
  EditOperation,
  DiffRegion, 
  RegionFeatures, 
  CandidateAlgorithm,
  DiffTimeoutError
} from '../types';

export class BinaryDiff implements IDiffAlgorithm {
  readonly name = 'binary';
  readonly supportsBinary = true;

  estimateCost(features: RegionFeatures, region: DiffRegion): CandidateAlgorithm {
    let score = 0;
    const isBinary = true; // Selector will only call this if file is binary

    if (isBinary) {
      score = 1000;
    } else {
      score = -1000;
    }

    return {
      algorithm: this.name,
      executionCost: 1, // Extremely fast byte comparison
      expectedQuality: 100, // Perfect for binary
      totalScore: score,
      reason: 'Simple whole-file replace for binary files.'
    };
  }

  execute(ctx: IDiffContext, region: DiffRegion): EditOperation[] {
    const oldBuf = typeof ctx.input.oldContent === 'string' 
      ? new TextEncoder().encode(ctx.input.oldContent) 
      : new Uint8Array(ctx.input.oldContent as ArrayBuffer);
      
    const newBuf = typeof ctx.input.newContent === 'string' 
      ? new TextEncoder().encode(ctx.input.newContent) 
      : new Uint8Array(ctx.input.newContent as ArrayBuffer);

    let identical = oldBuf.length === newBuf.length;

    if (identical) {
      for (let i = 0; i < oldBuf.length; i++) {
        if (ctx.checkDeadline(i, 10000)) {
          throw new DiffTimeoutError(this.name, i);
        }
        if (oldBuf[i] !== newBuf[i]) {
          identical = false;
          break;
        }
      }
    }

    if (identical) {
      return [{
        type: 'equal',
        oldStart: 0,
        oldEnd: 1,
        newStart: 0,
        newEnd: 1,
        oldLines: ['(binary identical)'],
        newLines: ['(binary identical)']
      }];
    }

    return [{
      type: 'replace',
      oldStart: 0,
      oldEnd: 1,
      newStart: 0,
      newEnd: 1,
      oldLines: ['(binary content deleted)'],
      newLines: ['(binary content inserted)']
    }];
  }
}
