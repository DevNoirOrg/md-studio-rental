import { createHash } from "node:crypto";

// Vékony REST-kliens a Supabase PostgREST felületéhez (service-role kulccsal, csak szerveren).

export class BookingStoreError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

interface StoreOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  returnRepresentation?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function bookingStore<T = any>(
  path: string,
  { method = "GET", body, returnRepresentation = false }: StoreOptions = {},
): Promise<T> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new BookingStoreError("Booking database configuration missing.", 503);
  }
  const response = await fetch(`${url.replace(/\/$/, "")}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(returnRepresentation ? { Prefer: "return=representation" } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (response.status === 204) return null as T;
  const result = await response.json();
  if (!response.ok) {
    throw new BookingStoreError("Booking database request failed.", response.status, result.code);
  }
  return result as T;
}

export function decisionInput(input: unknown) {
  const i = input as { token?: unknown; action?: unknown; slot?: unknown } | null;
  if (!i || typeof i.token !== "string" || !/^[a-f0-9]{64}$/.test(i.token) ||
      typeof i.action !== "string" || !["approve", "reject", "approve-all"].includes(i.action) ||
      (i.action !== "approve-all" &&
        (typeof i.slot !== "string" || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(i.slot)))) {
    return null;
  }
  return {
    p_token_hash: tokenHash(i.token),
    p_action: i.action,
    p_slot_id: i.action === "approve-all" ? null : (i.slot as string),
  };
}
