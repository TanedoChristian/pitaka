import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isAuthed } from "@/lib/auth";
import ThemeToggle from "@/components/ThemeToggle";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await isAuthed()) redirect("/");
  const theme = (await cookies()).get("pitaka_theme")?.value === "dark" ? "dark" : "light";
  return (
    <main className="login">
      <div className="login-tools">
        <ThemeToggle theme={theme} />
      </div>
      <div className="card">
        <div>
          <p className="eyebrow">Personal ledger</p>
          <h1>Pitaka</h1>
          <p className="muted small lede">Where did my money go?</p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
