# TRC Daily Report

Software Developed by Muhammad Amir · MT# MT1063
© 2026 Muhammad Amir. All rights reserved.

Certified Electronics and Electrical Technician
Electrical License CLN-NQ-***6092
Electronics License CLN-COC-***204

React (Vite) frontend + Node/Express API + PostgreSQL, deployed on Railway.

```
client/   Vite + React 19 frontend
server/   Express API + Prisma (PostgreSQL)
```

## First-time local setup

You need Node 22+, git, and PostgreSQL running locally (both already installed).

```bash
# 1. Create the local database
psql -U postgres -c "CREATE DATABASE trc_daily_report;"

# 2. Point server/.env at it (edit DATABASE_URL with your postgres password)

# 3. Install dependencies
cd client && npm install
cd ../server && npm install

# 4. Create the tables
cd server && npm run migrate:dev
```

## Daily development

Two terminals:

```bash
cd server && npm run dev     # API on http://localhost:3000
cd client && npm run dev     # UI  on http://localhost:5173
```

Open http://localhost:5173. The Vite dev server proxies `/api/*` to the API,
so there is no CORS setup in development.

Useful:

| Command | Where | What it does |
| --- | --- | --- |
| `npm run dev` | both | dev server with auto-reload |
| `npm test` | server | run the API tests |
| `npm run migrate:dev` | server | create + apply a new migration locally |
| `npm run studio` | server | browse the local database in a GUI |
| `npm run build` | client | production build |
| `npm run preview` | client | serve the production build locally |

## Environments

| | Local | Railway |
| --- | --- | --- |
| Database | local Postgres 17 | Railway Postgres service |
| API URL | `http://localhost:3000` | Railway service URL |
| Frontend | `http://localhost:5173` | Railway static site |

**Never point your local `.env` at the Railway production database.** A stray
`migrate` or delete against production is the fastest way to lose real data.

## Environment variables

`server/.env` (local, gitignored — see `.env.example`):

- `DATABASE_URL` — local Postgres connection string
- `PORT` — 3000 locally; Railway injects its own
- `NODE_ENV` — `development` locally, `production` on Railway

`client/.env.local`:

- `VITE_API_URL` — empty locally (proxy handles it), the API URL on Railway

> Anything prefixed `VITE_` is compiled into the JavaScript bundle and is
> **publicly readable in the browser**. Never put a secret there. Vite bakes
> these in at *build* time, so on Railway it must be set as a build variable.

## Railway deployment

Three services in one project, all from this repo:

1. **Postgres** — add from the Railway dashboard.
2. **API** — root directory `server`
   - Variables: `DATABASE_URL=${{Postgres.DATABASE_URL}}`, `NODE_ENV=production`
   - Start command: `npm run migrate:deploy && npm start`
   - Healthcheck path: `/health`
3. **Frontend** — root directory `client`
   - Build variable: `VITE_API_URL=https://<your-api>.up.railway.app`
   - Build command: `npm run build`, output directory `dist`

Use `migrate:deploy` in production, never `migrate:dev` — `dev` can reset data.

Turn on **database backups** in the Postgres service settings before you have
real users.

## Workflow

1. `git checkout -b feature/my-change`
2. Build and test locally against the local database
3. `npm test` in `server/`
4. Commit and push the branch
5. Open a PR — Railway builds a PR environment with its own database; click through it
6. Merge to `main` — Railway deploys production
7. Check the live site and the deploy logs
