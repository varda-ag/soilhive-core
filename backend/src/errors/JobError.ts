export class JobError extends Error {
  constructor(
    public readonly code: string,
    public readonly params: Record<string, unknown> = {},
    public readonly detail?: string,
  ) {
    super(`JobError: ${code}`);
    this.name = 'JobError';
  }

  static isJobError(error: unknown): error is JobError {
    return error instanceof Error && error.name === 'JobError';
  }
}
