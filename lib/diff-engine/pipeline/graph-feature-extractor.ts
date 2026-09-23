import { IPipelineStage, IDiffContext, RegionFeatures } from '../types';

export class GraphFeatureExtractorStage implements IPipelineStage {
  readonly name = 'GraphFeatureExtractor';

  execute(ctx: IDiffContext): void {
    if (ctx.binary || ctx.identical) return;
    
    if (!ctx.normalizedOld || !ctx.normalizedNew) {
      throw new Error('GraphFeatureExtractor requires normalized files.');
    }

    const oldHashes = ctx.normalizedOld.lineHashes;
    const newHashes = ctx.normalizedNew.lineHashes;

    for (const region of ctx.regions) {
      if (region.type === 'stable') continue;

      const oldLen = region.oldEnd - region.oldStart;
      const newLen = region.newEnd - region.newStart;
      
      const oldHashCounts = new Map<number, number>();
      const newHashCounts = new Map<number, number>();

      for (let i = region.oldStart; i < region.oldEnd; i++) {
        const h = oldHashes[i];
        oldHashCounts.set(h, (oldHashCounts.get(h) || 0) + 1);
      }

      for (let j = region.newStart; j < region.newEnd; j++) {
        const h = newHashes[j];
        newHashCounts.set(h, (newHashCounts.get(h) || 0) + 1);
      }

      // 1. Changed Line Ratio
      let oldMissing = 0;
      for (const h of oldHashCounts.keys()) {
        if (!newHashCounts.has(h)) oldMissing++;
      }
      let newMissing = 0;
      for (const h of newHashCounts.keys()) {
        if (!oldHashCounts.has(h)) newMissing++;
      }
      
      const totalUniqueLines = oldHashCounts.size + newHashCounts.size;
      const changedLineRatio = totalUniqueLines === 0 ? 0 : (oldMissing + newMissing) / totalUniqueLines;
      const insertDeleteRatio = oldMissing === 0 ? (newMissing === 0 ? 1 : Infinity) : newMissing / oldMissing;

      // 2. Line Hash Similarity
      let intersection = 0;
      for (const h of oldHashCounts.keys()) {
        if (newHashCounts.has(h)) intersection++;
      }
      const union = oldHashCounts.size + newHashCounts.size - intersection;
      const lineHashSimilarity = union === 0 ? 1 : intersection / union;

      // 3. Anchor Density (Lines that are unique in BOTH files)
      let commonUniqueCount = 0;
      for (const [hash, count] of newHashCounts) {
        if (count === 1 && oldHashCounts.get(hash) === 1) {
          commonUniqueCount++;
        }
      }
      const maxLen = Math.max(oldLen, newLen, 1);
      const anchorDensity = commonUniqueCount / maxLen;

      // 4. Hash Collision Density (Duplicate lines inside the region)
      let duplicateCount = 0;
      for (const count of oldHashCounts.values()) {
        if (count > 1) duplicateCount += count;
      }
      for (const count of newHashCounts.values()) {
        if (count > 1) duplicateCount += count;
      }
      const totalLen = oldLen + newLen;
      const hashCollisionDensity = totalLen === 0 ? 0 : duplicateCount / totalLen;

      // 5. Expected Edit Distance (lower bound estimate)
      const expectedEditDistance = Math.abs(oldLen - newLen) + (oldMissing + newMissing) / 2;

      const features: RegionFeatures = {
        regionId: region.id,
        changedLineRatio,
        insertDeleteRatio,
        lineHashSimilarity,
        anchorDensity,
        hashCollisionDensity,
        expectedEditDistance
      };

      ctx.regionFeatures.set(region.id, features);
    }
  }
}
