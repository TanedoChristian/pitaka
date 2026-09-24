import { redirect } from "next/navigation";
import { isAuthed } from "@/lib/auth";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await isAuthed()) redirect("/");
  return (
    <main className="login">
      <div className="card">
        <div>
          <h1>Pitaka</h1>
          <p className="muted small" style={{ margin: "4px 0 0" }}>Where did my money go?</p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
