import type { IDiffAlgorithm, IAlgorithmRegistry } from '../types';

export class AlgorithmRegistry implements IAlgorithmRegistry {
  private algorithms: Map<string, IDiffAlgorithm> = new Map();

  register(algorithm: IDiffAlgorithm): void {
    if (this.algorithms.has(algorithm.name)) {
      throw new Error(`Algorithm '${algorithm.name}' is already registered.`);
    }
    this.algorithms.set(algorithm.name, algorithm);
  }

  get(name: string): IDiffAlgorithm | undefined {
    return this.algorithms.get(name);
  }

  getAll(): IDiffAlgorithm[] {
    return Array.from(this.algorithms.values());
  }

  has(name: string): boolean {
    return this.algorithms.has(name);
  }
}
