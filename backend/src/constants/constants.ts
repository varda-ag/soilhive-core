import { TOKEN_ISSUER, TokenScopes } from '../types/enums';

export const MAX_PROPERTY_LEVEL = 2;
export const DATA_PREVIEW_SIZE = 20;
export const OUTSIDE_LOD_VALUE = -999;
export const EVERYONE = 'everyone';
export const INTERNAL_REQUEST_TOKEN_PAYLOAD = {
  sub: TokenScopes.INTERNAL_REQUEST,
  iss: TOKEN_ISSUER,
  scope: `${TokenScopes.INTERNAL_REQUEST} ${TokenScopes.DATA_ADMIN}`,
  email: `${TokenScopes.INTERNAL_REQUEST}@localhost`,
};
