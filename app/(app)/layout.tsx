import BottomNav from "@/components/BottomNav";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireAuth();
  return (
    <>
      <main className="page">{children}</main>
      <BottomNav />
    </>
  );
}
