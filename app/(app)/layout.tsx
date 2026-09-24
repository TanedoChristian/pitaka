import { cookies } from "next/headers";
import AppNav from "@/components/AppNav";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireAuth();
  const theme = (await cookies()).get("pitaka_theme")?.value === "dark" ? "dark" : "light";
  return (
    <div className="shell">
      <AppNav theme={theme} />
      <main className="page">{children}</main>
    </div>
  );
}
