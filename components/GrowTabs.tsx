"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/grow", label: "Insights" },
  { href: "/grow/markets", label: "Markets" },
  { href: "/grow/forecast", label: "Forecast" },
  { href: "/grow/perks", label: "Card perks" },
  { href: "/grow/fuel", label: "Fuel" },
  { href: "/grow/news", label: "News & tips" },
];

export default function GrowTabs() {
  const path = usePathname();
  return (
    <nav className="grow-tabs" aria-label="Grow sections">
      {TABS.map((t) => {
        const active = t.href === "/grow" ? path === "/grow" : path.startsWith(t.href);
        return (
          <Link key={t.href} href={t.href} prefetch={false} aria-current={active ? "page" : undefined}>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
