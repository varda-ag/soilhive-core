import { AssertionError } from 'assert/strict';
import { getReasonPhrase } from 'http-status-codes';

export class ErrorResponse extends Error {
  status: number;
  /** RFC 7807 extension members added to the problem body. */
  extensions?: Record<string, unknown> | undefined;
  constructor(message: string, status: number | undefined, extensions?: Record<string, unknown>) {
    super(message);
    this.status = status || 500;
    this.extensions = extensions;
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
