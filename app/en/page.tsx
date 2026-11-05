import type { Metadata } from "next";
import BookingPage from "@/components/BookingPage";
import { LocaleProvider } from "@/components/LocaleContext";
import { RoomsConfigProvider } from "@/components/RoomsConfigContext";
import { canonicalUrl } from "@/lib/base-path";
import { localizeRoomsConfig } from "@/lib/room-config";
import { loadPublicRoomsConfig } from "@/lib/rooms-store";
import { localizePageContent } from "@/lib/page-content";
import { loadPublicPageContent } from "@/lib/page-content-store";

// Az angol foglaló: ugyanaz, mint a magyar, a termek angol szövegeivel (ami nincs lefordítva, magyarul marad).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  alternates: {
    canonical: canonicalUrl("/en"),
    languages: { hu: canonicalUrl("/"), en: canonicalUrl("/en"), "x-default": canonicalUrl("/") },
  },
};

export default async function EnglishStudioRentalPage() {
  const [rooms, content] = await Promise.all([loadPublicRoomsConfig(), loadPublicPageContent()]);
  const config = localizeRoomsConfig(rooms, "en");
  return (
    <LocaleProvider locale="en">
      <RoomsConfigProvider value={config}>
        <BookingPage content={localizePageContent(content, "en")} />
      </RoomsConfigProvider>
    </LocaleProvider>
  );
}
