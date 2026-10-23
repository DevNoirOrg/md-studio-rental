import test from "node:test";
import assert from "node:assert/strict";
import { checkAdminCredentials, createAdminSession, validAdminSession, sessionLifetime } from "../lib/admin-auth.ts";

test("admin credentials and signed, expiring sessions are checked on the server", () => {
  const keys = ["ADMIN_USERNAME", "ADMIN_PASSWORD", "ADMIN_SESSION_SECRET"];
  const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try {
    Object.assign(process.env, {
      ADMIN_USERNAME: "test-admin", ADMIN_PASSWORD: "test-password",
      ADMIN_SESSION_SECRET: "test-only-session-secret-not-for-deployment",
    });
    assert.equal(checkAdminCredentials("test-admin", "test-password"), true);
    assert.equal(checkAdminCredentials("wrong", "test-password"), false);
    assert.equal(checkAdminCredentials("test-admin", "wrong"), false);
    const now = Date.now();
    const session = createAdminSession(now);
    assert.equal(validAdminSession(session, now), true);
    assert.equal(validAdminSession(undefined, now), false);
    assert.equal(validAdminSession("forged", now), false);
    assert.equal(validAdminSession(`${session.slice(0, -1)}${session.endsWith("0") ? "1" : "0"}`, now), false);
    assert.equal(validAdminSession(session, now + sessionLifetime * 1000), false);
    process.env.ADMIN_PASSWORD = "changed-password";
    assert.equal(validAdminSession(session, now), false);
    delete process.env.ADMIN_PASSWORD;
    assert.throws(() => checkAdminCredentials("test-admin", "test-password"), /not configured/);
  } finally {
    for (const key of keys) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  }
});
