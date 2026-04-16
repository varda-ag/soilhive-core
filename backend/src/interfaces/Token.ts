import { JwtPayload } from 'jsonwebtoken';

export interface Token extends JwtPayload {
  raw: string;
  email: string;
  scope: string;
  isSuperAdmin: boolean;
  isDataAdmin: boolean;
  isInternalRequest: boolean;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}
