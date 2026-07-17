# Quickstart

The fastest way to try SoilHive is to boot up the full stack with a single Docker Compose command. No manual setup, dependency installs, or configuration is required — Compose builds and starts every service, provisions a test identity provider, and wires everything together for you.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) with the Compose plugin (`docker compose`, not the older standalone `docker-compose`)
- Make sure these ports are free on your machine: `3000` (frontend), `4001` (backend), `5432` (Postgres), `8080` (Keycloak)

No other install step is required — the backend and frontend are built into Docker images by Compose itself.

## Start the stack

```
docker compose up -d
```

This builds and starts four containers:

- **postgis**: PostgreSQL with the PostGIS extension, used to store the harmonized soil data and its geospatial indexes.
- **keycloak**: the identity provider used for authentication and authorization across the platform. On first boot it automatically imports a `soilhive` realm with test user accounts, see [Demo user accounts](#demo-user-accounts) below.
- **backend**: the SoilHive API, including the data upload, harmonization, search, and export functionality, backed by an interactive OpenAPI (Swagger) docs page.
- **frontend**: the web application used to search, browse, upload, and download soil datasets.

Once the containers are up and healthy, you can reach each entry point at:

- Frontend: http://localhost:3000/
- Backend API docs: http://localhost:4001/docs/
- Keycloak admin console: http://localhost:8080/admin/master/console/

To stop the stack, run `docker compose down`. Add `-v` to also remove the `postgis_data` volume and start from a completely clean database (and a freshly re-imported Keycloak realm) on the next run.

## Configuration

All configuration for the local stack lives in the `environment:` block of each service in `docker-compose.yml` — there's no separate `.env` file to create. The values that matter most:

| Variable(s)                                                                                          | Service  | Purpose                                                                                              |
| ---------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------- |
| `POSTGRES_HOST`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_SCHEMA`              | backend  | Connection details for the `postgis` database.                                                       |
| `SELF_SIGNING_SECRET`                                                                                | backend  | Signs internal loopback requests the backend makes to itself, e.g. the bulk-load job writing ingested records back through its own API. Required regardless of auth mode. |
| `OIDC_AUTHORITY`, `OIDC_CLIENT_ID`, `OIDC_JWKS_URL`, `OIDC_REDIRECT_URI`, `OIDC_POST_LOGOUT_REDIRECT_URI`, `OIDC_SILENT_REDIRECT_URI`, `OIDC_SCOPE` | backend  | Point the platform at the local Keycloak `soilhive` realm/client so login works out of the box. See [Authentication](authentication.md) for what each one does. |
| `PORT`, `BACKEND_BASE_URL`                                                                           | frontend | Which port the frontend listens on, and where it reaches the backend API.                            |
| `KEYCLOAK_ADMIN`, `KEYCLOAK_ADMIN_PASSWORD`                                                          | keycloak | Master realm admin credentials, see [Keycloak admin console](#keycloak-admin-console).               |

> **These are demo-only credentials, hardcoded in `docker-compose.yml` for convenience.** They're fine for exploring the platform locally, but this Compose setup is not meant to be exposed publicly or reused as-is for a real deployment.

`OIDC_JWKS_URL` uses the Docker service hostname `keycloak:8080` (it's fetched by the backend container itself), while the other `OIDC_*` values use `localhost` (they're handed to your browser, which can't resolve Docker service names). If you change the frontend's published port away from `3000`, you'll need to update `OIDC_REDIRECT_URI`/`OIDC_POST_LOGOUT_REDIRECT_URI`/`OIDC_SILENT_REDIRECT_URI` and the `redirectUris` in [quickstart-sample-data/soilhive-realm.json](../quickstart-sample-data/soilhive-realm.json) to match, or login will fail — see [Troubleshooting](#troubleshooting).

The backend supports several more options not set by default in `docker-compose.yml` (alternate storage backends, logging verbosity, CORS origins, password-based auth instead of OIDC, etc.) — see [backend/.env-example](../backend/.env-example) for the full list, and [Authentication](authentication.md) for the available auth modes.

## Keycloak admin console

The `keycloak` container comes up with a master realm admin account, used to sign into the admin console at http://localhost:8080/admin/master/console/:

| Username | Password         |
| -------- | ---------------- |
| `admin`  | `admin_password` |

Use this if you need to inspect or modify the `soilhive` realm directly (add users, change role mappings, etc.). For routine use of the platform, the demo accounts below are enough.

## Demo user accounts

On first boot, Keycloak automatically imports a `soilhive` realm (see [quickstart-sample-data/soilhive-realm.json](../quickstart-sample-data/soilhive-realm.json)) with an OIDC client and three test users, so you have something to log in with right away — no manual setup in the Keycloak admin console required. The import is idempotent: it only runs once per Postgres volume, so re-running `docker compose up -d` or restarting the containers won't reset or duplicate the realm.

| Username      | Password   | Email                        | Role          | What it's for                                                                                        |
| ------------- | ---------- | ---------------------------- | ------------- | ---------------------------------------------------------------------------------------------------- |
| `user`        | `password` | `user@soilhive.local`        | none          | An authenticated account with no elevated role. Search, browse, and download work the same as anonymously, except for datasets specifically shared with it (see [step 4](#4-check-what-each-account-can-see) of the walkthrough); the **Admin console** option also correctly stays hidden for this account. |
| `data-admin`  | `password` | `data-admin@soilhive.local`  | `data-admin`  | Can upload, map, clean, and publish datasets through the Admin console's Data Publication panel, manage map-based filters, and edit (but not delete) platform configuration. This is the account to use for the [ingestion walkthrough](#2-upload-a-dataset-data-admin) below. |
| `super-admin` | `password` | `super-admin@soilhive.local` | `super-admin` | Everything `data-admin` can do, plus platform-wide settings: branding/logo, terms & conditions, privacy policy, notification banner, and default map settings, and can delete or export platform configuration. |

Note that you don't need to log in at all to search, browse, filter, or download published datasets — that's available anonymously. Logging in is only required to reach the Admin console.

## Sample dataset

[quickstart-sample-data/soilhive-quickstart-sample.csv](../quickstart-sample-data/soilhive-quickstart-sample.csv) is a small (12-row), ready-to-upload CSV purpose-built for this guide, so you can try out the ingestion pipeline end to end without sourcing your own file first. It has a WKT point-geometry column plus six soil property columns (pH, organic carbon, total nitrogen, clay %, sand %, CEC), covering fabricated sample points, at two depths for a couple of them across ten cities:

```
WKT,depth,pH,SOC_g_kg,TN_g_kg,clay_pct,sand_pct,CEC_cmolc_kg
POINT (36.8219 -1.2921),20,6.2,21.5,1.9,32,40,15.6
...
```

It doesn't include a `licence` column — during the **Field Mapping** or dataset settings step, set a single fixed license for the whole dataset instead (see the platform's [supported licenses list](data-model/6-license_options.csv)).

[quickstart-sample-data/random_east_west_africa_soil_samples.csv](../quickstart-sample-data/random_east_west_africa_soil_samples.csv) is a second sample file, with WKT polygon geometries and multiple depth ranges per location. Its values were randomly generated and have no real-world meaning — they exist solely to provide sample data for testing the ingestion flow. Use [quickstart-sample-data/data_mappings_for_east_west_africa_soil_samples.md](../quickstart-sample-data/data_mappings_for_east_west_africa_soil_samples.md) as the **Field Mapping** reference when uploading it.

## Walkthrough: exploring the platform

This walks through configuring the platform as `super-admin`, then publishing data as `data-admin`, and finally checking how visibility affects what other users can see. Click **Login** in the header to sign in with any of the [demo accounts](#demo-user-accounts); the account menu (top-right, once logged in) has a **Logout** option, use it to switch accounts between steps.

### 1. Configure the platform (`super-admin`)

Log in as `super-admin` and open the **Admin console**:

- **Look & Feel** → **Logo** tab to upload a picture, and **Customize colors** tab to set colors for primary/secondary/tertiary buttons, filter pills, and backgrounds, with a live preview — click **Publish** when you're happy with it.
- **Map Settings** → drag/zoom the map to the area you want shown by default when a user first opens the platform (the **Default map extent**), then **Save changes**.

Only `super-admin` sees these two menu items, along with **Terms and Conditions**, **Privacy Policy**, and **Notification Banner** — a `data-admin` account can't reach any of them.

### 2. Upload a dataset (`data-admin`)

Log out, log back in as `data-admin`, open the **Admin console**, and go to **Data Publication** → **Add a Dataset**. The wizard has four steps:

1. **General Info** — name and describe the dataset
2. **File Upload** — upload the [sample dataset](#sample-dataset) above (or your own file)
3. **Field Mapping** — map `pH`, `SOC_g_kg`, `TN_g_kg`, `clay_pct`, `sand_pct`, and `CEC_cmolc_kg` to the matching SoilHive vocabulary properties and specify their original units; the `WKT` geometry column is detected automatically
4. **Preview** — review the parsed rows, drop any bad ones, and confirm the load

See [Data Management Portal](data-model/1-data-management-portal.md) for the full, detailed walkthrough of this flow, including supported file formats and mapping rules.

### 3. Choose visibility and publish

Still on the dataset (its **Dataset settings** page), pick **Data visibility**:

- **Public dataset** — all users can view and download it
- **Private dataset** — only data administrators can, until you grant access to specific people

If you pick private, a **Who can access this dataset** panel appears: enter `user@soilhive.local` (the plain [demo `user` account](#demo-user-accounts)'s email) under **Enter email/s** and click **Add**, then **Publish**. This works even though that account has never touched the platform before — access is granted by email, not by an existing user record.

> If no Terms & Conditions or Privacy Policy have been configured yet (true on a fresh instance unless you set them up in step 1), **Publish** shows a warning about it — click **Proceed anyway** to continue.

### 4. Check what each account can see

Log out and back in as the plain `user` account: even though the dataset is private, it can now preview and download it, because its email was granted access in step 3. Log out entirely (or open an incognito window) and browse the same dataset anonymously: its metadata is still visible — private datasets are always discoverable — but preview and download are unavailable, since an anonymous visitor was never granted access.

## Post-setup validation

After `docker compose up -d`, a quick way to confirm everything is wired correctly:

- [ ] http://localhost:8080/admin/master/console/ loads the Keycloak admin login
- [ ] http://localhost:4001/docs/ loads the backend's Swagger UI
- [ ] `curl http://localhost:4001/api/v1/auth/config` returns `{"authMode":"oidc", ...}`
- [ ] http://localhost:3000/ loads the frontend and shows the map/search view
- [ ] Clicking **Login** and signing in as `data-admin` redirects back to the app and shows the **Admin console** option in the account menu

## Troubleshooting

- **Backend container exits on startup with `ECONNREFUSED` to Postgres.** On a fresh `docker compose up -d`, the `backend` service can start before `postgis` is actually ready to accept connections (`depends_on` only waits for the container to start, not for the database to be reachable). Run `docker compose up -d backend` again to restart just that service once Postgres is up.
- **Login redirects to an error page, or Keycloak rejects the redirect URI.** This usually means the frontend isn't reachable at `http://localhost:3000` (e.g. you changed the published port). Update `OIDC_REDIRECT_URI`, `OIDC_POST_LOGOUT_REDIRECT_URI`, and `OIDC_SILENT_REDIRECT_URI` in `docker-compose.yml`, and `redirectUris` in [quickstart-sample-data/soilhive-realm.json](../quickstart-sample-data/soilhive-realm.json), to match — then recreate the `keycloak` container so the change takes effect (existing realm data isn't overwritten by the import, only by dropping the `postgis_data` volume).
- **One of the ports (`3000`, `4001`, `5432`, `8080`) is already in use.** Stop whatever else is using it, or change the left-hand side of the corresponding `ports:` mapping in `docker-compose.yml` (only the frontend's port also requires the OIDC redirect URI updates above).
- **Starting over.** `docker compose down -v` removes containers and the Postgres volume (which also holds the Keycloak realm data), so the next `docker compose up -d` starts completely fresh, including re-importing the `soilhive` realm.

## Next steps

- [Authentication](authentication.md): authentication modes and configuration in more depth
- [Keycloak setup](keycloak-setup.md): how the `soilhive` realm/client were built, or how to set up your own
- [Frontend](frontend.md) / [Backend](backend.md): running and developing each service outside of Docker
- [Data Management Portal](data-model/1-data-management-portal.md): the full data upload/harmonization/publication workflow
- [Map based filters](map-based-filters.md): configuring the map's filter options
- [Bare metal install](bare-metal-install.md): running the platform without containers