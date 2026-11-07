import { emailPattern } from "./studio-booking.ts";

/*
  E-mail küldés (Resend). A stúdiónak és az ügyfeleknek küldött levelek is innen mennek.
    RESEND_API_KEY, RESEND_FROM_EMAIL — a küldő fiók
    BOOKING_NOTIFICATION_EMAIL        — a stúdió címe (új igény, fizetés, lejárat)
    STUDIO_REPLY_TO_EMAIL             — az ügyfél-e-mailekre adott válasz címe
                                        (alapból info.mddancestudio@gmail.com)
*/

export const studioReplyTo = () => process.env.STUDIO_REPLY_TO_EMAIL?.trim() || "info.mddancestudio@gmail.com";

export function studioRecipient(): string | null {
  const recipient = process.env.BOOKING_NOTIFICATION_EMAIL?.trim();
  return recipient && recipient.length <= 254 && new RegExp(`^${emailPattern}$`).test(recipient) ? recipient : null;
}

export function mailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY && !!process.env.RESEND_FROM_EMAIL;
}

export interface Mail {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}

/** Elküld egy e-mailt; hibánál kivételt dob (a hívó dönti el, mi legyen). */
export async function sendMail(mail: Mail): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) throw new Error("Az e-mail küldés nincs beállítva (RESEND_API_KEY / RESEND_FROM_EMAIL).");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from, to: [mail.to], subject: mail.subject, html: mail.html, text: mail.text,
      ...(mail.replyTo ? { reply_to: mail.replyTo } : {}),
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const result = (await response.json().catch(() => ({}))) as { id?: string; name?: string; message?: string };
  if (!response.ok || !result.id) throw new Error(`E-mail küldés sikertelen (${response.status}): ${result.message ?? result.name ?? ""}`);
}
