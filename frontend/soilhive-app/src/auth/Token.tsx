export type Token = {
  id_token?: string;
  session_state?: string | null;
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  scope?: string;
  profile?: {
    exp?: number;
    iat?: number;
    iss?: string;
    aud?: string | string[];
    sub?: string;
    typ?: string;
    sid?: string;
    user_role?: string;
    email_verified?: boolean;
    name?: string;
    given_name?: string;
    family_name?: string;
    user_organisation?: string;
    email?: string;
  },
  expires_at?: number;
}