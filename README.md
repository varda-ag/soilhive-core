<img width="900" height="522" alt="image" src="https://github.com/user-attachments/assets/231002e6-3b9a-4b7c-b64b-0b984a0b629a" />

# soilhive-core

```
docker compose up -d
```

Entry points:

- Keycloak: http://localhost:8080/admin/master/console/
- Frontend: http://localhost:3000/
- Backend:  http://localhost:4001/docs/

## Authentication Setup

This application supports two authentication methods:

1. **Password-based authentication** - Simple password protection for admin access
2. **OIDC authentication** - Integration with identity providers like Keycloak

Authentication is configured through backend environment variables.

### Password-Based Authentication

Set the following environment variables to enable password authentication:

- `SUPER_ADMIN_PASSWORD` - Password required to access the admin section
- `DATA_ADMIN_PASSWORD` - Password required to manage data
- `SELF_SIGNING_SECRET` - Secret used to sign authentication tokens

### OIDC Authentication

Set the following environment variables to enable OIDC authentication:

- `OIDC_AUTHORITY` - Identity provider URL (e.g., `https://<BASE_KEYCLOAK_URL>/realms/<realm>` for Keycloak)
- `OIDC_CLIENT_ID` - Client name as configured in your identity provider
- `OIDC_REDIRECT_URI` - URL to redirect after successful login (e.g., `http://<BASE_APP_URL>/admin`)
- `OIDC_POST_LOGOUT_REDIRECT_URI` - URL to redirect after logout (typically the app main page)
- `OIDC_SILENT_REDIRECT_URI` - URL to redirect after token refresh (typically the app main page)
- `OIDC_SCOPE` - Set to `openid`

Besides the backend configuration, a user created inside the Identity Provider must be given the super-admin scope before they can access the application as admin.

### Authentication Priority

- If both password and OIDC variables are set, **OIDC takes precedence**
- If no variables are set or only partially configured, **no authentication will be enabled**

---

## Keycloak Setup Example

This example uses the Keycloak instance included in the SoilHiveCore docker-compose setup.

### 1. Start Keycloak

Run `docker-compose up`. Keycloak will be available at `http://localhost:8080`.

### 2. Login to Keycloak

Use the default credentials found in the `docker-compose.yaml` file.

### 3. Create a Realm

1. In the menu select "Manage Realms"
2. Cilck "Create realm", give it a name and save
3. Select the newly created realm

### 4. Create a Test User

1. In the menu select "Users" 
2. Click "Add user" and give it a username and click "Create". 
3. Select the newly created user, and then click on the "Credentials" tab to give it a password

### 5. Create a Client

1. In the menu select "Clients"
2. Click "Create Client"
3. Select **OpenID Connect** as the client type
4. Set its **Client ID** (take note of this, since it wil be used to setup the application authentication configuration) 
5. In the **Capability config**, enable "Standard flow"
6. In the **Access settings**, configure:
   - **Valid Redirect URIs**: `http://<BASE_APP_URL>/*` and `http://<BASE_APP_URL>`
   - **Valid post logout redirect URIs**: `+`
   - **Web origins**: `+`

### 6. Create Client Scope super-admin

1. In the menu select "Client Scopes"
2. Set its **Name** to "super-admin"
3. Enable **Include in token scope**
4. Keep all other settings as defaults and save

### 7. Assign the super-admin Client Scope to the Client

1. In the menu select "Clients" and search for the newly created client. Select it
2. Click on the "Client scopes" tab and click "Add client scope"
3. Search the newly created scope and add it to this client

### 8. Configure Application Environment Variables

Set the following environment variables for your application:
```bash
OIDC_AUTHORITY=http://localhost:8080/realms/<your-realm-name>
OIDC_CLIENT_ID=<your-client-id>
OIDC_REDIRECT_URI=http://<BASE_APP_URL>/admin
OIDC_POST_LOGOUT_REDIRECT_URI=http://<BASE_APP_URL>
OIDC_SILENT_REDIRECT_URI=http://<BASE_APP_URL>
OIDC_SCOPE=openid
```

### 9. Test Authentication

When you try to access the admin page, you should be redirected to Keycloak for authentication.

### Important: HTTP/HTTPS Considerations

⚠️ **In this configuration, Keycloak runs on HTTP (not HTTPS).** 

For redirects to work properly:
- If Keycloak is served over HTTP, your application must also be served over HTTP
- If your application is served over HTTPS, Keycloak must also be served over HTTPS

Ensure both services use the same protocol to avoid redirect issues.