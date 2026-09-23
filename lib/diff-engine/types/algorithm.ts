import { RegionFeatures } from './features';
import { DiffRegion } from './regions';
import { CandidateAlgorithm } from './cost-model';
import { IDiffContext } from './context';
import { EditOperation } from './operations';

export interface IDiffAlgorithm {
  readonly name: string;
  readonly supportsBinary: boolean;

  estimateCost(features: RegionFeatures, region: DiffRegion): CandidateAlgorithm;
  
  execute(ctx: IDiffContext, region: DiffRegion): EditOperation[];
}

export interface IAlgorithmRegistry {
  register(algorithm: IDiffAlgorithm): void;
  get(name: string): IDiffAlgorithm | undefined;
  getAll(): IDiffAlgorithm[];
  has(name: string): boolean;
}
