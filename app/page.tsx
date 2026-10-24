import BookingPage from "@/components/BookingPage";
import { RoomsConfigProvider } from "@/components/RoomsConfigContext";
import { loadPublicRoomsConfig } from "@/lib/rooms-store";

// A terembeállítások az adatbázisból jönnek (gyorsítótárazva; az admin mentése frissíti).
export const dynamic = "force-dynamic";

export default async function StudioRentalPage() {
  const config = await loadPublicRoomsConfig();
  return (
    <RoomsConfigProvider value={config}>
      <BookingPage />
    </RoomsConfigProvider>
  );
}
