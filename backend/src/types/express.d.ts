import { RequestData } from '../interfaces/RequestData';

declare global {
  namespace Express {
    interface Request {
      customData: RequestData;
    }
  }
}
