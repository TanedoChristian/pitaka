"use client";

import { useState, useTransition } from "react";
import { setTheme } from "@/app/actions";

export default function ThemeToggle({ theme }: { theme: "light" | "dark" }) {
  const [current, setCurrent] = useState(theme);
  const [, start] = useTransition();
  const next = current === "light" ? "dark" : "light";

  return (
    <button
      type="button"
      className="theme-btn"
      aria-label={next === "dark" ? "Switch to dark mode" : "Switch to light mode"}
      onClick={() => {
        setCurrent(next);
        document.documentElement.setAttribute("data-theme", next);
        start(() => setTheme(next));
      }}
    >
      {current === "light" ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4 7 7 0 0 0 20 14.5z" />
        </svg>
      )}
    </button>
  );
}
