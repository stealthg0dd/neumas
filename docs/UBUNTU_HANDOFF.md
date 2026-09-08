# Ubuntu build handoff

Use `main` from `https://github.com/stealthg0dd/neumas.git`. The active services
are `neumas-web` (Next.js) and `neumas-backend` (FastAPI/Celery).
`neumas-web-vite` is legacy.

## Get the source

```bash
git clone https://github.com/stealthg0dd/neumas.git
cd neumas
```

For an existing clean checkout, use `git switch main` and `git pull --ff-only origin main`.
Check `git status --short` before updating; preserve any Ubuntu-local work first.

## Native build

Prerequisites: Git, Node.js 22, pnpm 10.33.0, uv, Python 3.12, and Redis for
running the API and workers. Install the build tools for Python native extensions
if needed (`build-essential`, `libpq-dev`). Do not copy macOS `node_modules`,
virtual environments, or `.next` output to Ubuntu.

From the repository root:

```bash
corepack enable
corepack prepare pnpm@10.33.0 --activate
cd neumas-web
corepack pnpm@10.33.0 install --frozen-lockfile
cd ../neumas-backend
uv python install 3.12
uv sync --locked --extra dev --python 3.12
uv build
cd ..
```

## Environment configuration

Create the files only when they do not already exist:

```bash
test -f neumas-web/.env.local || cp neumas-web/.env.example neumas-web/.env.local
test -f neumas-backend/.env || cp neumas-backend/.env.example neumas-backend/.env
```

Populate the Supabase values from your secret store or existing deployment.
For a local stack, set the web variables `NEXT_PUBLIC_APP_URL=http://localhost:3000`,
`NEXT_PUBLIC_API_URL=/api`, and `BACKEND_URL=http://127.0.0.1:8000`.
Use your actual web origin if accessing the Ubuntu host remotely, and configure
the backend CORS origins and OAuth redirect URL to match.

Set backend `REDIS_URL=redis://localhost:6379/0`. AI features need the configured
provider keys; `DEV_MODE=true` enables development stubs for LLM calls but does
not replace Supabase. Configure web public variables before building because
they are included in the browser bundle.

Local `.env` files and Supabase CLI `.temp` metadata are deliberately excluded
from Git. At handoff, the Mac has `neumas-web/.env.local`, but no
`neumas-backend/.env`; Git alone does not transfer runtime configuration.

## Build and verify

```bash
cd neumas-web
corepack pnpm@10.33.0 run build
corepack pnpm@10.33.0 test
cd ../neumas-backend
uv run --locked --extra dev pytest tests/ --ignore=tests/manual -q
cd ..
```

Run Redis, then start each service in a separate terminal:

```bash
cd neumas-backend
uv run --locked uvicorn app.main:app --host 0.0.0.0 --port 8000
```

```bash
cd neumas-backend
uv run --locked bash start_worker.sh
```

```bash
cd neumas-web
corepack pnpm@10.33.0 start
```

Verify `http://localhost:8000/health`, `http://localhost:8000/ready`, and
`http://localhost:3000/api/health`. A successful build does not verify Supabase
schema state, credentials, or worker processing. For a new database, follow
the canonical schema and migration instructions in `DEPLOYMENT.md`; do not
reinitialize an existing database.

## Docker status

The root Compose configuration has not been validated for this handoff.
Docker Desktop was not running on the Mac. Use the native instructions above
for the verified build path. Before using Compose, review its web build-time
environment, set the internal proxy `BACKEND_URL=http://api:8000` with public
API base `/api`, and align worker queues with `neumas-backend/start_worker.sh`.

## Verification scope

The source commit before this handoff (`8b7c297`) passed frontend build/type
checks and backend tests on GitHub's Ubuntu CI runner:
https://github.com/stealthg0dd/neumas/actions/runs/31614630120

Local handoff checks on 2026-09-08: backend locked dependency installation on
Python 3.12, Linux x86_64 dependency-resolution dry run, source/wheel build,
and Ruff passed. Backend tests: 204 passed, 2 skipped. Frontend tests: 39 passed.
The Next.js production build, including TypeScript checks and generation of
67 static pages, passed with placeholder public Supabase build variables and
Sentry uploads disabled. Rebuild on Ubuntu with its actual environment values.

The destination `ctech@ctech` refused SSH connections on port 22. It has not
been inspected. Confirm its checkout, dependencies, environment, build, and
health checks before calling it ready.
