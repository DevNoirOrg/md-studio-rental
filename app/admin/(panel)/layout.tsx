import type { Metadata } from "next";
import AdminSidebar from "@/components/admin/AdminSidebar";
import { requireAdmin } from "@/lib/admin-session";

export const metadata: Metadata = {
  title: "Admin | Stúdió bérlés",
  robots: { index: false, follow: false },
};

/* Az admin panel váza: bal oldali menü + tartalom. Belépés nélkül a belépő oldalra irányít. */
export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  return (
    <div className="min-h-screen bg-mist text-ink md:flex">
      <AdminSidebar email={admin.email} />
      <main className="min-w-0 flex-1 px-4 pb-0 pt-6 md:px-10 md:pt-10">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
