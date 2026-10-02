import { NextResponse, type NextRequest } from "next/server";

/**
 * A first, CHEAP check: no session cookie at all = go to the login screen without rendering anything.
 * It is only a convenience. It does NOT prove the cookie is valid: every page and every action
 * verifies the session against the database (src/server/auth.ts). Never rely on this file for security.
 */
export function proxy(request: NextRequest) {
  if (!request.cookies.has("session")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  // Everything except the login screen, the scheduled job (it has its own secret), and Next.js internals.
  matcher: ["/((?!login|api/jobs|api/health|_next/static|_next/image|favicon.ico).*)"],
};
