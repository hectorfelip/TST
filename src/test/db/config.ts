/**
 * Where the test PostgreSQL is. Any empty PostgreSQL >= 15 where the user can
 * create databases and roles works (set TEST_DATABASE_URL). Without it, the
 * sandbox script `scripts/test-db.sh` provides one on port 54329.
 */
export const ADMIN_URL = process.env.TEST_DATABASE_URL ?? "postgres://postgres@127.0.0.1:54329/postgres";
export const TEMPLATE_DB = "tst_template";
export const APP_PASSWORD = "app_user_test";

export function urlFor(database: string, user?: string, password?: string): string {
  const url = new URL(ADMIN_URL);
  url.pathname = `/${database}`;
  if (user) {
    url.username = user;
    url.password = password ?? "";
  }
  return url.toString();
}
