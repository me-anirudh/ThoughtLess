import { 
  IPipelineStage, 
  IDiffContext, 
  IAlgorithmRegistry, 
  CostModelResult, 
  CandidateAlgorithm 
} from '../types';

export class QueryPlannerStage implements IPipelineStage {
  readonly name = 'QueryPlanner';
  private registry: IAlgorithmRegistry;

  constructor(registry: IAlgorithmRegistry) {
    this.registry = registry;
  }

  execute(ctx: IDiffContext): void {
    if (ctx.identical) return;
  
    for (const region of ctx.regions) {
      if (region.type === 'stable') continue;

    

      const features = ctx.regionFeatures.get(region.id);
      if (!features) continue;

      let candidates: CandidateAlgorithm[] = [];

      // If user forced an algorithm, just use it
      if (ctx.options.forceAlgorithm) {
        const algo = this.registry.get(ctx.options.forceAlgorithm);
        if (algo) {
          candidates.push(algo.estimateCost(features, region));
        }
      } else {
        // Phase 1: Decision Tree -> Here we will filter out which algo we can use for a particular ctx file we have been given 
        const availableAlgos = this.registry.getAll();
        const prunedAlgos = availableAlgos.filter(algo => {
          // This is when ctx is binary but algo dont support binary files or ctx isnt binary but algo just supports binary
          if (ctx.binary && !algo.supportsBinary) return false;
          if (!ctx.binary && algo.supportsBinary) return false;
          // AST diff is stubbed, but pruning logic:
          if (algo.name === 'ast' && !['typescript', 'javascript'].includes(ctx.oldFileFeatures?.language || '')) return false;
          
          
          return true;

        });

        // Phase 2: Cost + Quality Model Estimation
        for (const algo of prunedAlgos) {
          // PrunedAlgo is the collection of Algos which are appropriate for the ctx we have been given.
          // Check Knowledge Base first(This is basically memoisation of whatever we have evaluated till now)
          const kbEstimate = ctx.knowledgeBase.estimate(features, algo.name);
          if (kbEstimate) {
            const totalScore = 100 - kbEstimate.expectedCost + kbEstimate.expectedQuality;
            candidates.push({
              algorithm: algo.name,
              executionCost: kbEstimate.expectedCost,
              expectedQuality: kbEstimate.expectedQuality,
              totalScore,
              reason: 'Estimated from Knowledge Base historical data.'
            });
          } else {
            // Fallback to algorithmic heuristic estimation
            candidates.push(algo.estimateCost(features, region));
          }
        }
      }

      // Sort candidates descending by total score
      candidates.sort((a, b) => b.totalScore - a.totalScore);

      const result: CostModelResult = {
        regionId: region.id,
        candidates,
        selectedAlgorithm: candidates.length > 0 ? candidates[0].algorithm : 'myers' // Implement "myers" instead
      };

      ctx.regionalSelections.set(region.id, result);
    }
  }
}
