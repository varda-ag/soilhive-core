import StatusCodes from 'http-status-codes';
import { ErrorResponse } from '../utils/error';

// Every route in model-runners.yaml, until docs/adr/0078 is built.
export const notImplemented = async () => {
  throw new ErrorResponse('Not implemented', StatusCodes.NOT_IMPLEMENTED);
};
