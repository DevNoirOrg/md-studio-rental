import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin-session";
import { bookingStore } from "@/lib/booking-store";
import AdminsEditor from "./AdminsEditor";

export const metadata: Metadata = { title: "Adminok | Stúdió bérlés admin" };

export default async function AdminsPage() {
  const me = await requireAdmin();
  const rows = await bookingStore<{ email: string; created_at: string }[]>("admins?select=email,created_at&order=created_at");
  return <AdminsEditor me={me.email} admins={rows.map((r) => ({ email: r.email, createdAt: r.created_at }))} />;
}
