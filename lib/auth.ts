import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { safeEqual, SESSION_COOKIE, sessionToken } from "./session";

export * from "./session";

export async function isAuthed() {
  const value = (await cookies()).get(SESSION_COOKIE)?.value;
  return !!value && safeEqual(value, sessionToken());
}

export async function requireAuth() {
  if (!(await isAuthed())) redirect("/login");
}
