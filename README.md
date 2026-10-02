# Barbershop Management — MVP

A system for small barbershops to control finance, stock, clients, employees
and services.

## Roadmap

Each step is reviewed and approved before the next one starts.

| Step | Topic | Document | Status |
|------|-------|----------|--------|
| 1 | Structure | [docs/01-structure.md](docs/01-structure.md) | ✅ Approved |
| 2 | Interface | [docs/02-interface.md](docs/02-interface.md) · [demo guide](docs/02-demo-guide.md) | ✅ Approved (owner test still pending) |
| 3 | Rules | [docs/03-rules.md](docs/03-rules.md) | ✅ Approved |
| 4 | Data | [docs/04-data.md](docs/04-data.md) | ✅ Approved |
| 5 | Communication | [docs/05-communication.md](docs/05-communication.md) | Draft — waiting for approval |
| 6 | Review | — | Not started |

## Running locally

```bash
npm install
npm run dev          # http://localhost:3000 (needs the database below and .env.local)
npm test             # unit tests of the rules (fast, no database)
npm run typecheck
npm run lint
```

### Database (step 4)

PostgreSQL 15 or newer. Copy `.env.example` to `.env.local` and fill it in.

```bash
npm run db:migrate                 # creates / updates the tables (DATABASE_ADMIN_URL)
npm run db:create-barbershop -- "Barbearia X" "Nome do Dono" dono@email.com   # prints the owner's first password once
npm run db:set-password -- pessoa@email.com   # rescue: a new password for someone
npm run db:seed                    # a demo barbershop with a whole day of data (login: carlos@exemplo.com / demonstracao-1)
npm run db:backup                  # a full copy of the database in one file (schedule it daily; see docs/04-data.md section 13)
```

Tests against a **real** PostgreSQL (each test file gets its own database):

```bash
npm run db:test-start   # Linux sandbox: starts a throw-away PostgreSQL on port 54329
npm run test:db         # or point TEST_DATABASE_URL to any empty PostgreSQL >= 15
npm run test:all        # unit + database tests
```

### Running the app (step 5)

Fill `.env.local` (see `.env.example`: `DATABASE_URL`, `DATABASE_ADMIN_URL`, `SESSION_SECRET`, `CRON_SECRET`), migrate, seed, then:

```bash
npm run dev
```

Log in with `carlos@exemplo.com` (owner) or `rafael@exemplo.com` (barber), password `demonstracao-1`.
The daily job: `GET /api/jobs/expiry` with `Authorization: Bearer <CRON_SECRET>`, once a day.
Browser tests against the running app: [e2e/README.md](e2e/README.md).
