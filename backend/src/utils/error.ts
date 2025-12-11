import { getReasonPhrase } from 'http-status-codes';

export class ErrorResponse extends Error {
  status: number;
  constructor(message: string, status: number | undefined) {
    super(message);
    this.status = status || 500;
    this.name = getReasonPhrase(this.status);
  }
}
