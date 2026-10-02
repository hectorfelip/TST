# Browser tests (end to end)

They drive a REAL browser against a REAL running app and a REAL PostgreSQL: login, a whole day of work,
permissions, sessions that die, the daily job. They are slower than the unit tests (about 1 minute each) and
need a fresh demo database each time, because they change data.

```bash
# 1. a PostgreSQL with the demo data (see README: db:migrate, db:seed)
# 2. build and start the app with DATABASE_URL, DATABASE_ADMIN_URL, SESSION_SECRET, CRON_SECRET set
npm run build && npx next start -p 3100
# 3. run (needs the `playwright` package and a Chromium)
CHROME_PATH=/path/to/chrome PLAYWRIGHT_MODULES=/path/to/node_modules/ CRON_SECRET=... node e2e/day-flow.mjs
# reset the database (db:seed again) before running the second one
CHROME_PATH=... PLAYWRIGHT_MODULES=... node e2e/rules-and-sessions.mjs
```

`day-flow.mjs`: owner and barber for a whole day (open comanda, items, payment, expense, reports, close the register,
logout, daily job). `rules-and-sessions.mjs`: stock question, scheduling, no-show, client rules, settings, deactivated
person thrown out on the next request, password reset and change.
