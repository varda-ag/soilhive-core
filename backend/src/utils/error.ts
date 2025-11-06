const statusNameFor = Object.freeze(
  new Map([
    [400, 'Bad Request'],
    [401, 'Unauthorized'],
    [403, 'Forbidden'],
    [404, 'Not Found'],
    [413, 'Content Too Large'],
    [422, 'Unprocessable Entity'],
    [429, 'Too Many Requests'],
    [500, 'Internal server error'],
  ]),
);

export class ErrorResponse extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = statusNameFor.get(status) ?? statusNameFor.get(500)!;
  }
}
