# SalePOS License Backend (Minimal Starter)

This is a minimal Node/Express backend for SalePOS trial + entitlement checks.

## Features

- 5-day trial (server-side, reinstall-safe by account token)
- Device slot tracking with deactivation endpoint
- Plan-based device caps for purchases (`starter=3`, `business=5`, `pro=10`)
- Purchase verify endpoint stub (replace with Google Play verification later)
- Configurable persistence backend:
  - Firestore (`STORAGE_BACKEND=firestore`) for production/free-tier-safe persistence
  - JSON file (`STORAGE_BACKEND=json`) for local development

## Endpoints

- `GET /health`
- `POST /v1/license/entitlement`
- `GET /v1/license/devices`
- `POST /v1/license/devices/:deviceId/deactivate`
- `POST /v1/license/verify-purchase`

All license endpoints require:

```text
Authorization: Bearer <firebase-id-token or dev token>
```

## Quick start

1. Copy env file:

```bash
cp .env.example .env
```

2. Install and run:

```bash
npm install
npm start
```

3. Optional local validation:

```bash
npm run smoke
```

## Run with Docker

From `license-backend/`:

```bash
docker build -t salepos-license-backend .
docker run --rm -p 8080:8080 --env-file .env salepos-license-backend
```

## Production notes

- Set `ENFORCE_FIREBASE_TOKEN=true`
- Provide Firebase Admin credentials via `GOOGLE_APPLICATION_CREDENTIALS`
- Set `FIREBASE_PROJECT_ID`
- Or set `FIREBASE_SERVICE_ACCOUNT_JSON` directly as a secret environment variable
- Use Firestore-backed storage in production:
  - `STORAGE_BACKEND=firestore`
  - `FIRESTORE_COLLECTION=licenseUsers`
- JSON fallback options for local/dev only:
  - `STORAGE_BACKEND=json`
  - `DATA_FILE=./data/db.json`
- `MAX_DEVICES` is still used as a fallback for trial users and unknown product IDs
- Optional plan overrides:
  - `STARTER_MAX_DEVICES=3`
  - `BUSINESS_MAX_DEVICES=5`
  - `PRO_MAX_DEVICES=10`
  - `STARTER_PRODUCT_IDS=salepos_starter`
  - `BUSINESS_PRODUCT_IDS=salepos_business,salepos_growth`
  - `PRO_PRODUCT_IDS=salepos_pro`
- Replace purchase verification stub in `/v1/license/verify-purchase` with Google Play Developer API validation

## One-click deploy (Render)

This folder already includes `render.yaml`.

1. Push your repository to GitHub.
2. Open Render and create a **Blueprint** deploy from your repo.
3. Render auto-detects `license-backend/render.yaml` and creates service `salepos-license-backend`.
4. Set secrets before first deploy:
   - `STORAGE_BACKEND=firestore`
   - `FIRESTORE_COLLECTION=licenseUsers`
   - `ENFORCE_FIREBASE_TOKEN=true`
   - `FIREBASE_PROJECT_ID=<your-firebase-project-id>`
   - `FIREBASE_SERVICE_ACCOUNT_JSON=<full service-account JSON as one line>`
5. Deploy and verify `GET /health` returns `ok: true`.

Optional quick link format after your repo is public:

```text
https://render.com/deploy?repo=<YOUR_GITHUB_REPO_URL>
```

## One-click deploy (Railway)

This folder already includes `railway.json` and `Dockerfile`.

1. Push your repository to GitHub.
2. In Railway, choose **Deploy from GitHub repo**.
3. Set root directory to `license-backend` if prompted.
4. Railway builds using Dockerfile and uses `/health` for health checks.
5. Set environment variables:
   - `ENFORCE_FIREBASE_TOKEN=true`
   - `FIREBASE_PROJECT_ID=<your-firebase-project-id>`
   - `FIREBASE_SERVICE_ACCOUNT_JSON=<full service-account JSON as one line>`
   - `TRIAL_DAYS=5`
   - `MAX_DEVICES=3`

After deploy, copy service URL and use it in Android `LICENSE_BASE_URL`.

## GitHub Actions auto-deploy on push to main

Workflow file added:

- `.github/workflows/deploy-license-backend.yml`

What it does:

1. Runs `npm ci` and `npm run smoke` inside `license-backend/`.
2. Triggers Render deploy hook if `RENDER_DEPLOY_HOOK_URL` secret exists.
3. Deploys via Railway CLI if Railway secrets exist.

Configure repository secrets in GitHub:

- `RENDER_DEPLOY_HOOK_URL` (optional, for Render)
- `RAILWAY_TOKEN` (optional, for Railway)
- `RAILWAY_PROJECT_ID` (optional, for Railway)
- `RAILWAY_SERVICE_ID` (optional, for Railway)
- `RAILWAY_ENVIRONMENT_ID` (optional, Railway environment)

If no deploy secrets are set, the workflow still runs validation only.

## Wire to Android app

Set `LICENSE_BASE_URL` in `app/build.gradle.kts` to your deployed backend URL, for example:

```kotlin
buildConfigField("String", "LICENSE_BASE_URL", "\"https://your-license-server.example.com/\"")
```

