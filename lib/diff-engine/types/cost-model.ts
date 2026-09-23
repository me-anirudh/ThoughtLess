export interface CandidateAlgorithm {
  algorithm: string;
  executionCost: number;
  expectedQuality: number;
  totalScore: number; 
  reason: string;
}

export interface CostModelResult {
  regionId: string;
  candidates: CandidateAlgorithm[];
  selectedAlgorithm: string;
}

export interface KnowledgeEstimation {
  expectedCost: number;
  expectedQuality: number;
  confidence: number;
}
