/*
  Vékony Billingo API v3 kliens (REST) — csak szerveren.
    BILLINGO_API_KEY — a Billingo API kulcsa (Billingo → Beállítások → API)
  A kiállított számlát a Billingo automatikusan beküldi a NAV Online Számla rendszerébe,
  és a /documents/{id}/send hívással a saját e-mail sablonjával el is küldi a vevőnek.
*/

const API = "https://api.billingo.hu/v3";

export function billingoConfigured(): boolean {
  return !!process.env.BILLINGO_API_KEY?.trim();
}

async function billingoRequest<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const key = process.env.BILLINGO_API_KEY?.trim();
  if (!key) throw new Error("A Billingo nincs beállítva (BILLINGO_API_KEY).");
  let response: Response;
  try {
    response = await fetch(`${API}${path}`, {
      method,
      headers: { "X-API-KEY": key, Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new Error("A Billingo nem érhető el (hálózati hiba vagy időtúllépés).");
  }
  const result = (await response.json().catch(() => ({}))) as T & { error?: { message?: string }; message?: string; errors?: unknown };
  if (!response.ok) {
    const detail = result.error?.message ?? result.message ?? (result.errors ? JSON.stringify(result.errors) : "ismeretlen hiba");
    throw new Error(`Billingo hiba (${response.status}): ${String(detail).slice(0, 300)}`);
  }
  return result;
}

export interface BillingAddress {
  name: string;
  email: string;
  country: string;
  postCode: string;
  city: string;
  address: string;
  taxNumber?: string;
}

export interface InvoiceLine {
  name: string;
  /** Bruttó ár forintban (a stúdió árai bruttó árak). */
  grossPrice: number;
  /** Mennyiség órában. */
  hours: number;
}

/** A Billingo partner (vevő) adatai — magánszemélynél adószám nélkül, külföldinél FOREIGN. */
export function partnerPayload(billing: BillingAddress) {
  const country = (billing.country || "HU").toUpperCase();
  const taxcode = billing.taxNumber?.trim() || "";
  return {
    name: billing.name,
    address: { country_code: country, post_code: billing.postCode, city: billing.city, address: billing.address },
    emails: [billing.email],
    taxcode,
    tax_type: country !== "HU" ? "FOREIGN" : taxcode ? "HAS_TAX_NUMBER" : "NO_TAX_NUMBER",
  };
}

export function documentPayload(input: {
  partnerId: number;
  blockId: number;
  bankAccountId: number | null;
  vat: string;
  language: "hu" | "en";
  date: string;
  lines: InvoiceLine[];
  comment: string;
}) {
  return {
    partner_id: input.partnerId,
    block_id: input.blockId,
    ...(input.bankAccountId ? { bank_account_id: input.bankAccountId } : {}),
    type: "invoice",
    fulfillment_date: input.date,
    due_date: input.date,
    payment_method: "online_bankcard",
    language: input.language,
    currency: "HUF",
    electronic: false,
    paid: true,
    comment: input.comment,
    items: input.lines.map((line) => ({
      name: line.name.slice(0, 250),
      unit_price: Math.round((line.grossPrice / line.hours) * 100) / 100,
      unit_price_type: "gross",
      quantity: line.hours,
      unit: input.language === "en" ? "hour" : "óra",
      vat: input.vat,
    })),
  };
}

export async function createInvoice(input: {
  billing: BillingAddress;
  blockId: number;
  bankAccountId: number | null;
  vat: string;
  language: "hu" | "en";
  date: string;
  lines: InvoiceLine[];
  comment: string;
}): Promise<{ id: number; number: string | null }> {
  const partner = await billingoRequest<{ id: number }>("POST", "/partners", partnerPayload(input.billing));
  const document = await billingoRequest<{ id: number; invoice_number?: string | null }>(
    "POST", "/documents", documentPayload({ ...input, partnerId: partner.id }),
  );
  return { id: document.id, number: document.invoice_number ?? null };
}

/** A számla kiküldése a vevőnek a Billingo saját e-mailjével. */
export async function sendInvoice(documentId: number | string, email: string): Promise<void> {
  await billingoRequest("POST", `/documents/${encodeURIComponent(String(documentId))}/send`, { emails: [email] });
}

export interface BillingoOption {
  id: number;
  name: string;
}

/** Az adminban választható számlatömbök és bankszámlák. */
export async function listBillingoOptions(): Promise<{ blocks: BillingoOption[]; bankAccounts: BillingoOption[] }> {
  const [blocks, accounts] = await Promise.all([
    billingoRequest<{ data?: Array<{ id: number; name?: string; prefix?: string; type?: string }> }>("GET", "/document-blocks?per_page=100"),
    billingoRequest<{ data?: Array<{ id: number; name?: string; account_number?: string; currency?: string }> }>("GET", "/bank-accounts?per_page=100"),
  ]);
  return {
    blocks: (blocks.data ?? []).map((b) => ({ id: b.id, name: [b.name, b.prefix && `(${b.prefix})`, b.type].filter(Boolean).join(" ") })),
    bankAccounts: (accounts.data ?? []).map((a) => ({ id: a.id, name: [a.name, a.account_number, a.currency].filter(Boolean).join(" · ") })),
  };
}
