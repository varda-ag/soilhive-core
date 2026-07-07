import { JwtPayload } from 'jsonwebtoken';

export interface Token extends JwtPayload {
  sub: string; // Making it mandatory
  raw: string;
  scope: string;
  email?: string;
  client_id?: string;
  isSuperAdmin: boolean;
  isDataAdmin: boolean;
  isInternalRequest: boolean;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}
