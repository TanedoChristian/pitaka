"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/app/actions";
import ThemeToggle from "@/components/ThemeToggle";

const ITEMS = [
  { href: "/", label: "Overview", icon: "M4 19V9l8-6 8 6v10H4z" },
  { href: "/transactions", label: "Activity", icon: "M5 7h14M5 12h14M5 17h9" },
  { href: "/add", label: "Add", icon: "M12 5v14M5 12h14" },
  { href: "/accounts", label: "Accounts", icon: "M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8zM3 10h18" },
  { href: "/settings", label: "Settings", icon: "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM4 12h2.2M17.8 12H20M6.6 6.6l1.6 1.6M15.8 15.8l1.6 1.6M6.6 17.4l1.6-1.6M15.8 8.2l1.6-1.6" },
];

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

function Links() {
  const path = usePathname();
  return ITEMS.map((it) => {
    const active = it.href === "/" ? path === "/" : path.startsWith(it.href);
    return (
      <li key={it.href}>
        <Link href={it.href} aria-current={active ? "page" : undefined}>
          <Icon d={it.icon} />
          {it.label}
        </Link>
      </li>
    );
  });
}

export default function AppNav({ theme }: { theme: "light" | "dark" }) {
  return (
    <>
      <header className="topbar">
        <Link href="/" className="brand">
          <span className="brand-mark" aria-hidden="true">P</span>
          Pitaka
        </Link>
        <ThemeToggle theme={theme} />
      </header>

      <aside className="sidebar">
        <Link href="/" className="brand">
          <span className="brand-mark" aria-hidden="true">P</span>
          Pitaka
        </Link>
        <nav aria-label="Main">
          <ul className="side-nav">
            <Links />
          </ul>
        </nav>
        <div className="side-foot">
          <ThemeToggle theme={theme} />
          <form action={logout}>
            <button className="nav-logout" type="submit">Log out</button>
          </form>
        </div>
      </aside>

      <nav className="nav" aria-label="Main">
        <ul>
          <Links />
        </ul>
      </nav>
    </>
  );
}
