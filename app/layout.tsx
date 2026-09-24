import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { Fraunces, Geist } from "next/font/google";
import "./globals.css";

const sans = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
});

const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: "Pitaka",
  description: "Where did my money go? Expense tracker fed by BPI alerts.",
  icons: { icon: "/icon.svg" },
  appleWebApp: { capable: true, title: "Pitaka", statusBarStyle: "default" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f1ea" },
    { media: "(prefers-color-scheme: dark)", color: "#12110f" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = (await cookies()).get("pitaka_theme")?.value === "dark" ? "dark" : "light";
  return (
    <html lang="en" data-theme={theme} className={`${sans.variable} ${display.variable}`}>
      <body>{children}</body>
    </html>
  );
}
