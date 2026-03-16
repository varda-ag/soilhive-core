# Authentication Mode

Three authentication options are provided:

1. `none`: authentication is disabled
2. `password`: `super-admin` and `data-admin` roles are linked to passwords stored in environment variables
3. `oidc`: environment variables are pointing to an external OIDC Identity Provider

## `none`
Platform is in read-only mode. All token protected endpoints are not reachable.

## `password`
Basic support for `super-admin` and `data-admin` roles with hardcoded passwords.
No user support is provided.

## `oidc`
External IDP will be used to validate tokens.
Frontend will receive the login configuration from this backend.

## Token scopes
Platform supports two built-in scopes:

1. `super-admin`
2. `data-admin`

Endpoints may require a specific scope to return a successful response.

## How to setup Authentication

### Password-Based Authentication
Set the following backend environment variables to enable password authentication:

- `SUPER_ADMIN_PASSWORD_HASH`: bcrypt hash of password required to access the admin section
- `DATA_ADMIN_PASSWORD_HASH`: bcrypt hash of password required to manage data
- `SELF_SIGNING_SECRET`: secret used to sign authentication tokens (can be any string of your choice)

### OIDC Authentication
Set the following backend environment variables to enable OIDC authentication (see below for an exampe on how to setup an oidc provider):

- `OIDC_AUTHORITY`: Identity provider URL (e.g., `https://<BASE_KEYCLOAK_URL>/realms/<realm>` for Keycloak)
- `OIDC_CLIENT_ID`: Client name as configured in your identity provider
- `OIDC_REDIRECT_URI`: URL to redirect after successful login (e.g., `http://<BASE_APP_URL>/admin`)
- `OIDC_POST_LOGOUT_REDIRECT_URI`: URL to redirect after logout (typically the app main page)
- `OIDC_SILENT_REDIRECT_URI`: URL to redirect after token refresh (typically the app main page)
- `OIDC_SCOPE`: Set to `openid`

Besides the backend configuration, a user created inside the Identity Provider must be given the super-admin scope before they can access the application as admin.

### Authentication Priority
- If both password and OIDC variables are set, **OIDC takes precedence**
- If no variables are set or only partially configured, **no authentication will be enabled**
