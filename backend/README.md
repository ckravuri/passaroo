# Passaroo Backend — Railway Deployment Guide

This directory is a deployable FastAPI service.

## Files used by Railway / Nixpacks

| File | Purpose |
|---|---|
| `requirements.txt` | Python dependencies (includes `emergentintegrations` from a private PyPI) |
| `nixpacks.toml` | Tells Nixpacks to add Emergent's `--extra-index-url` so `emergentintegrations` resolves |
| `Procfile` | Fallback start command if `nixpacks.toml` is ignored |
| `runtime.txt` | Pins Python 3.11 |
| `railway.json` | Railway service config (healthcheck, start cmd, restart policy) |
| `seed_atlas.py` | One-time idempotent DB seeder for Atlas (run locally after first deploy) |

## Required Railway environment variables

```
MONGO_URL=mongodb+srv://passaroo_app:<password>@cluster0.bh4ygeo.mongodb.net/passaroo?retryWrites=true&w=majority&appName=Cluster0
DB_NAME=passaroo
EMERGENT_LLM_KEY=sk-emergent-...
JWT_SECRET=<openssl rand -hex 32>
CORS_ORIGINS=*
```

Railway provides `PORT` automatically — do not hardcode it.

## Settings checklist (Railway dashboard → Service → Settings)

- **Root Directory**: `backend` (only if the repo also contains the frontend)
- **Builder**: Nixpacks (auto)
- **Healthcheck Path**: `/api/`
- **Generate Domain**: yes

## Smoke test after deploy

```bash
curl https://<your-railway-domain>/api/
# expect: {"app":"Passaroo","status":"ok"}
```

## First-time DB seeding (run locally, one-time)

```bash
cd /app/backend
MONGO_URL='mongodb+srv://...' DB_NAME=passaroo python3 seed_atlas.py
```
