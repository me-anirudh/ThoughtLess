import { 
  IDiffAlgorithm, 
  IDiffContext, 
  EditOperation, 
  DiffRegion,
  RegionFeatures, 
  CandidateAlgorithm 
} from '../types';

export class ASTDiff implements IDiffAlgorithm {
  readonly name = 'ast';
  readonly supportsBinary = false;

  estimateCost(features: RegionFeatures, region: DiffRegion): CandidateAlgorithm {
    return {
      algorithm: this.name,
      executionCost: 9999, // Too expensive
      expectedQuality: 0,  // Not implemented
      totalScore: -10000,
      reason: 'AST diffing is not yet implemented.'
    };
  }

  execute(ctx: IDiffContext, region: DiffRegion): EditOperation[] {
    throw new Error('AST diff not yet implemented');
  }
}
