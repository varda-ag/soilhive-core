# Keycloak Setup Example

This example uses the Keycloak instance included in the SoilHiveCore docker-compose setup.

## 1. Start Keycloak
Run `docker-compose up`. Keycloak will be available at `http://localhost:8080`.

## 2. Login to Keycloak
Use the default credentials found in the `docker-compose.yaml` file.

## 3. Create a Realm
1. In the menu select "Manage Realms"
2. Click "Create realm", give it a name and save
3. Select the newly created realm

## 4. Create a Test User
1. In the menu select "Users"
2. Click "Add user", give it a username and click "Create".
3. Select the newly created user, and then click on the "Credentials" tab to give it a password

## 5. Create a Client
1. In the menu select "Clients"
2. Click "Create Client"
3. Select **OpenID Connect** as the client type
4. Set its **Client ID** (take note of this, since it will be used to setup the application authentication configuration)
5. In the **Capability config**, enable "Standard flow"
6. In the **Access settings**, configure:
   - **Valid Redirect URIs**: `http://<BASE_APP_URL>/*`
   - **Valid post logout redirect URIs**: `+`
   - **Web origins**: `+`

## 6. Create Client Scope super-admin (or data-admin).
1. In the menu select "Client Scopes"
2. Click "Create client scope"
3. Set its **Name** to "super-admin" (or "data-admin")
4. Set **Type** to "Default"
5. Disable **Display on consent screen**
6. Enable **Include in token scope**
7. Disable **Include in OpenID Provider Metadata**
8. Keep all other settings as defaults and save

## 7. Assign the super-admin (or data-admin) Client Scope to the Client
1. In the menu select "Clients" and search for the newly created client. Select it
2. Click on the "Client scopes" tab and click "Add client scope"
3. Search the newly created scope and add it to this client
4. Make sure the "Assigned Type" is "Default"

## 8. Create the super-admin (or data-admin) Client Roles
1. In the menu select "Clients" and search for the newly created client. Select it
2. Click on the "Roles" tab and click "Create role"
3. Name it "super-admin" (or "data-admin") and save

## 9. Give the super-admin (or data-admin) Role the super-admin (or data-admin) Scope
1. In the menu select "Client Scopes" and search for the newly created scope. Select it
2. Click on the "Scope" tab
3. Click on the "Assign role" button and select "Client Roles"
4. Search for the super-admin (or data-admin) role and assign it

## 10. Give a user the super-admin role
This is the last step that really makes a user a super-admin (or a data-admin)
1. In the menu select "Users" and search for the user that needs to be super-admin (or data-admin) and select it
2. Select the "Role mapping" tab
3. Click on the "Assign role", "Client Roles"
4. Search for the super-admin (or data-admin) and assign it

## 11. Configure Application Environment Variables
Set the following environment variables in the backend of your application:

```bash
OIDC_AUTHORITY=http://localhost:8080/realms/<your-realm-name>
OIDC_CLIENT_ID=<your-client-id>
OIDC_REDIRECT_URI=http://<BASE_APP_URL>/admin
OIDC_POST_LOGOUT_REDIRECT_URI=http://<BASE_APP_URL>
OIDC_SILENT_REDIRECT_URI=http://<BASE_APP_URL>
OIDC_SCOPE=openid
```

## 12. Test Authentication
When you try to access the admin page, you should be redirected to Keycloak for authentication.

## Important: HTTP/HTTPS Considerations
⚠️ **In this configuration, Keycloak runs on HTTP (not HTTPS).**

For redirects to work properly:
- If Keycloak is served over HTTP, your application must also be served over HTTP
- If your application is served over HTTPS, Keycloak must also be served over HTTPS

Ensure both services use the same protocol to avoid redirect issues.
