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
| 4 | Data | [docs/04-data.md](docs/04-data.md) | Draft — waiting for approval |
| 5 | Communication | — | Not started |
| 6 | Review | — | Not started |

## Running locally

```bash
npm install
npm run dev          # http://localhost:3000 (the screens still use fake data until step 5)
npm test             # unit tests of the rules (fast, no database)
npm run typecheck
npm run lint
```

### Database (step 4)

PostgreSQL 15 or newer. Copy `.env.example` to `.env.local` and fill it in.

```bash
npm run db:migrate                 # creates / updates the tables (DATABASE_ADMIN_URL)
npm run db:create-barbershop -- "Barbearia X" "Nome do Dono" dono@email.com
npm run db:seed                    # a demo barbershop with a whole day of data
npm run db:backup                  # a full copy of the database in one file (schedule it daily; see docs/04-data.md section 13)
```

Tests against a **real** PostgreSQL (each test file gets its own database):

```bash
npm run db:test-start   # Linux sandbox: starts a throw-away PostgreSQL on port 54329
npm run test:db         # or point TEST_DATABASE_URL to any empty PostgreSQL >= 15
npm run test:all        # unit + database tests
```
