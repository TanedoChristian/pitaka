import { NextResponse, type NextRequest } from "next/server";
import { safeEqual, SESSION_COOKIE, sessionToken } from "@/lib/session";

// Guards every page and server action. /api/ingest has its own bearer-secret check.
export function proxy(req: NextRequest) {
  const value = req.cookies.get(SESSION_COOKIE)?.value;
  if (value && safeEqual(value, sessionToken())) return NextResponse.next();
  return NextResponse.redirect(new URL("/login", req.url));
}

export const config = {
  matcher: ["/((?!login|api/ingest|_next/static|_next/image|icon.svg|manifest.webmanifest|favicon.ico).*)"],
};
