import { AssertionError } from 'assert/strict';
import { getReasonPhrase } from 'http-status-codes';

export class ErrorResponse extends Error {
  status: number;
  constructor(message: string, status: number | undefined) {
    super(message);
    this.status = status || 500;
    this.name = getReasonPhrase(this.status);
  }
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof AggregateError) {
    const messages = error.errors.map(getErrorMessage);
    return [error.message, ...messages].filter(Boolean).join('; ');
  }
  return error instanceof Error || error instanceof AssertionError ? error.message : String(error);
}
