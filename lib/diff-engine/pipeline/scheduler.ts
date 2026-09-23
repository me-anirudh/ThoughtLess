import { 
  IPipelineStage, 
  IDiffContext, 
  IAlgorithmRegistry, 
  EditOperation,
  DiffTimeoutError,
  ExecutionStats
} from '../types';

export class SchedulerStage implements IPipelineStage {
  readonly name = 'Scheduler';
  private registry: IAlgorithmRegistry;

  constructor(registry: IAlgorithmRegistry) {
    this.registry = registry;
  }

  execute(ctx: IDiffContext): void {
    if (ctx.identical || ctx.regions.length === 0) return;

    let allOperations: EditOperation[] = [];

    // V3: Synchronous Execution Scheduler. 
    // This could easily be swapped out for a WebWorkerScheduler that maps 
    // `ctx.regions` to worker threads and awaits them.
    for (const region of ctx.regions) {
      if (region.type === 'stable') {
        const oldLines = ctx.normalizedOld?.lines.slice(region.oldStart, region.oldEnd) || [];
        const newLines = ctx.normalizedNew?.lines.slice(region.newStart, region.newEnd) || [];
        allOperations.push({
          type: 'equal',
          oldStart: region.oldStart, oldEnd: region.oldEnd,
          newStart: region.newStart, newEnd: region.newEnd,
          oldLines, newLines // Used this syntax, because key and value (property and content both match)
        });
        
      }
else {
      // It's a changed region. Use the Candidate List from the Query Planner.
      const selection = ctx.regionalSelections.get(region.id);  //Regional selection is the one having the data of algo name and the result (or score). 
      if (!selection || selection.candidates.length === 0) {
        // Fallback safety (should not happen unless totally un-routable)
        allOperations = allOperations.concat(this.createReplaceBlock(ctx, region));
        // We treat this as someone special who pruned all the algos and now here we are with an empty algo list
        // So, what do we do we mark it seperately and we will deal with it later 
        // WHAT EXACTLY WILL HAPPEN WITH IT LATER -> If we dont find anything this wil simply be a "-" and "+" type of change
        // So yeah not much of a differnece but like we wony concern ourself with anything if we have already pruned all algos. 
        continue;
      }

      let bestScript: EditOperation[] | null = null;
      let regionFallbackUsed = false;


      // let prevQuality, prevDuration; 
    
      // Adaptive Feedback Loop
      for (let i = 0; i < selection.candidates.length; i++) {
        const candidate = selection.candidates[i];
        const algorithm = this.registry.get(candidate.algorithm);
        if (!algorithm) continue;

        const startTime = performance.now();
        
        try {
          const script = algorithm.execute(ctx, region);
          {/*//This will return me something like : 

          *[
  {
    "type": "equal",
    "oldStart": 0,
    "oldEnd": 2,
    "newStart": 0,
    "newEnd": 2,
    "oldLines": ["function hello() {", "  console.log('hi');"],
    "newLines": ["function hello() {", "  console.log('hi');"]
  },
  {
    "type": "insert",
    "oldStart": 2,
    "oldEnd": 2,
    "newStart": 2,
    "newEnd": 3,
    "oldLines": [],
    "newLines": ["  console.log('welcome!');"]
  },
  {
    "type": "delete",
    "oldStart": 3,
    "oldEnd": 4,
    "newStart": 3,
    "newEnd": 3,
    "oldLines": ["  // old comment"],
    "newLines": []
  }
] */}
          const durationMs = performance.now() - startTime;

          // Quality Check
          // Heuristic: If Myers produces an excessively fragmented script (e.g. 
          // alternating insert/deletes every single line), it might be better 
          // to discard it and try Patience or Histogram.
          const maxExpectedOps = (region.oldEnd - region.oldStart) + (region.newEnd - region.newStart);
          const qualityPassed = script.length <= maxExpectedOps * 1.5; 

          const stats: ExecutionStats = {
            algorithm: algorithm.name,
            durationMs,
            operationsCount: script.length,
            qualityPassed
          };

          const features = ctx.regionFeatures.get(region.id);
          // That one data we collected before preprocessing of the data for the query. 
          if (features) {
            ctx.knowledgeBase.record(features, algorithm.name, stats);
            // Memoisation, and in this fashion because we just have to know the stats and then we will evaluate it ourself.  
          }

          if (qualityPassed || i === selection.candidates.length - 1) {
            bestScript = script;
            // This is becasue we sorted them in the increasing order of their score based on the features we gave. 
            break;
          } else {
            regionFallbackUsed = true;
            // Loop continues, trying next candidate
          }
        } catch (error) {
          if (error instanceof DiffTimeoutError) {
            regionFallbackUsed = true;
            ctx.fallbackUsed = true;
            ctx.fallbackReason = `Timeout in region ${region.id} with ${candidate.algorithm}`;
            // Loop continues, trying next candidate
          } else {
            throw error; // Unexpected error
          }
        }
        // prevQuality = 
      }

      if (bestScript) {
        allOperations = allOperations.concat(bestScript);
      } else {
        // All algorithms timed out or failed
        ctx.timedOut = true;
        allOperations = allOperations.concat(this.createReplaceBlock(ctx, region));
      }
    }
    }
    
    ctx.rawEditScript = allOperations;
  }

  private createReplaceBlock(ctx: IDiffContext, region: import('../types').DiffRegion): EditOperation[] {
    return [{
      type: 'replace',
      oldStart: region.oldStart, oldEnd: region.oldEnd,
      newStart: region.newStart, newEnd: region.newEnd,
      oldLines: ctx.normalizedOld?.lines.slice(region.oldStart, region.oldEnd) || [],
      newLines: ctx.normalizedNew?.lines.slice(region.newStart, region.newEnd) || []
    }];
  }
}
