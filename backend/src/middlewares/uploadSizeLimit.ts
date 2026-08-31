import { NextFunction, Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import ConfigService from '../services/ConfigService';

const MULTIPART_CONTENT_TYPE = 'multipart/form-data';

// Early gate rejecting oversized multipart uploads before multer starts buffering/streaming.
// Scoped to multipart requests only, so it never collides with JSON_PAYLOAD_LIMIT.
// Multer's own `limits.fileSize` (see middlewares/openapi.ts) remains the authoritative check,
// since a request without a Content-Length header (e.g. chunked transfer-encoding) bypasses this gate.
export const uploadSizeLimit = (req: Request, res: Response, next: NextFunction): void => {
  const contentType = req.headers['content-type'];
  if (!contentType?.startsWith(MULTIPART_CONTENT_TYPE)) {
    next();
    return;
  }

  const contentLength = Number(req.headers['content-length']);
  if (Number.isFinite(contentLength) && contentLength > ConfigService.getMaxUploadSizeBytes()) {
    res.status(StatusCodes.REQUEST_TOO_LONG).type('application/problem+json').json({
      title: 'Payload Too Large',
      status: StatusCodes.REQUEST_TOO_LONG,
      detail: 'The uploaded file exceeds the maximum allowed size',
      instance: req.originalUrl,
    });
    return;
  }

  next();
};
