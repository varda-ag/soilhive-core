import { Request, Response } from 'express';

export const errorMiddleware = async (err: any, req: Request, res: Response) => {
  // Customize errors into RFC 7807 problem format
  const problemDetails = {
    title: err.name || 'Invalid request',
    status: err.status,
    detail: err.message || err.detail,
    instance: req.originalUrl,
    errors: err.errors,
  };
  res
    .status(err.status || 500)
    .type('application/problem+json')
    .json(problemDetails);
};
