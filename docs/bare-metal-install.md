# Bare-metal installation

This guide covers running all platform services directly on the host without Docker.

---

## Dependency overview

| Dependency | Minimum version | Notes |
|---|---|---|
| Node.js | **24.x** | LTS; backend and frontend |
| pnpm | **10.x** | Monorepo package manager |
| PostgreSQL | **16.x** | 17+ recommended |
| PostGIS | **3.4** | Must match the installed PostgreSQL major version |
| GDAL | **3.6** | Required by the backend `gdal-async` native module |

---

## 1. PostgreSQL + PostGIS

### Install

**macOS (Homebrew)**
```sh
brew install postgresql@17 postgis
brew services start postgresql@17
```

**Ubuntu / Debian**
```sh
sudo apt install postgresql postgresql-contrib postgis postgresql-17-postgis-3
sudo systemctl enable --now postgresql
```

### Create the database and user

```sql
-- Connect as the postgres superuser
psql -U postgres

CREATE USER dbuser WITH PASSWORD 'dbpass';
CREATE DATABASE database OWNER dbuser;
\c database
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_raster;
\q
```

> The schema (`soilhive` by default) and any PostGIS extensions scoped to it are
> created automatically by the TypeORM migration on first run.

---

## 2. GDAL

The backend links against the system GDAL shared library via the `gdal-async` native module. The library must be present before running `npm install`.

**macOS**
```sh
brew install gdal
```

**Ubuntu / Debian**
```sh
sudo apt install libgdal-dev gdal-bin
```

Verify:
```sh
gdal-config --version   # should print 3.x.x
```

---

## 3. Backend

### Prerequisites
- Node.js 24
- GDAL installed (step 2 above)

### Install

```sh
cd backend
cp .env-example .env   # then edit .env — see section 5
npm install --build-from-source --shared_gdal
```

The `--build-from-source --shared_gdal` flags compile `gdal-async` against the
system GDAL library instead of bundling its own.

### Run migrations

```sh
npm run build
npm run typeorm migration:run -- -d dist/utils/migrations-data-source.js
```

### Start

```sh
# Development (hot-reload via nodemon)
npm run dev

# Production
npm run build && npm run start
```

The server listens on **http://localhost:4001** by default (`PORT` env var overrides).
Swagger docs are available at `/api/docs`.

---

## 4. Frontend

### Prerequisites
- Node.js 24
- pnpm (`npm install -g pnpm`)

### Install

From the repo root (installs all workspace packages):
```sh
pnpm install -r
```

### Configure runtime environment

Create `frontend/public/env-config.js` (only needed for local development — in
production the Express server generates this file from OS env vars at startup):

```js
window._env_ = {
  BACKEND_BASE_URL: 'http://localhost:4001',
  MAPBOX_ACCESS_TOKEN: '',   // leave empty to disable map tiles
  GTM_CONTAINER_ID: '',      // optional Google Tag Manager container ID
  COOKIE_DOMAIN: '',         // optional cookie domain override
};
```

### Start

```sh
# Development (Rsbuild watch + Express SSR server)
cd frontend
pnpm dev
# or from the repo root: pnpm run dev

# Production
pnpm build
pnpm start
# or with explicit env vars:
BACKEND_BASE_URL=https://api.example.com MAPBOX_ACCESS_TOKEN=pk.xxx pnpm start
```

The server listens on **http://localhost:3000** (`PORT` env var overrides).

---

## 5. Backend configuration (`.env`)

Copy `backend/.env-example` to `backend/.env` and set values:

```dotenv
# ── Server ────────────────────────────────────────────────────────────────────
CORS_ORIGINS=http://localhost:3000
PORT=4001                          # optional, default 4001
JSON_PAYLOAD_LIMIT=4MB

# ── Database ──────────────────────────────────────────────────────────────────
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=database
POSTGRES_USER=dbuser
POSTGRES_PASSWORD=dbpass
POSTGRES_SCHEMA=soilhive

# ── Authentication ────────────────────────────────────────────────────────────
# Mode is inferred from which variables are present (OIDC takes precedence).
# See docs/authentication.md for full details.

## Password mode — both hashes + secret required
SUPER_ADMIN_PASSWORD_HASH=$2a$10$OaWUPUR7csoiBYqzp3jq8.s336/WXRvMIWGFluF3BvO/6l/0TYHMq
DATA_ADMIN_PASSWORD_HASH=$2a$10$.oAbT7ZPV75DAhmYTSgW3ucDSFj00wvN/R.bq8.4Y1gL.aQxYAMQ2
SELF_SIGNING_SECRET=put-any-random-string-here

## OIDC mode — overrides password mode when set
# OIDC_AUTHORITY=https://<keycloak-host>/realms/<realm>
# OIDC_CLIENT_ID=soilhive
# OIDC_REDIRECT_URI=http://localhost:3000/admin
# OIDC_POST_LOGOUT_REDIRECT_URI=http://localhost:3000
# OIDC_SILENT_REDIRECT_URI=http://localhost:3000
# OIDC_SCOPE=openid

# ── Storage ───────────────────────────────────────────────────────────────────
## local filesystem (default for bare-metal)
STORAGE_MODE=local
LOCAL_STORAGE_ROOT_FOLDER=/tmp/soilhive-storage

## S3 (set STORAGE_MODE=s3 and fill in the fields below)
# STORAGE_MODE=s3
# S3_STORAGE_REGION=eu-central-1
# S3_STORAGE_BUCKET=my-bucket
# S3_STORAGE_ROOT_FOLDER=soilhive

# ── Logging ───────────────────────────────────────────────────────────────────
LOG_LEVEL=info    # debug | info | warn | error
```

The default hashes in `.env-example` correspond to the passwords `superadmin`
(super-admin) and `dataadmin` (data-admin). Change them for any non-local environment.

---

## 6. Authentication modes

| Mode | When active | What it enables |
|---|---|---|
| `none` | No auth variables set | Read-only; all write endpoints are blocked |
| `password` | `SUPER_ADMIN_PASSWORD_HASH` + `DATA_ADMIN_PASSWORD_HASH` + `SELF_SIGNING_SECRET` set | Simple two-role auth |
| `oidc` | Any `OIDC_*` variable set | Full OIDC via external IdP (Keycloak or any provider) |

OIDC takes precedence over password when both are configured.
See [docs/authentication.md](authentication.md) and [docs/keycloak-setup.md](keycloak-setup.md).

---

## 7. Optional: Keycloak (OIDC provider)

If you want OIDC authentication without Docker, download and run Keycloak directly:

1. Download Keycloak from https://www.keycloak.org/downloads
2. Start it in dev mode (uses embedded H2 database):
   ```sh
   bin/kc.sh start-dev --http-port=8080
   ```
3. Open http://localhost:8080, create a realm, a client, and a user.
4. Set the `OIDC_*` backend env vars as described in step 5.

See [docs/keycloak-setup.md](keycloak-setup.md) for the full configuration walkthrough.

---

## 8. Optional: S3-compatible storage (MinIO)

For local development with S3 storage without Docker, download and run MinIO directly:

**macOS (Homebrew)**
```sh
brew install minio/stable/minio
minio server /tmp/minio-data --console-address ":9001"
```

**Linux**
```sh
wget https://dl.min.io/server/minio/release/linux-amd64/minio
chmod +x minio
./minio server /tmp/minio-data --console-address ":9001"
```

MinIO listens on **http://localhost:9000** (API) and **http://localhost:9001** (web console).
Default credentials: `minioadmin` / `minioadmin`.

Create the bucket via the console or CLI:
```sh
# Install the MinIO client
brew install minio/stable/mc   # macOS
# or: wget https://dl.min.io/client/mc/release/linux-amd64/mc && chmod +x mc

mc alias set local http://localhost:9000 minioadmin minioadmin
mc mb local/soilhive-local
```

Then set in `.env`:
```dotenv
STORAGE_MODE=s3
S3_STORAGE_REGION=us-east-1
S3_STORAGE_BUCKET=soilhive-local
S3_STORAGE_ROOT_FOLDER=data
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadmin
S3_FORCE_PATH_STYLE=true
```

---

## 9. Startup order

Services must start in this order because later ones depend on earlier ones:

1. **PostgreSQL + PostGIS** — database must be reachable
2. **Backend** — runs migrations on first start, exposes API on `:4001`
3. **Frontend** — connects to backend at `BACKEND_BASE_URL`
4. **Keycloak** *(optional)* — can start in parallel with the backend

---

## 10. Verification

| Check | Command / URL |
|---|---|
| PostgreSQL running | `psql -U dbuser -d database -c "SELECT PostGIS_Version();"` |
| Backend health | `curl http://localhost:4001/health` |
| API docs | http://localhost:4001/api/docs |
| Frontend health | `curl http://localhost:3000/health` |
| Frontend UI | http://localhost:3000 |
