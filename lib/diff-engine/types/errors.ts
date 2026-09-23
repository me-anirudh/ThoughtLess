export class DiffTimeoutError extends Error {
  public readonly algorithm: string;
  public readonly iterationsCompleted: number;

  constructor(algorithm: string, iterationsCompleted: number) {
    super(`Algorithm "${algorithm}" exceeded deadline after ${iterationsCompleted} iterations.`);
    this.name = 'DiffTimeoutError';
    this.algorithm = algorithm;
    this.iterationsCompleted = iterationsCompleted;
  }
}

export class FileTooLargeError extends Error {
  constructor(sizeBytes: number, limitBytes: number) {
    super(`File size ${sizeBytes} bytes exceeds limit of ${limitBytes} bytes.`);
    this.name = 'FileTooLargeError';
  }
}
