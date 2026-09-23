import { IPipelineStage, IDiffContext, FileTooLargeError } from '../types';

export class ValidatorStage implements IPipelineStage {
  readonly name = 'Validator';

  execute(ctx: IDiffContext): void {
    const { oldContent, newContent } = ctx.input;

    if (oldContent === null || oldContent === undefined) {
      throw new Error("oldContent is missing.");
    }
    if (newContent === null || newContent === undefined) {
      throw new Error("newContent is missing.");
    }

    const extract = (c: any) => (c && typeof c === 'object' && 'content' in c) ? c.content : c;
    const oldC = extract(oldContent);
    const newC = extract(newContent);

    if (typeof oldC !== typeof newC) {
      throw new Error("oldContent and newContent must be of the same type (both string or both ArrayBuffer).");
    }

    
    const oldSize = typeof oldC === 'string' ? new Blob([oldC]).size : oldC.byteLength;
    const newSize = typeof newC === 'string' ? new Blob([newC]).size : newC.byteLength;
    const maxSize = ctx.options.maxFileSizeBytes;

    if (oldSize > maxSize) {
      throw new FileTooLargeError(oldSize, maxSize);
    }
    if (newSize > maxSize) {
      throw new FileTooLargeError(newSize, maxSize);
    }

    // Identical checks
    if (typeof oldC === 'string' && typeof newC === 'string') {
      if (oldC === newC) {
        ctx.identical = true;
      }
    } else {
      const oldBuf = new Uint8Array(oldC as ArrayBuffer);
      const newBuf = new Uint8Array(newC as ArrayBuffer);
      if (oldBuf.length === newBuf.length) {
        let same = true;
        for (let i = 0; i < oldBuf.length; i++) {
          if (oldBuf[i] !== newBuf[i]) {
            same = false;
            break;
          }
        }
        ctx.identical = same;
      }
    }
    
    // Binary check: scan first 8192 bytes/chars for null byte.
    // Strings CAN contain \0, so we check them too (Bug #6 fix).
    ctx.binary = false;
    const checkBinary = (content: string | ArrayBuffer): boolean => {
      if (typeof content === 'string') {
        const limit = Math.min(content.length, 8192);
        for (let i = 0; i < limit; i++) {
          if (content.charCodeAt(i) === 0) return true;
        }
        return false; 
      }
      const buf = new Uint8Array(content);
      const limit = Math.min(buf.length, 8192);
      for (let i = 0; i < limit; i++) {
        if (buf[i] === 0) return true;
      }
      return false;
    };

    if (checkBinary(oldC) || checkBinary(newC)) {
      ctx.binary = true;
    }
  }
}
