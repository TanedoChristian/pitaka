import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "pitaka_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function env(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

/** Constant-time string compare (hashes first so lengths always match). */
export function safeEqual(a: string, b: string) {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

// The session token is derived from the password, so changing APP_PASSWORD
// logs out every device.
export function sessionToken() {
  return createHmac("sha256", env("SESSION_SECRET"))
    .update(`pitaka:${env("APP_PASSWORD")}`)
    .digest("hex");
}

export function checkPassword(input: string) {
  return safeEqual(input, env("APP_PASSWORD"));
}
