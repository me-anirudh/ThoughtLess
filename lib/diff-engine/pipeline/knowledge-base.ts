import { IKnowledgeBase, RegionFeatures, KnowledgeEstimation, ExecutionStats } from '../types';

/**
 * Knowledge Base Stub
 * In V1, this is a Null implementation.
 * In a future ML-driven iteration, this will store historical execution stats 
 * (time taken, script size) indexed by region features and use it to adjust 
 * the Cost+Quality model automatically.
 */
export class KnowledgeBaseStub implements IKnowledgeBase {
  estimate(features: RegionFeatures, algorithm: string): KnowledgeEstimation | null {
    // Return null to indicate no historical data is available.
    // The Query Planner will fall back to its heuristic cost model.
    return null;
  }

  record(features: RegionFeatures, algorithm: string, stats: ExecutionStats): void {
    // No-op for now. 
    // In the future, write this to IndexedDB or a remote telemetry service.
  }
}
