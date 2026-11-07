import type { Metadata } from "next";
import PaymentPage from "@/components/PaymentPage";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Payment – MD Dance Studio", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function EnPaymentPage({ searchParams }: { searchParams: Promise<{ r?: string; t?: string; hiba?: string; session_id?: string }> }) {
  return <PaymentPage locale="en" variant="pay" searchParams={await searchParams} />;
}
