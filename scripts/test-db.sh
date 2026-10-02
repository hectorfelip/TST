#!/usr/bin/env bash
# Starts / stops a throw-away PostgreSQL for the database tests.
#   scripts/test-db.sh start | stop | status
# Needs the PostgreSQL *server* package (Linux: `apt install postgresql`).
# Elsewhere (macOS, Windows, CI) point TEST_DATABASE_URL to any empty
# PostgreSQL >= 15 where you can create databases, and skip this script.
set -euo pipefail

PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -n "$PGBIN" ] || { echo "PostgreSQL server binaries not found. Set TEST_DATABASE_URL instead." >&2; exit 1; }
DATA="${TEST_PGDATA:-/var/lib/postgresql/tst-test-data}"
PORT="${TEST_PGPORT:-54329}"

# PostgreSQL refuses to run as root: run as the `postgres` user when needed.
as_pg() { if [ "$(id -u)" = "0" ]; then runuser -u postgres -- "$@"; else "$@"; fi; }

case "${1:-}" in
  start)
    if as_pg "$PGBIN/pg_ctl" -D "$DATA" status >/dev/null 2>&1; then echo "already running on port $PORT"; exit 0; fi
    [ -d "$DATA" ] || as_pg "$PGBIN/initdb" -D "$DATA" -A trust -U postgres >/dev/null
    # fsync off: this database only lives for the tests.
    as_pg "$PGBIN/pg_ctl" -D "$DATA" -o "-p $PORT -k /tmp -c listen_addresses=127.0.0.1 -c fsync=off -c max_connections=200" -l "$DATA/server.log" -w start >/dev/null
    echo "started on 127.0.0.1:$PORT"
    ;;
  stop)   as_pg "$PGBIN/pg_ctl" -D "$DATA" -m fast stop ;;
  status) as_pg "$PGBIN/pg_ctl" -D "$DATA" status ;;
  *) echo "usage: $0 start|stop|status" >&2; exit 2 ;;
esac
