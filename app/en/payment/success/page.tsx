import type { Metadata } from "next";
import PaymentPage from "@/components/PaymentPage";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Payment successful – MD Dance Studio", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function EnPaymentSuccessPage({ searchParams }: { searchParams: Promise<{ r?: string; t?: string; hiba?: string }> }) {
  return <PaymentPage locale="en" variant="success" searchParams={await searchParams} />;
}
