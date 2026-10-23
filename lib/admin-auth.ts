import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Egyszerű admin-belépés: felhasználónév + jelszó környezeti változóból, aláírt (HMAC) session-süti.

export const adminCookie = "md_admin_session";
export const sessionLifetime = 60 * 60 * 8;
const developmentSecret = randomBytes(32).toString("hex");

function config() {
  const { ADMIN_USERNAME: username, ADMIN_PASSWORD: password, ADMIN_SESSION_SECRET } = process.env;
  const secret = ADMIN_SESSION_SECRET ||
    (process.env.NODE_ENV !== "production" ? developmentSecret : "");
  if (!username || !password || !secret) {
    throw new Error("Admin authentication is not configured.");
  }
  return { username, password, secret };
}

function equal(a: string, b: string): boolean {
  return timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());
}

export function checkAdminCredentials(username: string, password: string): boolean {
  const expected = config();
  const validUsername = equal(username, expected.username);
  const validPassword = equal(password, expected.password);
  return validUsername && validPassword;
}

export function createAdminSession(now: number = Date.now()): string {
  const { secret, username, password } = config();
  const payload = `${Math.floor(now / 1000) + sessionLifetime}.${randomBytes(24).toString("hex")}`;
  const signature = createHmac("sha256", secret).update(JSON.stringify([payload, username, password])).digest("hex");
  return `${payload}.${signature}`;
}

export function validAdminSession(token: unknown, now: number = Date.now()): boolean {
  if (typeof token !== "string" || !/^\d{10}\.[a-f0-9]{48}\.[a-f0-9]{64}$/.test(token)) return false;
  const [expires, nonce, signature] = token.split(".");
  if (Number(expires) <= Math.floor(now / 1000) ||
      Number(expires) > Math.floor(now / 1000) + sessionLifetime) return false;
  const { secret, username, password } = config();
  const expected = createHmac("sha256", secret)
    .update(JSON.stringify([`${expires}.${nonce}`, username, password])).digest("hex");
  return equal(signature, expected);
}
