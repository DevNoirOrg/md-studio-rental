import type { Metadata } from "next";
import BookingPage from "@/components/BookingPage";
import { LocaleProvider } from "@/components/LocaleContext";
import { RoomsConfigProvider } from "@/components/RoomsConfigContext";
import { canonicalUrl } from "@/lib/base-path";
import { loadPublicRoomsConfig } from "@/lib/rooms-store";
import { localizePageContent } from "@/lib/page-content";
import { loadPublicPageContent } from "@/lib/page-content-store";

// A terembeállítások az adatbázisból jönnek (gyorsítótárazva; az admin mentése frissíti).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  alternates: {
    canonical: canonicalUrl("/"),
    languages: { hu: canonicalUrl("/"), en: canonicalUrl("/en"), "x-default": canonicalUrl("/") },
  },
};

export default async function StudioRentalPage() {
  const [config, content] = await Promise.all([loadPublicRoomsConfig(), loadPublicPageContent()]);
  return (
    <LocaleProvider locale="hu">
      <RoomsConfigProvider value={config}>
        <BookingPage content={localizePageContent(content, "hu")} />
      </RoomsConfigProvider>
    </LocaleProvider>
  );
}
