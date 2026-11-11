import { NextFunction, Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';

export const errorMiddleware = async (err: any, req: Request, res: Response, _: NextFunction) => {
  // Customize errors into RFC 7807 problem format
  // Standard members come last, so an extension cannot replace them
  const problemDetails = {
    ...err.extensions,
    title: err.name || 'Invalid request',
    status: err.status,
    detail: err.message || err.detail,
    instance: req.originalUrl,
    errors: err.errors,
  };
  res
    .status(err.status || StatusCodes.INTERNAL_SERVER_ERROR)
    .type('application/problem+json')
    .json(problemDetails);
};
