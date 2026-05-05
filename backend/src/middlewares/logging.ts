import { NextFunction, Request, Response } from 'express';
import {
  ATTR_HTTP_REQUEST_METHOD,
  ATTR_HTTP_RESPONSE_STATUS_CODE,
  ATTR_URL_FULL,
  ATTR_URL_PATH,
  ATTR_NETWORK_PEER_ADDRESS,
  ATTR_USER_AGENT_ORIGINAL,
} from '@opentelemetry/semantic-conventions';
import { log } from '../utils/logger';

export const loggingMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const start = Date.now();
  res.on('finish', () => {
    const duration_ms = Date.now() - start;
    const { statusCode } = res;
    const attrs = {
      [ATTR_HTTP_REQUEST_METHOD]: req.method,
      [ATTR_URL_PATH]: req.path,
      [ATTR_URL_FULL]: req.originalUrl,
      [ATTR_HTTP_RESPONSE_STATUS_CODE]: statusCode,
      [ATTR_USER_AGENT_ORIGINAL]: req.headers['user-agent'],
      [ATTR_NETWORK_PEER_ADDRESS]: req.ip,
      duration_ms,
    };
    const message = `${req.method} ${req.originalUrl} ${statusCode} ${duration_ms}ms`;
    if (statusCode >= 400) {
      log.error(message, attrs);
    } else {
      log.info(message, attrs);
    }
  });
  next();
};
