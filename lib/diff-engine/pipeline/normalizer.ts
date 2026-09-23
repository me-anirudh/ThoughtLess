import { IPipelineStage, IDiffContext, NormalizedFile, FileSnapshot } from '../types';

/**
 * Normalization — Stage 2.
 *
 *
 * What the hell we are doing in this:
 * 
 * 
 *   1. Convert ArrayBuffer → string (UTF-8 TextDecoder) if needed
 *   2. Detect and remove UTF-8 BOM
 *   3. Detect original line ending style (CRLF, LF, or mixed) -> (\r, \n)
 *   4. Normalize all line endings to LF (\n) 
 *   5. Handle lone \\r (old Mac format)
 *   6. Optionally collapse whitespace
 *   7. Split into lines
 *   8. Compute FNV-1a 32-bit hashes into Uint32Array
 *
 * IMPORTANT: This stage runs even when `ctx.identical = true` so that
 * downstream stages (FeatureExtractor, OutputBuilder) can read line data
 * for metadata. The feature extractor needs `normalizedOld`/`normalizedNew`
 * to compute FileFeatures and ChangeFeatures which appear in the final
 * DiffResult metadata.
 */
export class NormalizerStage implements IPipelineStage {
  readonly name = 'Normalizer';

  execute(ctx: IDiffContext): void {
    // Skip only for binary files — they don't have line structure.
    // We DO normalize identical files so features and metadata can be computed.
    if (ctx.binary) return;

    ctx.normalizedOld = this.normalize(ctx.input.oldContent, ctx.options.normalizeWhitespace);
    ctx.normalizedNew = this.normalize(ctx.input.newContent, ctx.options.normalizeWhitespace);
  }
      //                                   import('../types').FileSnapshot (GTi) -> This is something which i can do and its a great idea of lazy loading. 
  private normalize(content: string | ArrayBuffer | FileSnapshot, normalizeWhitespace: boolean): NormalizedFile {
    let rawContent = typeof content === 'object' && content !== null && 'content' in content ? (content as any).content : content;
    let str = typeof rawContent === 'string' ? rawContent : new TextDecoder('utf-8').decode(rawContent); // THis is basically us telling the javascript that the data you are going to look is utf - 8.  

    // BOM detection and stripping - (Byte order mask) -> THis is a mask which some machines by default omits at the starting of a text file. 
    // So, that it doesn't hinder the changes and both looks identical, we can just go and remove all of them. 
    let hadBOM = false;
    if (str.charCodeAt(0) === 0xFEFF) {
      hadBOM = true;
      str = str.slice(1); // We have to do it because actually we cant modify a string once its created, 
      // basically it becomes IMMUTABLE after it becomes a string.  
    }

    // Line-ending detection (must happen BEFORE normalization)
    // The Reason why we are doing is that we have to bring the context to a common ground from which we can find the diff without any additional markups. 
    let originalLineEnding: 'CRLF' | 'LF' | 'mixed' = 'LF';
    const crlfCount = (str.match(/\r\n/g) || []).length;
    const totalLfCount = (str.match(/\n/g) || []).length;
    const standaloneLfCount = totalLfCount - crlfCount;

    if (crlfCount > 0 && standaloneLfCount > 0) {
      originalLineEnding = 'mixed';
    } else if (crlfCount > 0) {
      originalLineEnding = 'CRLF';
    }

    // Normalize all line endings to LF (CRLF first, then lone CR)
    str = str.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    
{/*Uint32Array is faster because it talks directly to your computer's hardware, skipping the heavy management layers of a standard JavaScript array
  .Here is exactly how it achieves this high performance:
  1. Direct Memory Mapping (Contiguous Block)Standard Array ([]): Memory is scattered. 
  The computer must use a lookup table to find where the next item lives in RAM.
  Uint32Array: Allocates one single, unbroken block of memory.Because the memory is unbroken, the CPU can calculate the exact hardware address of any element instantly using simple math:
  Target Address = Start Address + (Index * 4 Bytes).
  2. No Hidden Objects or Type CheckingStandard Array ([]): JavaScript arrays are actually hidden objects.
   Every time you read an item, the engine checks:
   Is this a string?
   A number?
   An object?
   Does this index exist?
   Uint32Array: It contains pure, raw binary.
   The engine knows every single slot is guaranteed to be a 32-bit integer.
 It completely skips all type-checking logic at runtime.
 3. CPU Cache EfficiencyModern CPUs use a feature called pre-fetching. When you read index 0, the CPU automatically loads the next few elements into its ultra-fast L1/L2 cache.
 Because Uint32Array stores data sequentially, your next data point is almost always already waiting inside the CPU cache.
 Standard arrays cause "cache misses" because the next item could be located anywhere else in RAM.
 4. Zero Garbage Collection OverheadStandard Array ([]): As standard arrays grow, shrink, or change types, the JavaScript engine constantly reallocates memory and 
 triggers the Garbage Collector to clean up old memory, causing micro-stutters.Uint32Array: The size is locked at creation. 
 It never grows, never shrinks, and never changes type. Memory pressure drops to zero.*/}
    const lines = str.split('\n');
    const lineHashes = new Uint32Array(lines.length);

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
      if (normalizeWhitespace) {
        line = line.replace(/\s+/g, ' ').trim();
        lines[i] = line; // Store normalized line back so hash and content stay in sync
      }
      lineHashes[i] = this.fnv1a32(line);
    }

    return {
      lines,
      lineHashes,
      originalContent: str,
      hadBOM,
      originalLineEnding
    };
  }


  //THis is a  blackbox -> I have no idea abouot this, How this implemented. 
  private fnv1a32(str: string): number {
    let hash = 0x811c9dc5; // FNV offset basis
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = (hash * 0x01000193) | 0; // FNV prime
    }
    return hash >>> 0; // Ensure unsigned
  }
}
