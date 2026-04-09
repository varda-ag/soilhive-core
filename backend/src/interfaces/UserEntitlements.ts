import { Entitlements } from '../types/Entitlements';

export interface UserEntitlements {
  id: string; // User ID, e.g. email
  data: Entitlements;
}
