import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { withBase } from "@/lib/base-path";
import type { Locale } from "@/lib/i18n";
import { verifyPaymentToken } from "@/lib/payment-rules";
import { amountOf, approvedSlots, loadRequest, schedulePaymentJobs, toEmailSlots } from "@/lib/payment-flow";
import { formatDay, formatDeadline, formatMoney } from "@/lib/customer-emails";
import { formatBookingHour } from "@/lib/studio-booking";
import { loadRoomsConfig } from "@/lib/rooms-store";
import { defaultRoomsConfig, localizeRoomsConfig } from "@/lib/room-config";

/*
  Fizetési oldal (a jóváhagyó e-mail linkje): /fizetes?r=…&t=… és /en/payment?r=…&t=…
  A „Fizetés” gomb mindig friss Stripe fizetési oldalt nyit (api/payment/checkout),
  így a link a határidőig nem jár le. A sikeres fizetés után ide tér vissza (variant="success").
*/

const texts = {
  hu: {
    kicker: "Stúdió bérlés",
    title: "Fizetés",
    successTitle: "Köszönjük a fizetést!",
    successPaid: "A fizetés sikeres, a foglalásod végleges. A bejutási infókat e-mailben elküldtük, a számlát külön e-mailben kapod meg.",
    successPending: "A fizetésedet feldolgozzuk — pár percen belül e-mailben megkapod a visszaigazolást és a bejutási infókat.",
    invalid: "Ez a fizetési link érvénytelen. Kérjük, használd az e-mailben kapott linket, vagy keress minket.",
    paid: "Ez a foglalás már ki van fizetve. Köszönjük!",
    expired: "A fizetési határidő lejárt, az időpontok felszabadultak. Ha továbbra is foglalnál, válassz újra időpontot.",
    unavailable: "Ehhez a foglaláshoz most nincs online fizetés. Kérjük, keress minket e-mailben vagy telefonon.",
    nothing: "Ehhez a foglaláshoz jelenleg nincs fizetendő időpont.",
    lead: "A foglalás a fizetéssel válik véglegessé. A fizetés a Stripe biztonságos oldalán, bankkártyával történik.",
    due: (d: string) => `Fizetési határidő: ${d}`,
    total: "Összesen",
    pay: "Fizetés bankkártyával",
    errors: {
      failed: "A fizetési oldal most nem nyitható meg. Kérjük, próbáld újra pár perc múlva.",
      "too-late": "Erre a foglalásra online már nem lehet fizetni (túl közel van az időpont). Kérjük, keress minket.",
      expired: "A fizetési határidő lejárt.",
      "not-awaiting": "Ez a foglalás most nem fizethető.",
      "nothing-to-pay": "Nincs fizetendő időpont.",
      link: "Ez a fizetési link érvénytelen.",
    } as Record<string, string>,
    back: "Vissza a foglalóoldalra",
  },
  en: {
    kicker: "Studio rental",
    title: "Payment",
    successTitle: "Thank you for your payment!",
    successPaid: "Your payment was successful and your booking is confirmed. We've emailed you the access details; your invoice will arrive in a separate email.",
    successPending: "We're processing your payment — you'll receive a confirmation and the access details by email within a few minutes.",
    invalid: "This payment link is invalid. Please use the link from your email, or get in touch with us.",
    paid: "This booking has already been paid. Thank you!",
    expired: "The payment deadline has passed and the times have been released. If you'd still like to book, please choose a time again.",
    unavailable: "Online payment isn't available for this booking. Please contact us by email or phone.",
    nothing: "There's nothing to pay for this booking at the moment.",
    lead: "Your booking becomes final once you've paid. Payment is made by card on Stripe's secure page.",
    due: (d: string) => `Payment deadline: ${d}`,
    total: "Total",
    pay: "Pay by card",
    errors: {
      failed: "The payment page can't be opened right now. Please try again in a few minutes.",
      "too-late": "This booking can no longer be paid online (the time is too close). Please contact us.",
      expired: "The payment deadline has passed.",
      "not-awaiting": "This booking can't be paid at the moment.",
      "nothing-to-pay": "There's nothing to pay.",
      link: "This payment link is invalid.",
    } as Record<string, string>,
    back: "Back to booking",
  },
} as const;

export default async function PaymentPage({ locale, variant, searchParams }: {
  locale: Locale;
  variant: "pay" | "success";
  searchParams: { r?: string; t?: string; hiba?: string };
}) {
  const t = texts[locale];
  const id = searchParams.r ?? "";
  const token = searchParams.t ?? "";
  const request = verifyPaymentToken(id, token) ? await loadRequest(id).catch(() => null) : null;
  schedulePaymentJobs();
  let config = defaultRoomsConfig;
  try {
    config = await loadRoomsConfig();
  } catch {
    // alapértelmezett teremnevekkel is működik
  }
  const slots = request ? toEmailSlots(approvedSlots(request), localizeRoomsConfig(config, locale)) : [];
  const total = request ? amountOf(approvedSlots(request)) : 0;

  let message: string | null = null;
  let canPay = false;
  if (variant === "success") {
    message = request?.payment_status === "paid" ? t.successPaid : t.successPending;
  } else if (!request) message = t.invalid;
  else if (request.payment_status === "paid") message = t.paid;
  else if (request.payment_status === "expired") message = t.expired;
  else if (request.payment_status !== "awaiting") message = t.unavailable;
  else if (!slots.length) message = t.nothing;
  else canPay = true;
  const error = searchParams.hiba ? t.errors[searchParams.hiba] ?? t.errors.failed : null;

  return (
    <main className="min-h-screen bg-[#f7f7f7]">
      <SiteHeader locale={locale} />
      <section className="px-5 pb-24 pt-36 sm:pt-40">
        <div className="mx-auto max-w-2xl rounded-[2rem] bg-white p-6 shadow-[0_10px_36px_rgba(0,0,0,0.09)] sm:p-10">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#179da3]">{t.kicker}</p>
          <h1 className="section-title mt-3 text-4xl text-black sm:text-5xl">{variant === "success" ? t.successTitle : t.title}</h1>
          {error && variant === "pay" && (
            <p role="alert" className="mt-6 rounded-xl border border-red-300 bg-red-50 p-4 text-sm font-semibold text-red-800">{error}</p>
          )}
          {message && <p className="mt-6 text-base leading-relaxed text-gray-700">{message}</p>}
          {slots.length > 0 && (
            <>
              <ul className="mt-8 space-y-2">
                {slots.map((s) => (
                  <li key={`${s.roomLabel}-${s.date}-${s.hour}`} className="flex items-baseline justify-between gap-4 rounded-2xl bg-gray-50 px-4 py-3">
                    <span className="text-sm">
                      <strong className="block text-black">{s.roomLabel}</strong>
                      <span className="text-gray-600">{formatDay(s.date, locale)}, {formatBookingHour(s.hour)}–{formatBookingHour(s.hour + s.durationMinutes / 60)}</span>
                    </span>
                    <span className="shrink-0 font-extrabold text-[#087c81]">{formatMoney(s.price, locale)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 flex justify-between border-t border-gray-200 pt-4 text-lg font-extrabold">
                <span>{t.total}</span><span className="text-[#087c81]">{formatMoney(total, locale)}</span>
              </p>
            </>
          )}
          {canPay && request && (
            <>
              <p className="mt-6 text-sm leading-relaxed text-gray-600">{t.lead}</p>
              {request.payment_due && (
                <p className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">{t.due(formatDeadline(request.payment_due, locale))}</p>
              )}
              <form action={withBase("/api/payment/checkout")} method="post" className="mt-8">
                <input type="hidden" name="r" value={id} />
                <input type="hidden" name="t" value={token} />
                <button type="submit"
                  className="w-full rounded-2xl bg-black px-5 py-4 text-sm font-extrabold uppercase tracking-[0.2em] text-white shadow-xl transition-colors hover:bg-[#40CFD5] hover:text-black focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#40CFD5]/40">
                  {t.pay}
                </button>
              </form>
            </>
          )}
          <a href={withBase(locale === "en" ? "/en" : "/")} className="mt-8 inline-block text-sm font-bold text-[#087c81] underline underline-offset-2">{t.back}</a>
        </div>
      </section>
      <SiteFooter locale={locale} />
    </main>
  );
}
