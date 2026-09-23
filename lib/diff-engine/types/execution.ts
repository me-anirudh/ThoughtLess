import { IDiffContext } from './context';
import { IAlgorithmRegistry } from './algorithm';
import { RegionFeatures } from './features';
import { KnowledgeEstimation } from './cost-model';

export interface IQueryPlanner {
  plan(ctx: IDiffContext, registry: IAlgorithmRegistry): void;
}

export interface IScheduler {
  executeRegions(ctx: IDiffContext, planner: IQueryPlanner, registry: IAlgorithmRegistry): void;
}

export interface ExecutionStats {
  algorithm: string;
  durationMs: number;
  operationsCount: number;
  qualityPassed: boolean;
}

export interface IKnowledgeBase {
  estimate(features: RegionFeatures, algorithm: string): KnowledgeEstimation | null;
  record(features: RegionFeatures, algorithm: string, stats: ExecutionStats): void;
}

export interface IPipelineStage {
  readonly name: string;
  execute(ctx: IDiffContext): void | Promise<void>;
}
