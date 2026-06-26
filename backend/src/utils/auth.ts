import { StatusCodes } from 'http-status-codes';
import { ErrorResponse } from './error';
import { RequestData } from '../interfaces/RequestData';

/**
 * Returns the authenticated user's id (the token `sub` claim), throwing a 401 if it is absent.
 *
 * The token validator middleware guarantees `sub` on HTTP routes, but `RequestData.token` is
 * optional (e.g. background jobs construct it directly), so callers that need a user id assert
 * it here rather than relying on the middleware being wired on every path.
 */
export const requireSub = (requestData: RequestData): string => {
  const sub = requestData.token?.sub;
  if (!sub) {
    throw new ErrorResponse('Token subject is missing', StatusCodes.UNAUTHORIZED);
  }
  return sub;
};

export const requireEmail = (requestData: RequestData): string => {
  const email = requestData.token?.email;
  if (!email) {
    throw new ErrorResponse('Token email is missing', StatusCodes.UNAUTHORIZED);
  }
  return email;
};
