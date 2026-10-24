import { withBase } from "./base-path.ts";
import { endHour, formatBookingHour, type LessonType, type PricedSlot, type Customer } from "./studio-booking.ts";

// A stúdiónak küldött foglalási értesítő e-mail (HTML + szöveges), jóváhagyó/elutasító linkekkel.

// A basePath (/studio-berles) része az útvonalnak; az APP_BASE_URL csak a domain (pl. https://www.hiphoptanciskola.com).
export const DECISION_PATH = withBase("/dontes");

export interface EmailBooking {
  customer: Customer;
  slots: Array<PricedSlot & { id?: string }>;
  total: number;
  lessonType: LessonType;
}

const currency = new Intl.NumberFormat("hu-HU", {
  style: "currency", currency: "HUF", maximumFractionDigits: 0,
});
const dateFormat = new Intl.DateTimeFormat("hu-HU", {
  year: "numeric", month: "long", day: "numeric", timeZone: "Europe/Budapest",
});

function escapeHtml(value: unknown): string {
  const map: Record<string, string> = {
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  };
  return String(value).replace(/[&<>"']/g, (character) => map[character]);
}

// A link megnyitása nem módosít adatot; a céloldalon külön megerősítés szükséges.
function button(label: string, color: string, url: string): string {
  return `<a href="${escapeHtml(url)}" style="display:inline-block;margin:4px;padding:10px 16px;border-radius:8px;background:${color};color:#111;font-weight:bold;text-decoration:none">${label}</a>`;
}

export function buildBookingEmail(
  { customer, slots, total, lessonType }: EmailBooking,
  { token, baseUrl }: { token: string; baseUrl: string },
) {
  const actionUrl = (action: string, slot?: string) => {
    const url = new URL(DECISION_PATH, baseUrl);
    url.searchParams.set("token", token);
    url.searchParams.set("action", action);
    if (slot) url.searchParams.set("slot", slot);
    return url.href;
  };
  const lessonLabel = ({
    privat: "Privát óra",
    kiscsoportos: "Kiscsoportos óra",
    csoportos: "Csoportos óra",
  } as Record<LessonType, string>)[lessonType];
  const lines = slots.map((slot) => {
    const date = dateFormat.format(new Date(`${slot.date}T12:00:00Z`));
    const time = `${formatBookingHour(slot.hour)}–${formatBookingHour(endHour(slot))}`;
    return { ...slot, date, time, price: currency.format(slot.price) };
  });
  return {
    subject: `Új stúdiófoglalási igény – ${slots.length} időpont`,
    text: [
      "Új stúdiófoglalási igény – jóváhagyásra vár",
      `Óratípus: ${lessonLabel}`,
      `Név: ${customer.name}`, `E-mail: ${customer.email}`, `Telefon: ${customer.phone}`,
      ...lines.map((slot, index) => `\n${index + 1}. ${slot.room}\nDátum: ${slot.date}\nIdősáv: ${slot.time}\nÁr: ${slot.price}\nJóváhagyás: ${actionUrl("approve", slot.id)}\nElutasítás: ${actionUrl("reject", slot.id)}`),
      `\nTeljes összeg: ${currency.format(total)}`,
      `Összes Foglalás Jóváhagyása: ${actionUrl("approve-all")}`,
      "A foglalás csak e-mailes vagy telefonos megerősítés után végleges.",
      "A döntést a hivatkozás megnyitása után külön meg kell erősíteni. A hivatkozásokat ne továbbítsd.",
    ].join("\n"),
    html: `<!doctype html><html lang="hu"><body style="margin:0;background:#f7f7f7;font-family:Arial,sans-serif;color:#111">
      <div style="max-width:680px;margin:24px auto;padding:24px;background:white;border-radius:16px">
        <h1 style="border-bottom:4px solid #40CFD5;padding-bottom:16px">Új stúdiófoglalási igény</h1>
        <p>Jóváhagyásra vár. A foglalás csak e-mailes vagy telefonos megerősítés után végleges.</p>
        <h2>Ügyfél adatai</h2>
        <p><strong>Óratípus:</strong> ${escapeHtml(lessonLabel)}</p>
        <p><strong>Név:</strong> ${escapeHtml(customer.name)}<br>
        <strong>E-mail:</strong> ${escapeHtml(customer.email)}<br>
        <strong>Telefonszám:</strong> ${escapeHtml(customer.phone)}</p>
        ${lines.map((slot, index) => `<table role="presentation" style="width:100%;margin:16px 0;border:1px solid #ddd;border-radius:12px"><tr>
          <td style="padding:16px"><h3>${index + 1}. ${escapeHtml(slot.room)}</h3>
          <p>Dátum: ${escapeHtml(slot.date)}<br>Idősáv: ${slot.time}<br>Ár: <strong>${escapeHtml(slot.price)}</strong></p></td>
          <td style="padding:8px;text-align:center">${button("Jóváhagyás", "#40CFD5", actionUrl("approve", slot.id))}${button("Elutasítás", "#fecaca", actionUrl("reject", slot.id))}</td>
        </tr></table>`).join("")}
        <h2>Teljes összeg: ${escapeHtml(currency.format(total))}</h2>
        ${button("Összes Foglalás Jóváhagyása", "#40CFD5", actionUrl("approve-all"))}
        <p style="font-size:12px;color:#666">A döntést a megnyíló oldalon külön meg kell erősíteni. A gombok csak a függő időpontokat módosítják. A döntési hivatkozásokat ne továbbítsd.</p>
      </div></body></html>`,
  };
}
