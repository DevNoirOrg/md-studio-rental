import test from "node:test";
import assert from "node:assert/strict";
import { canonicalUrl, withBase } from "../lib/base-path.ts";
import { DECISION_PATH } from "../lib/booking-email.ts";

test("minden útvonal a /studio-berles alatt van, a kanonikus cím a hiphoptanciskola.com", () => {
  assert.equal(withBase("/"), "/studio-berles");
  assert.equal(withBase("/api/studio-bookings"), "/studio-berles/api/studio-bookings");
  assert.equal(canonicalUrl(), "https://www.hiphoptanciskola.com/studio-berles");
  assert.equal(canonicalUrl("/adatkezeles"), "https://www.hiphoptanciskola.com/studio-berles/adatkezeles");
  // a régi /studio-berles/dontes?… linkek ide irányítanak át (next.config.ts)
  assert.equal(DECISION_PATH, "/studio-berles/booking-review");
  assert.equal(new URL(DECISION_PATH, "https://www.hiphoptanciskola.com").href, "https://www.hiphoptanciskola.com/studio-berles/booking-review");
});
